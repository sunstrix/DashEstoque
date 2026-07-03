/**
 * draftService.js
 * Responsável por processar a planilha draft de custos.
 * - Baixa a planilha draft via downloadService.
 * - Faz o parsing do Excel usando a biblioteca xlsx (SheetJS).
 * - Mapeia os nomes das lojas para os 17 PDVs definidos em constants.js.
 * - Retorna uma estrutura de dados contendo o custo por produto (EAN) e PDV.
 */

const XLSX = require('xlsx');
const { PDV_MAPPING } = require('../config/constants');
const { downloadDraftSpreadsheet } = require('./downloadService');

/**
 * Cria um mapa de pesquisa rápida para encontrar o PDV a partir do nome da loja.
 * @returns {Object} - Objeto onde a chave é o nome da loja (maiúsculo) e o valor é o PDV.
 */
function buildLojaToPdvMap() {
    const lojaToPdv = {};
    for (const [pdv, lojas] of Object.entries(PDV_MAPPING)) {
        for (const loja of lojas) {
            // Normaliza o nome da loja para maiúsculas e remove espaços extras
            const normalizedLoja = loja.toString().toUpperCase().trim();
            lojaToPdv[normalizedLoja] = pdv;
        }
    }
    return lojaToPdv;
}

/**
 * Processa a planilha draft de custos.
 * @returns {Promise<Array<Object>>} - Array de objetos no formato { pdv, ean, custo }.
 */
async function processDraftCosts() {
    console.log('[draftService] Iniciando processamento da planilha draft de custos...');
    
    // 1. Baixa a planilha draft (retorna um Buffer)
    const buffer = await downloadDraftSpreadsheet();
    
    // 2. Faz o parsing do buffer para um workbook do Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // 3. Lê a primeira aba da planilha draft (ajuste o nome da aba se necessário)
    const firstSheetName = workbook.SheetNames[0];
    console.log(`[draftService] Lendo aba: ${firstSheetName}`);
    const sheet = workbook.Sheets[firstSheetName];
    
    // 4. Converte a aba para um array de objetos (JSON)
    // defval: '' garante que células vazias sejam preenchidas com string vazia em vez de undefined
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    
    if (jsonData.length === 0) {
        console.warn('[draftService] A planilha draft está vazia ou não foi possível ler os dados.');
        return [];
    }
    
    // 5. Mapeia as lojas para os PDVs
    const lojaToPdvMap = buildLojaToPdvMap();
    const draftCosts = [];
    
    // 6. Itera sobre as linhas para extrair Loja, EAN/Código e Custo
    for (const row of jsonData) {
        // Tenta encontrar as colunas de Loja, EAN/Código e Custo (case-insensitive)
        const keys = Object.keys(row);
        
        const findKey = (patterns) => {
            return keys.find(k => patterns.some(p => k.toUpperCase().trim() === p.toUpperCase().trim()));
        };

        const lojaKey = findKey(['Loja', 'LOJA', 'Ponto de Venda', 'PDV Nome']);
        const eanKey = findKey(['EAN', 'ean', 'Código', 'CODIGO', 'Codigo', 'SKU', 'sku']);
        const custoKey = findKey(['Custo', 'CUSTO', 'Preço Custo', 'Valor Custo', 'Custo Unitário']);

        if (!lojaKey || !eanKey || !custoKey) {
            // Se não encontrar as colunas na primeira linha, loga um aviso mas continua
            // (O sheet_to_json usa os cabeçalhos da primeira linha como chaves)
            continue; 
        }

        const loja = String(row[lojaKey] || '').trim();
        const ean = String(row[eanKey] || '').trim();
        const custoRaw = row[custoKey];
        
        // Converte o custo para número (tratando vírgula como separador decimal, comum no Brasil)
        let custo = 0;
        if (custoRaw !== '' && custoRaw !== null && custoRaw !== undefined) {
            const custoStr = String(custoRaw).replace(',', '.').trim();
            custo = parseFloat(custoStr);
        }

        // Validações básicas
        if (!loja || !ean || isNaN(custo)) {
            continue;
        }

        // Verifica se a loja pertence a algum PDV mapeado
        const normalizedLoja = loja.toUpperCase();
        const pdv = lojaToPdvMap[normalizedLoja];

        if (pdv) {
            draftCosts.push({
                pdv: pdv,
                ean: ean,
                custo: custo
            });
        } else {
            // Log opcional para lojas não mapeadas (ajuda no debug)
            // console.warn(`[draftService] Loja não mapeada para nenhum PDV: ${loja}`);
        }
    }
    
    console.log(`[draftService] Processamento concluído. ${draftCosts.length} registros de custo extraídos.`);
    return draftCosts;
}

module.exports = {
    processDraftCosts
};