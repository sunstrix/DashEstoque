/**
 * downloadService.js
 * Responsável por baixar as planilhas do Google Sheets com retry automático.
 * Utiliza axios para as requisições HTTP e retorna os dados como Buffer
 * para que os outros services possam fazer o parsing com a biblioteca xlsx.
 */

const axios = require('axios');
const { SPREADSHEET_URLS, RETRY_CONFIG } = require('../config/constants');

/**
 * Realiza o download de uma URL com retry automático em caso de falha.
 * @param {string} url - URL pública da planilha (export xlsx).
 * @returns {Promise<Buffer>} - Buffer contendo os dados da planilha.
 */
async function downloadWithRetry(url) {
    let lastError;
    
    for (let attempt = 1; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
        try {
            console.log(`[downloadService] Tentativa ${attempt}/${RETRY_CONFIG.MAX_RETRIES} de download...`);
            
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: RETRY_CONFIG.TIMEOUT_MS,
                headers: {
                    'User-Agent': 'DashEstoque-NodeJS/1.0'
                }
            });
            
            console.log(`[downloadService] Download concluído com sucesso.`);
            return Buffer.from(response.data);
            
        } catch (error) {
            lastError = error;
            console.warn(`[downloadService] Falha na tentativa ${attempt}. Erro: ${error.message}`);
            
            // Se não for a última tentativa, aguarda antes de tentar novamente
            if (attempt < RETRY_CONFIG.MAX_RETRIES) {
                console.log(`[downloadService] Aguardando ${RETRY_CONFIG.RETRY_DELAY_MS}ms para próxima tentativa...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.RETRY_DELAY_MS));
            }
        }
    }
    
    // Se todas as tentativas falharem, lança um erro
    throw new Error(`[downloadService] Falha ao baixar planilha após ${RETRY_CONFIG.MAX_RETRIES} tentativas. Último erro: ${lastError.message}`);
}

/**
 * Baixa a planilha principal (Estoque, Preço Tabela, Classe, Categoria).
 * @returns {Promise<Buffer>}
 */
async function downloadMainSpreadsheet() {
    console.log('[downloadService] Iniciando download da planilha principal...');
    return downloadWithRetry(SPREADSHEET_URLS.MAIN);
}

/**
 * Baixa a planilha de estoque de segurança.
 * @returns {Promise<Buffer>}
 */
async function downloadSafetySpreadsheet() {
    console.log('[downloadService] Iniciando download da planilha de estoque de segurança...');
    return downloadWithRetry(SPREADSHEET_URLS.SAFETY);
}

/**
 * Baixa a planilha draft de custos.
 * @returns {Promise<Buffer>}
 */
async function downloadDraftSpreadsheet() {
    console.log('[downloadService] Iniciando download da planilha draft de custos...');
    return downloadWithRetry(SPREADSHEET_URLS.DRAFT);
}

module.exports = {
    downloadMainSpreadsheet,
    downloadSafetySpreadsheet,
    downloadDraftSpreadsheet
};