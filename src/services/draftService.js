/**
 * draftService.js
 * Responsável por processar a planilha draft de custos.
 * - Baixa a planilha draft via downloadService.
 * - Faz o parsing do Excel usando a biblioteca xlsx (SheetJS).
 * - Mapeia os nomes das lojas para os 17 PDVs definidos em constants.js.
 * - Retorna uma estrutura de dados contendo o custo por produto (EAN) e PDV.
 * 
 * ROBUSTEZ: Se a planilha draft falhar ao baixar (URL ausente, erro de rede, etc.),
 * o serviço retorna um array vazio [] em vez de quebrar o dashboard.
 * Neste caso, o dataService.js usará apenas o preço de tabela como custo final.
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
 * Busca a chave de uma coluna de forma flexível (case-insensitive).
 * @param {Array<string>} keys - Array de chaves (cabeçalhos) da linha.
 * @param {Array<string>} patterns - Padrões possíveis para a coluna.
 * @returns {string|undefined} - A chave encontrada ou undefined.
 */
function findColumnKey(keys, patterns) {
    return keys.find(k => patterns.some(p => k.toUpperCase().trim() === p.toUpperCase().trim()));
}

/**
 * Processa a planilha draft de custos.
 * @returns {Promise<Array<Object>>} - Array de objetos no formato { pdv, ean, custo }.
 *                                     Retorna array vazio [] se a planilha falhar ao baixar.
 */
async function processDraftCosts() {
    console.log('[draftService] Iniciando processamento da planilha draft de custos...');
    
    // =========================================================================
    // TRATAMENTO DE ERRO INDIVIDUAL (FALLBACK SE O DOWNLOAD FALHAR)
    // =========================================================================
    let buffer;
    try {
        buffer = await downloadDraftSpreadsheet();
    } catch (error) {
        console.warn(`[draftService] ⚠️ Falha ao baixar planilha draft: ${error.message}`);
        console.warn('[draftService] ⚠️ Continuando com custos draft = 0 para todos os itens.');
        return [];
    }
    
    // =========================================================================
    // PARSING DO EXCEL (Lógica original preservada)
    // =========================================================================
    // Faz o parsing do buffer para um workbook do Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // Lê a primeira aba da planilha draft (ajuste o nome da aba se necessário)
    const firstSheetName = workbook.SheetNames[0];
    console.log(`[draftService] Lendo aba: ${firstSheetName}`);
    const sheet = workbook.Sheets[firstSheetName];
    
    // Converte a aba para um array de objetos (JSON)
    // defval: '' garante que células vazias sejam preenchidas com string vazia em vez de undefined
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    
    if (jsonData.length === 0) {
        console.warn('[draftService] A planilha draft está vazia ou não foi possível ler os dados.');
        return [];
    }
    
    // Mapeia as lojas para os PDVs
    const lojaToPdvMap = buildLojaToPdvMap();
    const draftCosts = [];
    
    // Itera sobre as linhas para extrair Loja, EAN/Código e Custo
    for (const row of jsonData) {
        // Tenta encontrar as colunas de Loja, EAN/Código e Custo (case-insensitive)
        const keys = Object.keys(row);
        
        const lojaKey = findColumnKey(keys, ['Loja', 'LOJA', 'Ponto de Venda', 'PDV Nome']);
        const eanKey = findColumnKey(keys, ['EAN', 'ean', 'Código', 'CODIGO', 'Codigo', 'SKU', 'sku']);
        const custoKey = findColumnKey(keys, ['Custo', 'CUSTO', 'Preço Custo', 'Valor Custo', 'Custo Unitário']);

        if (!lojaKey || !eanKey || !custoKey) {
            // Se não encontrar as colunas na primeira linha, loga um aviso mas continua
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