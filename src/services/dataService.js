/**
 * dataService.js
 * Núcleo da lógica de negócio do projeto.
 * - Orquestra o download e parsing das 3 planilhas.
 * - Aplica a regra de custo (MAIOR entre preço de tabela e custo draft, ou apenas draft se tabela não existir).
 * - Calcula todos os KPIs financeiros e de estoque.
 * - Estrutura os dados para consumo pelo frontend e aplicação de filtros (PDV/Marca).
 */

const XLSX = require('xlsx');
const { SHEET_NAMES } = require('../config/constants');
const { downloadMainSpreadsheet } = require('./downloadService');
const { processDraftCosts } = require('./draftService');
const { processSafetyStock } = require('./safetyStockService');
const { getBrasiliaTime, getCurrentTimestampMs } = require('./timeService');

/**
 * Busca a chave de uma coluna de forma flexível (case-insensitive).
 * @param {Object} row - Objeto de linha do sheet_to_json.
 * @param {Array<string>} patterns - Padrões possíveis para a coluna.
 * @returns {string|undefined} - A chave encontrada.
 */
function findKey(row, patterns) {
    const keys = Object.keys(row);
    return keys.find(k => patterns.some(p => k.toUpperCase().trim() === p.toUpperCase().trim()));
}

/**
 * Converte valor numérico brasileiro (string ou number) para float seguro.
 */
function toFloat(val) {
    if (val === null || val === undefined || val === '') return 0;
    const str = String(val).replace(/\s/g, '').replace(',', '.');
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Processa a planilha principal (abas BOTICARIO, EUDORA, QUEM_DISSE_BERENICE).
 */
async function parseMainSpreadsheet(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const items = [];

    const brandMap = {
        [SHEET_NAMES.MAIN.BOTICARIO]: 'O Boticário',
        [SHEET_NAMES.MAIN.EUDORA]: 'Eudora',
        [SHEET_NAMES.MAIN.QUEM_DISSE_BERENICE]: 'Quem Disse Berenice?'
    };

    for (const sheetName of Object.keys(brandMap)) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;

        const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const marca = brandMap[sheetName];

        for (const row of rawData) {
            const ean = String(row[findKey(row, ['EAN', 'CÓDIGO', 'CODIGO', 'SKU', 'CÓD. EAN'])] || '').trim();
            if (!ean) continue;

            const qtdEstoque = toFloat(row[findKey(row, ['QTD', 'ESTOQUE', 'QUANTIDADE', 'QTD ESTOQUE', 'SALDO'])]);
            const precoTabela = toFloat(row[findKey(row, ['PREÇO TABELA', 'PRECO TABELA', 'VALOR', 'PREÇO', 'PRECO'])]);
            const curva = String(row[findKey(row, ['CURVA', 'CLASSE', 'CLASSIFICAÇÃO', 'CLASSIFICACAO'])] || 'E').trim().toUpperCase();
            const categoria = String(row[findKey(row, ['CATEGORIA', 'GRUPO', 'FAMÍLIA', 'FAMILIA'])] || 'Outros').trim();
            const produto = String(row[findKey(row, ['PRODUTO', 'NOME', 'DESCRIÇÃO', 'DESCRICAO', 'ITEM'])] || '').trim();

            items.push({ ean, produto, marca, qtdEstoque, precoTabela, curva, categoria });
        }
    }

    return items;
}

/**
 * Orquestrador principal. Baixa, cruza dados, aplica regras e calcula KPIs.
 */
