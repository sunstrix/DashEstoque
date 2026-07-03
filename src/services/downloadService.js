const axios = require('axios');

/**
 * Extrai a URL de download real do HTML de redirecionamento do SharePoint
 * @param {string} html - HTML da página de redirecionamento
 * @returns {string|null} URL de download real ou null se não encontrar
 */
function extrairUrlDownloadSharepoint(html) {
    // Procura por @downloadUrl ou URL de download no HTML
    const patterns = [
        /"@downloadUrl"\s*:\s*"([^"]+)"/,
        /"url"\s*:\s*"([^"]+\.aspx[^"]*download[^"]*)"/i,
        /window\.location\s*=\s*['"]([^'"]+)['"]/,
        /location\.href\s*=\s*['"]([^'"]+)['"]/,
        /redirectUrl\s*=\s*['"]([^'"]+)['"]/i,
        /action="([^"]+)"/i
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
            // Decodifica a URL se estiver escapada
            let url = match[1];
            url = url.replace(/\\u0026/g, '&').replace(/\\u003d/g, '=').replace(/\\u002f/gi, '/');
            return url;
        }
    }
    return null;
}

/**
 * Baixa arquivo Excel de uma URL pública (SharePoint ou Google Sheets) com retry automático.
 * Para SharePoint: extrai URL de download real da página de redirecionamento.
 * Para Google Sheets: usa URL direta.
 * @param {string} url - URL pública da planilha.
 * @returns {Promise<Buffer>} Buffer do arquivo Excel baixado.
 */
async function downloadWithRetry(url) {
    if (!url) {
        throw new Error('[downloadService] URL inválida ou não configurada. Verifique o arquivo .env');
    }

    const maxRetries = 3;
    let lastError = null;
    let downloadUrl = url;

    // Detecta se é SharePoint
    const isSharePoint = url.toLowerCase().includes('.sharepoint.com');

    if (isSharePoint) {
        console.log(`[downloadService] 📥 URL SharePoint detectada. Extraindo URL de download real...`);
        
        try {
            // Primeira requisição: obter página de redirecionamento
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                },
                maxRedirects: 0, // Não seguir redirects automaticamente
                validateStatus: (status) => status >= 200 && status < 400
            });

            // Extrai URL de download real do HTML
            const html = typeof response.data === 'string' ? response.data : response.data.toString();
            const realUrl = extrairUrlDownloadSharepoint(html);

            if (!realUrl) {
                throw new Error('Não foi possível extrair URL de download do SharePoint. Verifique se a planilha é pública.');
            }

            downloadUrl = realUrl;
            console.log(`[downloadService] ✅ URL de download extraída com sucesso.`);
        } catch (error) {
            console.warn(`[downloadService] ⚠️ Falha ao extrair URL. Tentando download direto...`);
            // Se falhar, tenta usar a URL original mesmo
        }
    } else {
        console.log(`[downloadService] 📥 URL detectada: Google Sheets ou outro.`);
    }

    // Agora tenta baixar o arquivo Excel com retry
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[downloadService] 🔄 Tentativa ${attempt}/${maxRetries}...`);
            
            const response = await axios.get(downloadUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,*/*'
                },
                responseType: 'arraybuffer',
                timeout: 30000,
                maxRedirects: 10,
                validateStatus: (status) => status === 200
            });

            // Valida se é realmente um arquivo Excel
            const buffer = Buffer.from(response.data);
            if (buffer.length < 1000) {
                throw new Error('Arquivo baixado é muito pequeno. Provavelmente é uma página HTML de erro.');
            }

            console.log(`[downloadService] ✅ Download concluído! Tamanho: ${(buffer.length / 1024).toFixed(2)} KB`);
            return buffer;

        } catch (error) {
            lastError = error;
            console.warn(`[downloadService] ❌ Tentativa ${attempt} falhou: ${error.message}`);

            if (attempt < maxRetries) {
                const delay = 1000 * attempt; // Backoff exponencial
                console.log(`[downloadService] ⏳ Aguardando ${delay}ms antes de tentar novamente...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    console.error(`[downloadService] 🚨 Falha após ${maxRetries} tentativas.`);
    throw new Error(`Falha ao baixar planilha após ${maxRetries} tentativas. Último erro: ${lastError.message}`);
}

/**
 * Baixa a planilha principal (estoque, preços, classes, categorias).
 * @returns {Promise<Buffer>} Buffer do arquivo Excel.
 */
async function downloadMainSpreadsheet() {
    const url = process.env.SPREADSHEET_MAIN_URL;
    console.log('[downloadService] 📊 Iniciando download da planilha PRINCIPAL...');
    return downloadWithRetry(url);
}

/**
 * Baixa a planilha de estoque de segurança.
 * @returns {Promise<Buffer>} Buffer do arquivo Excel.
 */
async function downloadSafetyStockSpreadsheet() {
    const url = process.env.SPREADSHEET_SAFETY_STOCK_URL;
    console.log('[downloadService] 🛡️ Iniciando download da planilha ESTOQUE SEGURANÇA...');
    return downloadWithRetry(url);
}

/**
 * Baixa a planilha de custos (DRAFT).
 * @returns {Promise<Buffer>} Buffer do arquivo Excel.
 */
async function downloadCostSpreadsheet() {
    const url = process.env.SPREADSHEET_COST_URL;
    console.log('[downloadService] 💰 Iniciando download da planilha CUSTOS (DRAFT)...');
    return downloadWithRetry(url);
}

/**
 * Baixa a planilha de itens ignorados.
 * @returns {Promise<Buffer>} Buffer do arquivo Excel.
 */
async function downloadIgnoredItemsSpreadsheet() {
    const url = process.env.SPREADSHEET_IGNORED_URL;
    console.log('[downloadService] 🚫 Iniciando download da planilha ITENS IGNORADOS...');
    return downloadWithRetry(url);
}

module.exports = {
    downloadMainSpreadsheet,
    downloadSafetyStockSpreadsheet,
    downloadCostSpreadsheet,
    downloadIgnoredItemsSpreadsheet,
    downloadWithRetry,
    extrairUrlDownloadSharepoint
};