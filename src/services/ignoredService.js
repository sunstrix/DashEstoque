/**
 * ignoredService.js
 * Responsável por processar a planilha de itens ignorados (IGNORADOS.xlsx).
 * - Baixa a planilha via downloadService (usando função wrapper downloadIgnoredItemsSpreadsheet).
 * - Extrai todos os EANs/SKUs que devem ser excluídos do dashboard.
 * - Retorna um Set de SKUs ignorados para busca O(1) no dataService.
 * 
 * Esses itens (geralmente sacolas) não fazem sentido para as análises
 * e devem ser completamente excluídos de todos os cálculos, KPIs, gráficos e tabelas.
 */

const XLSX = require('xlsx');
const { downloadIgnoredItemsSpreadsheet } = require('./downloadService');

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
 * Processa a planilha de itens ignorados.
 * @returns {Promise<Set<string>>} - Set contendo todos os EANs/SKUs que devem ser ignorados.
 */
async function processIgnoredItems() {
    console.log('[ignoredService] Iniciando processamento da planilha de itens ignorados...');
    
    // CORREÇÃO: usa função wrapper downloadIgnoredItemsSpreadsheet() em vez de
    // downloadWithRetry(SPREADSHEET_URLS.IGNORED), alinhando com o padrão dos outros services
    // (draftService.js e safetyStockService.js) e garantindo que a URL seja lida diretamente
    // de process.env.SPREADSHEET_IGNORED_URL no downloadService.js.
    const buffer = await downloadIgnoredItemsSpreadsheet();
    
    // Faz o parsing do buffer para um workbook do Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // Lê a primeira aba da planilha (ajuste o nome da aba se necessário)
    const firstSheetName = workbook.SheetNames[0];
    console.log(`[ignoredService] Lendo aba: ${firstSheetName}`);
    const sheet = workbook.Sheets[firstSheetName];
    
    // Converte a aba para um array de objetos (JSON)
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    
    if (jsonData.length === 0) {
        console.warn('[ignoredService] A planilha de ignorados está vazia ou não foi possível ler os dados.');
        return new Set();
    }
    
    // Busca a coluna de EAN/SKU de forma flexível
    const keys = Object.keys(jsonData[0]);
    const eanKey = findColumnKey(keys, [
        'EAN', 'ean', 'Código', 'CODIGO', 'Codigo', 
        'SKU', 'sku', 'Código EAN', 'CODIGO EAN',
        'Código do Produto', 'CODIGO DO PRODUTO',
        'Produto', 'PRODUTO'
    ]);
    
    if (!eanKey) {
        console.warn('[ignoredService] Coluna de EAN/SKU não encontrada na planilha de ignorados.');
        return new Set();
    }
    
    // Extrai todos os EANs/SKUs e os coloca em um Set (para busca O(1))
    const ignoredSet = new Set();
    
    for (const row of jsonData) {
        const ean = String(row[eanKey] || '').trim();
        
        if (ean && ean !== '') {
            // Normaliza o EAN (remove espaços, hífens, etc.)
            const normalizedEan = ean.replace(/[\s\-\.]/g, '');
            ignoredSet.add(normalizedEan);
        }
    }
    
    console.log(`[ignoredService] Processamento concluído. ${ignoredSet.size} SKUs/EANs marcados como ignorados.`);
    
    return ignoredSet;
}

module.exports = {
    processIgnoredItems
};