async function processAllData() {
    console.log('[dataService] 🔄 Iniciando processamento completo dos dados...');
    const startMs = getCurrentTimestampMs();

    // 1. Downloads e parsing em paralelo (independentes)
    const [mainBuffer, draftCosts, safetyStockMap] = await Promise.all([
        downloadMainSpreadsheet(),
        processDraftCosts(),
        processSafetyStock()
    ]);

    // 2. Parse planilha principal
    const mainItems = await parseMainSpreadsheet(mainBuffer);

    // 3. Indexa custos draft por EAN (primeiro valor encontrado por EAN)
    const draftByEAN = {};
    for (const dc of draftCosts) {
        if (!draftByEAN[dc.ean]) draftByEAN[dc.ean] = dc.custo;
    }

    // 4. Aplica regra de negócio e calcula KPIs por item
    const processedItems = [];
    for (const item of mainItems) {
        const custoDraft = draftByEAN[item.ean] || 0;
        let custoFinal = 0;

        // 📜 REGRA DE CUSTO FIEL AO PYTHON ORIGINAL:
        // Se não houver preço de tabela -> usa custo draft
        // Se houver os dois -> usa o MAIOR valor
        if (item.precoTabela > 0 && custoDraft > 0) {
            custoFinal = Math.max(item.precoTabela, custoDraft);
        } else if (custoDraft > 0) {
            custoFinal = custoDraft;
        } else {
            custoFinal = item.precoTabela || 0;
        }

        const estoqueSeguranca = safetyStockMap[item.ean] || 0;

        const qtdExcesso = Math.max(0, item.qtdEstoque - estoqueSeguranca);
        const qtdFalta = Math.max(0, estoqueSeguranca - item.qtdEstoque);
        const valorExcesso = qtdExcesso * custoFinal;
        const valorFalta = qtdFalta * custoFinal;
        const valorEstoqueAtual = item.qtdEstoque * custoFinal;
        const valorEstoqueMinimo = estoqueSeguranca * custoFinal;
        const valorCustoEstoqueAtual = valorEstoqueAtual; // Alias conforme nomeação do KPI original

        processedItems.push({
            ...item,
            custoDraft,
            custoFinal,
            estoqueSeguranca,
            qtdExcesso,
            qtdFalta,
            valorExcesso,
            valorFalta,
            valorEstoqueAtual,
            valorEstoqueMinimo,
            valorCustoEstoqueAtual
        });
    }

    // 5. Consolida KPIs totais e agrupa por dimensões (Marca, Curva, Categoria)
    const consolidatedKPIs = {
        Valor_Estoque_Atual: 0,
        Valor_Estoque_Minimo: 0,
        Qtd_Excesso: 0,
        Valor_Excesso: 0,
        Qtd_Falta: 0,
        Valor_Falta: 0,
        Valor_Custo_Estoque_Atual: 0
    };

    const byBrand = {};
    const byCurve = {};
    const byCategory = {};
    const excessosCriticos = [];
    const faltasPorMarca = {};

    for (const item of processedItems) {
        // Soma KPIs globais
        consolidatedKPIs.Valor_Estoque_Atual += item.valorEstoqueAtual;
        consolidatedKPIs.Valor_Estoque_Minimo += item.valorEstoqueMinimo;
        consolidatedKPIs.Qtd_Excesso += item.qtdExcesso;
        consolidatedKPIs.Valor_Excesso += item.valorExcesso;
        consolidatedKPIs.Qtd_Falta += item.qtdFalta;
        consolidatedKPIs.Valor_Falta += item.valorFalta;
        consolidatedKPIs.Valor_Custo_Estoque_Atual += item.valorCustoEstoqueAtual;

        // Agrupa por Marca (para gráfico comparativo)
        if (!byBrand[item.marca]) byBrand[item.marca] = { qtdItens: 0, custoTotal: 0 };
        byBrand[item.marca].qtdItens += 1;
        byBrand[item.marca].custoTotal += item.valorEstoqueAtual;

        // Agrupa por Curva (A/B/C/E)
        const cNorm = item.curva || 'E';
        if (!byCurve[cNorm]) byCurve[cNorm] = { custoTotal: 0 };
        byCurve[cNorm].custoTotal += item.valorCustoEstoqueAtual;

        // Agrupa por Categoria
        const cat = item.categoria || 'Outros';
        if (!byCategory[cat]) byCategory[cat] = { qtdTotal: 0 };
        byCategory[cat].qtdTotal += item.qtdEstoque;

        // Tabela de excessos críticos (valor > 0)
        if (item.qtdExcesso > 0) excessosCriticos.push(item);
        
        // Tabela de faltas por marca
        if (item.qtdFalta > 0) {
            if (!faltasPorMarca[item.marca]) {
                faltasPorMarca[item.marca] = { qtdTotal: 0, valorTotal: 0, itensFaltantes: 0 };
            }
            faltasPorMarca[item.marca].qtdTotal += item.qtdFalta;
            faltasPorMarca[item.marca].valorTotal += item.valorFalta;
            faltasPorMarca[item.marca].itensFaltantes += 1;
        }
    }

    // Ordena excessos por valor decrescente (limita a 100 para performance no frontend)
    excessosCriticos.sort((a, b) => b.valorExcesso - a.valorExcesso);

    const endMs = getCurrentTimestampMs();
    const processingTime = ((endMs - startMs) / 1000).toFixed(2);

    console.log(`[dataService] ✅ Processamento concluído em ${processingTime}s. ${processedItems.length} itens processados.`);

    return {
        timestamp: getBrasiliaTime(),
        consolidatedKPIs,
        byBrand,
        byCurve,
        byCategory,
        excessosCriticos: excessosCriticos.slice(0, 100),
        faltasPorMarca,
        allItems: processedItems, // Mantido para filtros dinâmicos no frontend
        processingTime
    };
}

module.exports = {
    processAllData
};