/**
 * safetyStockService.js
 * Responsável por processar a planilha de estoque de segurança.
 * - Baixa a planilha via downloadService.
 * - Faz o parsing das abas BOT, EUD e QDB.
 * - Extrai o estoque de segurança por EAN/Código.
 * - Retorna um mapa consolidado (EAN -> Estoque de Segurança) para uso no dataService.
 */

const XLSX = require('xlsx');
const { SHEET_NAMES } = require('../config/constants');
const { downloadSafetySpreadsheet } = require('./downloadService');

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
 * Processa uma aba individual da planilha de estoque de segurança.
 * @param {Object} sheet - Objeto da aba do workbook.
 * @param {string} sheetName - Nome da aba (para logs).
 * @returns {Array<Object>} - Array de objetos { ean, seguranca }.
 */
function processSafetySheet(sheet, sheetName) {
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const extractedData = [];

    if (jsonData.length === 0) {
        console.warn(`[safetyStockService] A aba ${sheetName} está vazia.`);
        return extractedData;
    }

    const keys = Object.keys(jsonData[0]);
    
    const eanKey = findColumnKey(keys, ['EAN', 'ean', 'Código', 'CODIGO', 'Codigo', 'SKU', 'sku', 'Código EAN', 'CODIGO EAN']);
    const segurancaKey = findColumnKey(keys, ['Estoque de Segurança', 'ESTOQUE DE SEGURANÇA', 'Estoque Seguranca', 'ESTOQUE SEGURANCA', 'Segurança', 'SEGURANCA', 'Minimo', 'MÍNIMO', 'Min', 'Qtd Minima']);

    if (!eanKey || !segurancaKey) {
        console.warn(`[safetyStockService] Colunas não encontradas na aba ${sheetName}. EAN Key: ${eanKey}, Seguranca Key: ${segurancaKey}`);
        return extractedData;
    }

    for (const row of jsonData) {
        const ean = String(row[eanKey] || '').trim();
        const segurancaRaw = row[segurancaKey];

        if (!ean) continue;

        let seguranca = 0;
        if (segurancaRaw !== '' && segurancaRaw !== null && segurancaRaw !== undefined) {
            const segurancaStr = String(segurancaRaw).replace(',', '.').trim();
            seguranca = parseFloat(segurancaStr);
            if (isNaN(seguranca)) seguranca = 0;
        }

        extractedData.push({ ean, seguranca });
    }

    console.log(`[safetyStockService] Aba ${sheetName} processada: ${extractedData.length} itens extraídos.`);
    return extractedData;
}

/**
 * Processa a planilha de estoque de segurança completa.
 * @returns {Promise<Object>} - Objeto onde a chave é o EAN e o valor é o estoque de segurança (número).
 */
async function processSafetyStock() {
    console.log('[safetyStockService] Iniciando processamento da planilha de estoque de segurança...');
    
    const buffer = await downloadSafetySpreadsheet();
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // Mapeamento das abas da planilha de segurança
    const safetySheetsMap = {
        [SHEET_NAMES.SAFETY.BOT]: 'BOT',
        [SHEET_NAMES.SAFETY.EUD]: 'EUD',
        [SHEET_NAMES.SAFETY.QDB]: 'QDB'
    };

    const safetyStockMap = {};

    for (const [sheetName, label] of Object.entries(safetySheetsMap)) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            console.warn(`[safetyStockService] Aba '${sheetName}' não encontrada na planilha de segurança.`);
            continue;
        }

        const items = processSafetySheet(sheet, label);
        for (const item of items) {
            // Se o EAN já existir, podemos somar ou sobrescrever. 
            // Assumindo que o EAN é único globalmente, apenas atribuímos.
            safetyStockMap[item.ean] = item.seguranca;
        }
    }

    const totalItems = Object.keys(safetyStockMap).length;
    console.log(`[safetyStockService] Processamento concluído. Mapa de estoque de segurança criado com ${totalItems} EANs únicos.`);
    
    return safetyStockMap;
}

module.exports = {
    processSafetyStock
};