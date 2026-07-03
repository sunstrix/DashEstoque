/**
 * downloadService.js
 * Responsável por baixar as planilhas do Google Sheets OU SharePoint com retry automático.
 * - Detecta automaticamente se a URL é do SharePoint e aplica headers/configurações específicas.
 * - Utiliza axios para as requisições HTTP e retorna os dados como Buffer
 *   para que os outros services possam fazer o parsing com a biblioteca xlsx.
 */

const axios = require('axios');
const { SPREADSHEET_URLS, RETRY_CONFIG } = require('../config/constants');

/**
 * Detecta se a URL pertence ao SharePoint (Microsoft 365).
 * @param {string} url - URL da planilha.
 * @returns {boolean}
 */
function isSharepointUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
        lower.includes('.sharepoint.com/') ||
        lower.includes('-my.sharepoint.com/') ||
        lower.includes('1drv.ms/') || // OneDrive pessoal compartilhado
        lower.includes('onedrive.live.com/')
    );
}

/**
 * Garante que a URL do SharePoint tenha o parâmetro ?download=1 para forçar o download direto.
 * @param {string} url - URL original.
 * @returns {string} - URL com ?download=1 adicionado (se aplicável).
 */
function ensureSharepointDownloadParam(url) {
    if (!isSharepointUrl(url)) return url;
    
    // Se já tem o parâmetro download, retorna como está
    if (url.includes('download=1')) return url;
    
    // Adiciona ?download=1 (ou &download=1 se já houver query string)
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}download=1`;
}

/**
 * Realiza o download de uma URL com retry automático em caso de falha.
 * Suporta Google Sheets e SharePoint (com redirects e User-Agent de navegador).
 * @param {string} url - URL pública da planilha.
 * @returns {Promise<Buffer>} - Buffer contendo os dados da planilha.
 */
async function downloadWithRetry(url) {
    let lastError;
    
    // Pré-processa a URL se for SharePoint
    const finalUrl = ensureSharepointDownloadParam(url);
    const isSharepoint = isSharepointUrl(url);
    
    if (isSharepoint) {
        console.log(`[downloadService] URL do SharePoint detectada. Download direto habilitado.`);
    }
    
    for (let attempt = 1; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
        try {
            console.log(`[downloadService] Tentativa ${attempt}/${RETRY_CONFIG.MAX_RETRIES} de download...`);
            
            // Configuração específica para SharePoint (User-Agent de navegador + redirects)
            const axiosConfig = {
                responseType: 'arraybuffer',
                timeout: RETRY_CONFIG.TIMEOUT_MS,
                maxRedirects: 10, // SharePoint pode fazer vários redirects
                validateStatus: function (status) {
                    return status >= 200 && status < 400; // Aceita 2xx e 3xx (redirects)
                }
            };

            // SharePoint exige User-Agent de navegador para liberar o download
            if (isSharepoint) {
                axiosConfig.headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                };
            } else {
                // Google Sheets
                axiosConfig.headers = {
                    'User-Agent': 'DashEstoque-NodeJS/1.0'
                };
            }
            
            const response = await axios.get(finalUrl, axiosConfig);
            
            // Verifica se o conteúdo retornado é realmente um Excel
            const contentType = response.headers['content-type'] || '';
            const isExcel = (
                contentType.includes('spreadsheet') ||
                contentType.includes('excel') ||
                contentType.includes('octet-stream') ||
                contentType.includes('openxmlformats')
            );
            
            // Para SharePoint, o content-type pode vir como text/html em alguns casos de erro
            if (isSharepoint && contentType.includes('text/html')) {
                throw new Error('SharePoint retornou HTML em vez de arquivo Excel. Verifique se o link está público e com permissão de download.');
            }
            
            console.log(`[downloadService] Download concluído com sucesso. Content-Type: ${contentType || 'desconhecido'}`);
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
    downloadDraftSpreadsheet,
    downloadWithRetry, // Exportado para uso pelo ignoredService.js
    isSharepointUrl,
    ensureSharepointDownloadParam
};