/**
 * downloadService.js
 * Responsável por baixar as planilhas do SharePoint ou Google Sheets.
 * 
 * LÓGICA DE DOWNLOAD DO SHAREPOINT (replicada do projeto VencimentosCPFANI):
 * - Apenas adiciona o parâmetro ?download=1 à URL original do SharePoint
 * - Usa headers específicos de navegador com Accept para Excel
 * - Permite redirects automáticos (SharePoint faz redirect antes de retornar o arquivo)
 * - Valida o Content-Type para garantir que não é uma página HTML de login
 * 
 * Para Google Sheets, usa o formato padrão de exportação.
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
    const lower = String(url).toLowerCase();
    return (
        lower.includes('.sharepoint.com/') ||
        lower.includes('-my.sharepoint.com/') ||
        lower.includes('1drv.ms/') ||
        lower.includes('onedrive.live.com/')
    );
}

/**
 * Adiciona o parâmetro download=1 à URL do SharePoint.
 * REPLICADO DA LÓGICA DO PROJETO VencimentosCPFANI (função extrair_info_sharepoint).
 * 
 * Preserva todos os parâmetros originais da URL (como e=, etc).
 * 
 * @param {string} url - URL original do SharePoint.
 * @returns {string} - URL com parâmetro download=1 adicionado.
 */
function adicionarDownloadParam(url) {
    if (!url) return url;
    
    // Se já tem download=1 ou é URL de download direto, retorna como está
    if (url.includes('download=1') || url.includes('download.aspx')) {
        return url;
    }
    
    try {
        // Usa a API URL nativa do Node.js (equivalente a urlparse do Python)
        const parsed = new URL(url);
        
        // Adiciona o parâmetro download=1 preservando os existentes
        parsed.searchParams.set('download', '1');
        
        return parsed.toString();
    } catch (error) {
        console.warn(`[downloadService] Erro ao adicionar download=1: ${error.message}`);
        return url;
    }
}

/**
 * Realiza o download de uma URL com retry automático em caso de falha.
 * 
 * @param {string} url - URL pública da planilha.
 * @returns {Promise<Buffer>} - Buffer contendo os dados da planilha Excel.
 */
async function downloadWithRetry(url) {
    // Validação inicial: URL não pode ser undefined/null/vazia
    if (!url || url === 'undefined' || url.trim() === '') {
        throw new Error('[downloadService] URL inválida ou não configurada. Verifique o arquivo .env');
    }
    
    // Verifica se é URL placeholder (não configurada)
    if (url.includes('SEU_ID_AQUI') || url.includes('COLE_AQUI_A_URL')) {
        throw new Error(`[downloadService] URL ainda é um placeholder: ${url}. Configure a URL real no arquivo .env`);
    }
    
    let lastError;
    const isSharepoint = isSharepointUrl(url);
    
    // Pré-processa a URL: adiciona download=1 se for SharePoint
    const finalUrl = isSharepoint ? adicionarDownloadParam(url) : url;
    
    console.log(`[downloadService] Tipo: ${isSharepoint ? 'SharePoint' : 'Google Sheets/Outro'}`);
    console.log(`[downloadService] URL original: ${url}`);
    if (isSharepoint) {
        console.log(`[downloadService] URL com download=1: ${finalUrl}`);
    }
    
    for (let attempt = 1; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
        try {
            console.log(`[downloadService] Tentativa ${attempt}/${RETRY_CONFIG.MAX_RETRIES} de download...`);
            
            // Headers REPLICADOS DO VencimentosCPFANI: simula navegador real
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/octet-stream,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br'
            };
            
            const axiosConfig = {
                responseType: 'arraybuffer',
                timeout: RETRY_CONFIG.TIMEOUT_MS,
                maxRedirects: 15, // SharePoint faz múltiplos redirects
                headers: headers,
                // NÃO rejeita redirects (3xx) - o axios os segue automaticamente
                // e o validateStatus padrão (200-299) se aplica à resposta FINAL após o redirect
                decompress: true
            };
            
            const response = await axios.get(finalUrl, axiosConfig);
            
            // Verifica o Content-Type da resposta final (após os redirects)
            const contentType = (response.headers['content-type'] || '').toLowerCase();
            
            // REPLICADO DO VencimentosCPFANI: verifica se é HTML (página de login/erro)
            if (contentType.includes('text/html')) {
                const errorText = Buffer.from(response.data).toString('utf-8').substring(0, 200);
                throw new Error(`Resposta HTML recebida (não é arquivo Excel). Possível problema de autenticação. Trecho: ${errorText}`);
            }
            
            // Validação: arquivo muito pequeno provavelmente é erro
            if (response.data && response.data.byteLength < 1000) {
                throw new Error(`Arquivo muito pequeno (${response.data.byteLength} bytes). Provavelmente é uma página de erro.`);
            }
            
            console.log(`[downloadService] ✅ Download concluído com sucesso.`);
            console.log(`[downloadService]    Content-Type: ${contentType || 'desconhecido'}`);
            console.log(`[downloadService]    Tamanho: ${(response.data.byteLength / 1024).toFixed(2)} KB`);
            
            return Buffer.from(response.data);
            
        } catch (error) {
            lastError = error;
            
            let errorMessage = error.message;
            if (error.response) {
                errorMessage = `HTTP ${error.response.status} - ${error.response.statusText}`;
            }
            
            console.warn(`[downloadService] ❌ Falha na tentativa ${attempt}. Erro: ${errorMessage}`);
            
            if (attempt < RETRY_CONFIG.MAX_RETRIES) {
                console.log(`[downloadService] Aguardando ${RETRY_CONFIG.RETRY_DELAY_MS}ms para próxima tentativa...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.RETRY_DELAY_MS));
            }
        }
    }
    
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
    downloadWithRetry,
    isSharepointUrl,
    adicionarDownloadParam
};