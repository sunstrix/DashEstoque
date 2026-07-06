/**
 * downloadService.js
 * Serviço central de download de planilhas públicas (SharePoint ou Google Sheets).
 * Implementa retry automático e tratamento específico para URLs do SharePoint,
 * extraindo a URL real de download a partir da página de redirecionamento.
 * 
 * ESTRATÉGIAS DE DOWNLOAD (SharePoint):
 * 1. Tenta extrair URL real do HTML de redirecionamento (regex expandido)
 * 2. Se falhar, captura header Location de redirects 301/302
 * 3. Se falhar, tenta URL original com ?download=1 adicionado
 * 4. Se falhar, tenta URL com /_layouts/15/download.aspx
 * 5. Fallback: download direto com URL original
 * 
 * Cada função wrapper informa qual variável de ambiente representa,
 * permitindo que o api.js identifique exatamente qual URL falhou.
 */

const axios = require('axios');

// ============================================================================
// CONSTANTES E CONFIGURAÇÕES
// ============================================================================

/**
 * Mapeamento de variáveis de ambiente para descrições amigáveis.
 * Usado para gerar mensagens de erro claras quando uma URL falha.
 */
const ENV_VAR_DESCRIPTIONS = {
    SPREADSHEET_MAIN_URL: 'planilha principal (estoque, preços, classes, categorias)',
    SPREADSHEET_DRAFT_URL: 'planilha draft de custos (mapeamento de PDVs e custos)',
    SPREADSHEET_SAFETY_STOCK_URL: 'planilha de estoque de segurança (mínimos por SKU)',
    SPREADSHEET_IGNORED_URL: 'planilha de itens ignorados (sacolas, produtos irrelevantes)'
};

/**
 * User-Agent de navegador real para simular requisição de usuário comum.
 * Necessário para contornar bloqueios do SharePoint.
 */
const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ============================================================================
// FUNÇÕES AUXILIARES DE EXTRAÇÃO
// ============================================================================

/**
 * Extrai a URL de download real do HTML de redirecionamento do SharePoint.
 * Procura por padrões comuns usados pela Microsoft para redirecionar ao arquivo físico.
 * 
 * PADRÕES SUPORTADOS (SharePoint moderno):
 * - @downloadUrl (API Graph do Microsoft 365)
 * - downloadUrl (JSON embutido)
 * - /_layouts/15/download.aspx (URL clássica de download)
 * - window.location / location.href (redirecionamento via JavaScript)
 * - redirectUrl (meta tag ou variável JS)
 * - action= (form de redirecionamento)
 * - data-interception / data-url (atributos HTML5)
 * - UrlLinkEncoded (formato específico do SharePoint Online)
 * - fileUrl / getFileUrl (APIs internas)
 *
 * @param {string} html - Conteúdo HTML da página de redirecionamento
 * @returns {string|null} URL de download real ou null se não encontrar
 */
