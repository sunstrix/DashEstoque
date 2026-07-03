/**
 * downloadService.js
 * Serviço central de download de planilhas públicas (SharePoint ou Google Sheets).
 * Implementa retry automático e tratamento específico para URLs do SharePoint,
 * extraindo a URL real de download a partir da página de redirecionamento.
 */

const axios = require('axios');

/**
 * Extrai a URL de download real do HTML de redirecionamento do SharePoint.
 * Procura por padrões comuns usados pela Microsoft para redirecionar ao arquivo físico.
 *
 * @param {string} html - Conteúdo HTML da página de redirecionamento
 * @returns {string|null} URL de download real ou null se não encontrar
 */
function extrairUrlDownloadSharepoint(html) {
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
            // Decodifica caracteres escapados em JSON dentro do HTML
            let url = match[1];
            url = url
                .replace(/\\u0026/g, '&')
                .replace(/\\u003d/g, '=')
                .replace(/\\u002f/gi, '/');
            return url;
        }
    }
    return null;
}

/**
 * Baixa arquivo Excel de uma URL pública com retry automático.
 * - SharePoint: faz 2 requisições (primeiro extrai URL real do HTML de redirecionamento,
 *   depois baixa o arquivo físico usando a URL extraída).
 * - Google Sheets e outras: baixa diretamente com a URL informada.
 *
 * @param {string} url - URL pública da planilha
 * @returns {Promise<Buffer>} Buffer contendo o arquivo Excel baixado
 * @throws {Error} Se a URL for inválida ou todas as tentativas de download falharem
 */
async function downloadWithRetry(url) {
    if (!url) {
        throw new Error('[downloadService] URL inválida ou não configurada. Verifique o arquivo .env');
    }

    const maxRetries = 3;
    let lastError = null;
    let downloadUrl = url;

    // Detecta se é URL do SharePoint
    const isSharePoint = url.toLowerCase().includes('.sharepoint.com');

    if (isSharePoint) {
        console.log(`[downloadService] 📥 URL SharePoint detectada. Extraindo URL de download real...`);

        try {
            // Primeira requisição: buscar página HTML de redirecionamento
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                },
                maxRedirects: 0, // Não seguir redirects automaticamente aqui
                validateStatus: (status) => status >= 200 && status < 400
            });

            // Extrai URL de download real do HTML retornado
            const html = typeof response.data === 'string'
                ? response.data
                : response.data.toString();
            const realUrl = extrairUrlDownloadSharepoint(html);

            if (!realUrl) {
                throw new Error('Não foi possível extrair URL de download do SharePoint. Verifique se a planilha é pública.');
            }

            downloadUrl = realUrl;
            console.log(`[downloadService] ✅ URL de download extraída com sucesso.`);
        } catch (error) {
            console.warn(`[downloadService] ⚠️ Falha ao extrair URL real (${error.message}). Tentando download direto com a URL original...`);
            // Se falhar a extração, continua com a URL original como fallback
        }
    } else {
        console.log(`[downloadService] 📥 URL detectada: Google Sheets ou outro serviço.`);
    }

    // Segunda etapa: baixar o arquivo Excel (com retry)
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

            // Validação de integridade: arquivo válido precisa ter tamanho razoável
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
                // Backoff exponencial simples
                const delay = 1000 * attempt;
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
 * @returns {Promise<Buffer>} Buffer do arquivo Excel
 */
async function downloadMainSpreadsheet() {
    const url = process.env.SPREADSHEET_MAIN_URL;
    console.log('[downloadService] 📊 Iniciando download da planilha PRINCIPAL...');
    return downloadWithRetry(url);
}

/**
 * Baixa a planilha de estoque de segurança.
 * @returns {Promise<Buffer>} Buffer do arquivo Excel
 */
async function downloadSafetyStockSpreadsheet() {
    const url = process.env.SPREADSHEET_SAFETY_STOCK_URL;
    console.log('[downloadService] 🛡️ Iniciando download da planilha ESTOQUE SEGURANÇA...');
    return downloadWithRetry(url);
}

/**
 * Baixa a planilha de draft de custos (usada para aplicar regra de custo).
 * CORREÇÃO: renomeada de downloadCostSpreadsheet para downloadDraftSpreadsheet
 * para alinhar com o import em draftService.js e a variável SPREADSHEET_DRAFT_URL.
 *
 * @returns {Promise<Buffer>} Buffer do arquivo Excel
 */
async function downloadDraftSpreadsheet() {
    const url = process.env.SPREADSHEET_DRAFT_URL;
    console.log('[downloadService] 💰 Iniciando download da planilha DRAFT DE CUSTOS...');
    return downloadWithRetry(url);
}

/**
 * Baixa a planilha de itens ignorados (sacolas e produtos irrelevantes para análise).
 * @returns {Promise<Buffer>} Buffer do arquivo Excel
 */
async function downloadIgnoredItemsSpreadsheet() {
    const url = process.env.SPREADSHEET_IGNORED_URL;
    console.log('[downloadService] 🚫 Iniciando download da planilha ITENS IGNORADOS...');
    return downloadWithRetry(url);
}

/**
 * Alias de compatibilidade: mantém o nome antigo downloadCostSpreadsheet
 * apontando para downloadDraftSpreadsheet, caso alguma referência esquecida
 * em outro arquivo ainda esteja usando o nome anterior.
 *
 * @returns {Promise<Buffer>} Buffer do arquivo Excel
 */
async function downloadCostSpreadsheet() {
    console.warn('[downloadService] ⚠️ downloadCostSpreadsheet está depreciado. Use downloadDraftSpreadsheet.');
    return downloadDraftSpreadsheet();
}

module.exports = {
    downloadMainSpreadsheet,
    downloadSafetyStockSpreadsheet,
    downloadDraftSpreadsheet,       // ✅ Nome correto esperado por draftService.js
    downloadCostSpreadsheet,        // 🔒 Alias de compatibilidade (regra crítica: não remover)
    downloadIgnoredItemsSpreadsheet,
    downloadWithRetry,
    extrairUrlDownloadSharepoint
};