function extrairUrlDownloadSharepoint(html) {
    if (!html || typeof html !== 'string') {
        return null;
    }

    // Lista expandida de padrões para SharePoint moderno
    const patterns = [
        // API Microsoft Graph / SharePoint Online
        /"@downloadUrl"\s*:\s*"([^"]+)"/i,
        /"downloadUrl"\s*:\s*"([^"]+)"/i,
        /"@content\.downloadUrl"\s*:\s*"([^"]+)"/i,
        
        // URL clássica de download do SharePoint
        /(https?:\/\/[^"'\s]+\/_layouts\/15\/download\.aspx[^"'\s]*)/i,
        /(https?:\/\/[^"'\s]+\/_layouts\/15\/Doc\.aspx[^"'\s]*)/i,
        
        // Redirecionamento via JavaScript
        /window\.location\s*=\s*['"]([^'"]+)['"]/i,
        /window\.location\.href\s*=\s*['"]([^'"]+)['"]/i,
        /location\.href\s*=\s*['"]([^'"]+)['"]/i,
        /location\.replace\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
        
        // Meta tags e variáveis JS
        /redirectUrl\s*=\s*['"]([^'"]+)['"]/i,
        /data-redirect-url\s*=\s*['"]([^'"]+)['"]/i,
        /<meta[^>]+http-equiv\s*=\s*['"]?refresh['"]?[^>]+content\s*=\s*['"]?\d+;\s*url=([^"'\s>]+)/i,
        
        // Formulários de redirecionamento
        /<form[^>]+action\s*=\s*['"]([^'"]+)['"]/i,
        
        // Atributos HTML5 específicos do SharePoint
        /data-interception\s*=\s*['"]([^'"]+)['"]/i,
        /data-url\s*=\s*['"]([^'"]+)['"]/i,
        /data-download-url\s*=\s*['"]([^'"]+)['"]/i,
        
        // APIs internas do SharePoint
        /"UrlLinkEncoded"\s*:\s*"([^"]+)"/i,
        /"fileUrl"\s*:\s*"([^"]+)"/i,
        /"getFileUrl"\s*\(\s*['"]([^'"]+)['"]\s*\)/i,
        
        // URL de arquivo .xlsx/.xls direta no HTML
        /(https?:\/\/[^"'\s<>]+\.xlsx[^"'\s<>]*)/i,
        /(https?:\/\/[^"'\s<>]+\.xls[^"'\s<>]*)/i,
        
        // Padrão genérico de URL com parâmetros de download
        /["'](https?:\/\/[^"'\s]+(?:download|Download)[^"'\s]*)["']/i
    ];

    for (const pattern of patterns) {
        try {
            const match = html.match(pattern);
            if (match && match[1]) {
                // Decodifica caracteres escapados em JSON dentro do HTML
                let url = match[1];
                url = url
                    .replace(/\\u0026/g, '&')
                    .replace(/\\u003d/g, '=')
                    .replace(/\\u002f/gi, '/')
                    .replace(/\\u003a/gi, ':')
                    .replace(/\\u003f/g, '?')
                    .replace(/&amp;/g, '&')
                    .trim();
                
                // Validação básica: precisa ser uma URL http(s) válida
                if (url.startsWith('http://') || url.startsWith('https://')) {
                    return url;
                }
            }
        } catch (e) {
            // Ignora erro de regex individual e tenta o próximo padrão
            continue;
        }
    }
    return null;
}

/**
 * Adiciona o parâmetro ?download=1 à URL, preservando parâmetros existentes.
 * Usado como estratégia alternativa quando a extração de URL falha.
 * 
 * @param {string} url - URL original
 * @returns {string} URL com parâmetro download=1 adicionado
 */
function adicionarParametroDownload(url) {
    if (!url) return url;
    
    try {
        // Se já tem download=1, retorna como está
        if (url.includes('download=1')) {
            return url;
        }
        
        const parsed = new URL(url);
        parsed.searchParams.set('download', '1');
        return parsed.toString();
    } catch (error) {
        // Fallback manual se URL for inválida para o construtor URL
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}download=1`;
    }
}

/**
 * Converte URL de visualização do SharePoint para URL de download direto
 * usando o formato /_layouts/15/download.aspx.
 * 
 * Exemplo:
 *   Entrada:  https://empresa.sharepoint.com/:x:/s/site/abc123?e=xyz
 *   Saída:    https://empresa.sharepoint.com/sites/site/_layouts/15/download.aspx?share=abc123
 * 
 * @param {string} url - URL de visualização do SharePoint
 * @returns {string|null} URL de download direto ou null se não conseguir converter
 */
function converterParaDownloadAspx(url) {
    if (!url) return null;
    
    try {
        // Padrão: /:x:/s/NomeSite/TOKEN?e=XXX
        const match = url.match(/https?:\/\/([^/]+)\/:x:\/s\/([^/]+)\/([^?]+)/i);
        if (match) {
            const [, host, siteName, token] = match;
            return `https://${host}/sites/${siteName}/_layouts/15/download.aspx?share=${token}`;
        }
        
        // Padrão alternativo: /:x:/r/sites/NomeSite/...
        const matchAlt = url.match(/https?:\/\/([^/]+)\/:x:\/r\/sites\/([^/]+)\/([^?]+)/i);
        if (matchAlt) {
            const [, host, siteName, token] = matchAlt;
            return `https://${host}/sites/${siteName}/_layouts/15/download.aspx?share=${token}`;
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

// ============================================================================
// FUNÇÃO PRINCIPAL DE DOWNLOAD COM RETRY
// ============================================================================

/**
 * Baixa arquivo Excel de uma URL pública com retry automático.
 * Para SharePoint, tenta múltiplas estratégias progressivas:
 * 1. Extrai URL real do HTML de redirecionamento
 * 2. Captura header Location de redirects 301/302
 * 3. Tenta URL com ?download=1
 * 4. Tenta URL convertida para /_layouts/15/download.aspx
 * 5. Fallback: download direto com URL original
 * 
 * Para Google Sheets e outras URLs: download direto.
 *
 * @param {string} url - URL pública da planilha
 * @param {string} [envVarName] - Nome da variável de ambiente correspondente (para logs)
 * @returns {Promise<Buffer>} Buffer contendo o arquivo Excel baixado
 * @throws {Error} Se a URL for inválida ou todas as tentativas falharem
 */
async function downloadWithRetry(url, envVarName = null) {
    // Validação inicial: URL não pode ser undefined/null/vazia
    if (!url || typeof url !== 'string' || url.trim() === '') {
        const envInfo = envVarName ? ` (variável: ${envVarName})` : '';
        throw new Error(`[downloadService] URL inválida ou não configurada${envInfo}. Verifique o arquivo .env`);
    }

    const maxRetries = 3;
    let lastError = null;
    const isSharePoint = url.toLowerCase().includes('.sharepoint.com');
    
    // Log inicial com identificação da variável de ambiente
    const envLabel = envVarName ? ` [${envVarName}]` : '';
    console.log(`[downloadService] 📥 Iniciando download${envLabel}...`);
    console.log(`[downloadService]    Tipo: ${isSharePoint ? 'SharePoint' : 'Google Sheets/Outro'}`);
    console.log(`[downloadService]    URL: ${url.substring(0, 80)}${url.length > 80 ? '...' : ''}`);

    // =========================================================================
    // FASE 1: Para SharePoint, tentar extrair URL real
    // =========================================================================
    let downloadUrl = url;
    
    if (isSharePoint) {
        console.log(`[downloadService] 🔍 Tentando extrair URL real do SharePoint...`);
        
        // Estratégia 1: Extrair URL do HTML de redirecionamento
        const extractedUrl = await tentarExtrairUrlDoHtml(url);
        if (extractedUrl) {
            downloadUrl = extractedUrl;
            console.log(`[downloadService] ✅ URL extraída do HTML com sucesso.`);
        } else {
            console.log(`[downloadService] ⚠️ Extração do HTML falhou. Tentando header Location...`);
            
            // Estratégia 2: Capturar header Location de redirects 301/302
            const locationUrl = await tentarCapturarLocationHeader(url);
            if (locationUrl) {
                downloadUrl = locationUrl;
                console.log(`[downloadService] ✅ URL capturada do header Location.`);
            } else {
                console.log(`[downloadService] ⚠️ Header Location não encontrado. Usando URL original.`);
            }
        }
    }

    // =========================================================================
    // FASE 2: Tentar baixar com múltiplas estratégias de URL
    // =========================================================================
    const urlStrategies = isSharePoint 
        ? [
            downloadUrl,                                          // URL extraída/original
            adicionarParametroDownload(url),                      // URL com ?download=1
            converterParaDownloadAspx(url),                       // URL convertida para download.aspx
            url                                                   // Fallback: URL original pura
          ].filter(u => u && u !== url || u === url)             // Remove duplicatas mantendo ordem
        : [url];

    // Remove duplicatas preservando ordem
    const uniqueStrategies = [];
    const seen = new Set();
    for (const strategy of urlStrategies) {
        if (strategy && !seen.has(strategy)) {
            seen.add(strategy);
            uniqueStrategies.push(strategy);
        }
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        for (const strategyUrl of uniqueStrategies) {
            try {
                console.log(`[downloadService] 🔄 Tentativa ${attempt}/${maxRetries} com estratégia: ${getStrategyName(strategyUrl, url)}`);

                const response = await axios.get(strategyUrl, {
                    headers: {
                        'User-Agent': BROWSER_USER_AGENT,
                        'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/octet-stream,*/*;q=0.8',
                        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                        'Accept-Encoding': 'gzip, deflate, br'
                    },
                    responseType: 'arraybuffer',
                    timeout: 30000,
                    maxRedirects: 10,
                    validateStatus: (status) => status === 200,
                    decompress: true
                });

                // Validação de integridade: arquivo válido precisa ter tamanho razoável
                const buffer = Buffer.from(response.data);
                if (buffer.length < 1000) {
                    throw new Error(`Arquivo baixado é muito pequeno (${buffer.length} bytes). Provavelmente é uma página HTML de erro.`);
                }

                // Validação adicional: verificar se o conteúdo começa com PK (assinatura de arquivo ZIP/XLSX)
                const firstBytes = buffer.slice(0, 4).toString('hex');
                if (firstBytes !== '504b0304' && firstBytes !== 'd0cf11e0') {
                    // Não é um arquivo Office válido (PK = ZIP/XLSX, D0CF = XLS antigo)
                    const contentPreview = buffer.slice(0, 100).toString('utf-8');
                    if (contentPreview.toLowerCase().includes('<html') || contentPreview.toLowerCase().includes('<!doctype')) {
                        throw new Error('Conteúdo baixado é HTML, não arquivo Excel. Possível problema de autenticação ou URL incorreta.');
                    }
                }

                console.log(`[downloadService] ✅ Download concluído! Tamanho: ${(buffer.length / 1024).toFixed(2)} KB`);
                return buffer;

            } catch (error) {
                lastError = error;
                const errorMsg = error.response 
                    ? `HTTP ${error.response.status} - ${error.response.statusText}`
                    : error.message;
                console.warn(`[downloadService] ❌ Estratégia falhou: ${errorMsg}`);
                // Continua para a próxima estratégia antes de incrementar tentativa
            }
        }

        // Se todas as estratégias falharam nesta tentativa, aguarda antes de repetir
        if (attempt < maxRetries) {
            const delay = 1000 * attempt; // Backoff exponencial simples
            console.log(`[downloadService] ⏳ Aguardando ${delay}ms antes de tentar novamente...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // =========================================================================
    // FASE 3: Todas as tentativas falharam - gerar erro detalhado
    // =========================================================================
    console.error(`[downloadService] 🚨 Falha após ${maxRetries} tentativas com todas as estratégias.`);
    
    const envDescription = envVarName && ENV_VAR_DESCRIPTIONS[envVarName]
        ? ENV_VAR_DESCRIPTIONS[envVarName]
        : 'planilha desconhecida';
    
    throw new Error(
        `[downloadService] Falha ao baixar ${envDescription} após ${maxRetries} tentativas. ` +
        `URL: ${url.substring(0, 80)}... | Último erro: ${lastError.message}` +
        (envVarName ? ` | Variável de ambiente: ${envVarName}` : '')
    );
}

/**
 * Retorna nome legível da estratégia de URL para logs.
 * @param {string} strategyUrl - URL da estratégia atual
 * @param {string} originalUrl - URL original
 * @returns {string} Nome da estratégia
 */
function getStrategyName(strategyUrl, originalUrl) {
    if (strategyUrl === originalUrl) return 'URL original';
    if (strategyUrl.includes('download=1')) return 'URL com ?download=1';
    if (strategyUrl.includes('/_layouts/15/download.aspx')) return 'URL convertida (download.aspx)';
    return 'URL extraída do HTML/Location';
}

/**
 * Tenta extrair a URL real do HTML de redirecionamento do SharePoint.
 * @param {string} url - URL original do SharePoint
 * @returns {Promise<string|null>} URL extraída ou null
 */
async function tentarExtrairUrlDoHtml(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': BROWSER_USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9'
            },
            timeout: 15000,
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 400
        });

        const html = typeof response.data === 'string'
            ? response.data
            : Buffer.from(response.data).toString('utf-8');
        
        return extrairUrlDownloadSharepoint(html);
    } catch (error) {
        console.warn(`[downloadService]    ⚠️ Erro ao buscar HTML: ${error.message}`);
        return null;
    }
}

/**
 * Tenta capturar a URL do header Location em redirects 301/302.
 * @param {string} url - URL original do SharePoint
 * @returns {Promise<string|null>} URL do Location ou null
 */
async function tentarCapturarLocationHeader(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': BROWSER_USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 15000,
            maxRedirects: 0, // NÃO seguir redirects
            validateStatus: (status) => status >= 200 && status < 400 // Aceita 301/302
        });

        // Se o status for 301 ou 302, o header Location contém a URL de destino
        if ((response.status === 301 || response.status === 302) && response.headers.location) {
            let locationUrl = response.headers.location;
            
            // Se for URL relativa, converte para absoluta
            if (locationUrl.startsWith('/')) {
                const parsed = new URL(url);
                locationUrl = `${parsed.protocol}//${parsed.host}${locationUrl}`;
            }
            
            return locationUrl;
        }
        
        return null;
    } catch (error) {
        console.warn(`[downloadService]    ⚠️ Erro ao capturar Location: ${error.message}`);
        return null;
    }
}

// ============================================================================
// FUNÇÕES WRAPPER (uma para cada planilha)
// ============================================================================

/**
 * Baixa a planilha principal (estoque, preços, classes, categorias).
 * Variável de ambiente: SPREADSHEET_MAIN_URL
 * @returns {Promise<Buffer>} Buffer do arquivo Excel
 */
async function downloadMainSpreadsheet() {
    const url = process.env.SPREADSHEET_MAIN_URL;
    console.log('[downloadService] 📊 Iniciando download da planilha PRINCIPAL...');
    return downloadWithRetry(url, 'SPREADSHEET_MAIN_URL');
}

/**
 * Baixa a planilha de estoque de segurança.
 * Variável de ambiente: SPREADSHEET_SAFETY_STOCK_URL
 * @returns {Promise<Buffer>} Buffer do arquivo Excel
 */
async function downloadSafetySpreadsheet() {
    const url = process.env.SPREADSHEET_SAFETY_STOCK_URL;
    console.log('[downloadService] 🛡️ Iniciando download da planilha ESTOQUE SEGURANÇA...');
    return downloadWithRetry(url, 'SPREADSHEET_SAFETY_STOCK_URL');
}

/**
 * Baixa a planilha de draft de custos (usada para aplicar regra de custo).
 * Variável de ambiente: SPREADSHEET_DRAFT_URL
 * @returns {Promise<Buffer>} Buffer do arquivo Excel
 */
async function downloadDraftSpreadsheet() {
    const url = process.env.SPREADSHEET_DRAFT_URL;
    console.log('[downloadService] 💰 Iniciando download da planilha DRAFT DE CUSTOS...');
    return downloadWithRetry(url, 'SPREADSHEET_DRAFT_URL');
}

/**
 * Baixa a planilha de itens ignorados (sacolas e produtos irrelevantes para análise).
 * Variável de ambiente: SPREADSHEET_IGNORED_URL
 * @returns {Promise<Buffer>} Buffer do arquivo Excel
 */
async function downloadIgnoredItemsSpreadsheet() {
    const url = process.env.SPREADSHEET_IGNORED_URL;
    console.log('[downloadService] 🚫 Iniciando download da planilha ITENS IGNORADOS...');
    return downloadWithRetry(url, 'SPREADSHEET_IGNORED_URL');
}

// ============================================================================
// ALIASES DE COMPATIBILIDADE (regra crítica: não remover)
// ============================================================================

/**
 * Alias de compatibilidade: mantém o nome antigo downloadSafetyStockSpreadsheet
 * apontando para downloadSafetySpreadsheet.
 * @returns {Promise<Buffer>} Buffer do arquivo Excel
 */
async function downloadSafetyStockSpreadsheet() {
    console.warn('[downloadService] ⚠️ downloadSafetyStockSpreadsheet está depreciado. Use downloadSafetySpreadsheet.');
    return downloadSafetySpreadsheet();
}

/**
 * Alias de compatibilidade: mantém o nome antigo downloadCostSpreadsheet
 * apontando para downloadDraftSpreadsheet.
 * @returns {Promise<Buffer>} Buffer do arquivo Excel
 */
async function downloadCostSpreadsheet() {
    console.warn('[downloadService] ⚠️ downloadCostSpreadsheet está depreciado. Use downloadDraftSpreadsheet.');
    return downloadDraftSpreadsheet();
}

// ============================================================================
// FUNÇÃO DE MAPEAMENTO (env var → função de download)
// ============================================================================

/**
 * Retorna a função de download correspondente a uma variável de ambiente.
 * Usado pelo api.js para identificar qual planilha falhou e sugerir correção.
 * 
 * @param {string} envVarName - Nome da variável de ambiente (ex: 'SPREADSHEET_DRAFT_URL')
 * @returns {Function|null} Função de download correspondente ou null se não encontrada
 */
function getDownloadFunctionByEnvVar(envVarName) {
    const mapping = {
        'SPREADSHEET_MAIN_URL': downloadMainSpreadsheet,
        'SPREADSHEET_SAFETY_STOCK_URL': downloadSafetySpreadsheet,
        'SPREADSHEET_DRAFT_URL': downloadDraftSpreadsheet,
        'SPREADSHEET_IGNORED_URL': downloadIgnoredItemsSpreadsheet
    };
    return mapping[envVarName] || null;
}

/**
 * Retorna lista de todas as variáveis de ambiente suportadas.
 * @returns {string[]} Array com nomes das variáveis
 */
function getAllSupportedEnvVars() {
    return Object.keys(ENV_VAR_DESCRIPTIONS);
}

/**
 * Retorna descrição amigável de uma variável de ambiente.
 * @param {string} envVarName - Nome da variável
 * @returns {string} Descrição ou string vazia se não encontrada
 */
function getEnvVarDescription(envVarName) {
    return ENV_VAR_DESCRIPTIONS[envVarName] || '';
}

// ============================================================================
// EXPORTAÇÃO
// ============================================================================

module.exports = {
    // Funções wrapper (principais)
    downloadMainSpreadsheet,
    downloadSafetySpreadsheet,
    downloadDraftSpreadsheet,
    downloadIgnoredItemsSpreadsheet,
    
    // Aliases de compatibilidade (NÃO REMOVER)
    downloadSafetyStockSpreadsheet,
    downloadCostSpreadsheet,
    
    // Função principal de download
    downloadWithRetry,
    
    // Funções auxiliares de extração
    extrairUrlDownloadSharepoint,
    adicionarParametroDownload,
    converterParaDownloadAspx,
    tentarExtrairUrlDoHtml,
    tentarCapturarLocationHeader,
    
    // Funções de mapeamento (usadas pelo api.js)
    getDownloadFunctionByEnvVar,
    getAllSupportedEnvVars,
    getEnvVarDescription,
    
    // Constantes
    ENV_VAR_DESCRIPTIONS
};