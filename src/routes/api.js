/**
 * api.js
 * Define as rotas da API REST utilizando Express Router.
 * - GET /api/data: Retorna os dados processados (utiliza cache em memória)
 * - POST /api/refresh: Força a atualização dos dados, limpando o cache
 * - Implementa cache em memória com TTL de 1 hora para otimizar performance
 * - Tratamento robusto de erros com logs estruturados e mensagens acionáveis
 * - Suporte a "Modo Parcial": retorna avisos (warnings) se planilhas auxiliares falharem
 * - CORREÇÃO BUG 3: Expõe lista real de PDVs (availablePdvs) para o frontend
 */

const express = require('express');
const router = express.Router();

const dataService = require('../services/dataService');
const { CACHE_TTL_MS, PDV_MAPPING, ALL_PDVS } = require('../config/constants');
const { 
    validateEnvironment, 
    getMissingEnvVars 
} = require('../config/validateEnv');

// ============================================================================
// ESTADO DO CACHE EM MEMÓRIA
// ============================================================================
let cachedData = null;
let lastFetchTime = 0;

// ============================================================================
// FUNÇÕES AUXILIARES DE LOG E TRATAMENTO DE ERRO
// ============================================================================

/**
 * Retorna um timestamp formatado para logs estruturados.
 * @returns {string} Timestamp no formato ISO local
 */
function getLogTimestamp() {
    return new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Extrai uma mensagem de erro amigável e acionável a partir do erro original.
 * Classifica o erro em categorias para facilitar debug e exibição ao usuário.
 * Detecta especificamente qual variável de ambiente está faltando.
 *
 * @param {Error} error - Objeto de erro capturado
 * @returns {{ category: string, message: string, missingEnvVars: string[], isUserFriendly: boolean }}
 */
function classifyError(error) {
    const msg = (error && error.message) || 'Erro desconhecido';
    
    // Regex para extrair o nome da variável de ambiente da mensagem de erro do downloadService
    // Ex: "... | Variável de ambiente: SPREADSHEET_DRAFT_URL"
    const envVarRegex = /Variável de ambiente:\s*([A-Z_]+)/;
    const match = msg.match(envVarRegex);
    const missingEnvVars = match ? [match[1]] : [];

    // Categoria 1: Erros de configuração (URL ausente ou inválida)
    if (msg.includes('URL inválida ou não configurada') || msg.includes('placeholder') || missingEnvVars.length > 0) {
        const varName = missingEnvVars[0] || 'variável desconhecida';
        return {
            category: 'CONFIG_ERROR',
            message: `A variável ${varName} não está configurada no arquivo .env. Configure a URL da planilha correspondente para habilitar este recurso.`,
            missingEnvVars: missingEnvVars,
            isUserFriendly: true
        };
    }

    // Categoria 2: Erros de download (SharePoint/Google Sheets indisponível)
    if (msg.includes('[downloadService]') || msg.toLowerCase().includes('download')) {
        return {
            category: 'DOWNLOAD_ERROR',
            message: 'Falha ao baixar uma ou mais planilhas. Verifique se as URLs no .env estão corretas e se as planilhas estão compartilhadas publicamente.',
            missingEnvVars: missingEnvVars,
            isUserFriendly: true
        };
    }

    // Categoria 3: Erros de parsing de planilha (estrutura incorreta, colunas ausentes)
    if (msg.includes('sheet_to_json') || msg.includes('XLSX') || msg.toLowerCase().includes('aba') || msg.toLowerCase().includes('coluna')) {
        return {
            category: 'PARSING_ERROR',
            message: 'Erro ao processar planilha. Verifique se as abas e colunas estão nomeadas conforme o esperado.',
            missingEnvVars: missingEnvVars,
            isUserFriendly: true
        };
    }

    // Categoria 4: Erros de rede/conectividade
    if (msg.includes('ECONN') || msg.includes('ETIMEDOUT') || msg.includes('network') || msg.includes('timeout')) {
        return {
            category: 'NETWORK_ERROR',
            message: 'Problema de conectividade. Verifique sua conexão com a internet e tente novamente.',
            missingEnvVars: missingEnvVars,
            isUserFriendly: true
        };
    }

    // Categoria 5: Erros genéricos de processamento
    return {
        category: 'PROCESSING_ERROR',
        message: msg.length > 200 ? msg.substring(0, 200) + '...' : msg,
        missingEnvVars: missingEnvVars,
        isUserFriendly: false
    };
}

/**
 * Registra log estruturado de erro no console do servidor.
 * @param {Object} options - Opções do log
 * @param {string} options.route - Rota onde ocorreu o erro
 * @param {Error} options.error - Objeto de erro
 * @param {string} options.category - Categoria classificada do erro
 */
function logError({ route, error, category }) {
    const timestamp = getLogTimestamp();
    console.error('');
    console.error(`[api] ❌ ERRO [${timestamp}] em ${route}`);
    console.error(`[api]    Categoria: ${category}`);
    console.error(`[api]    Mensagem: ${error && error.message ? error.message : 'desconhecido'}`);
    if (error && error.stack) {
        console.error(`[api]    Stack trace:`);
        error.stack.split('\n').slice(0, 6).forEach(line => {
            console.error(`[api]      ${line}`);
        });
    }
    console.error('');
}

/**
 * Gera avisos (warnings) para o frontend com base no systemHealth retornado pelo dataService.
 * Indica quais planilhas auxiliares falharam e o impacto disso no dashboard.
 * 
 * @param {Object} systemHealth - Objeto systemHealth do dataService
 * @returns {Array<string>} Array de mensagens de aviso
 */
function generateWarnings(systemHealth) {
    const warnings = [];
    
    if (!systemHealth || typeof systemHealth !== 'object') return warnings;

    if (systemHealth.hasDraftCosts === false) {
        warnings.push('⚠️ Planilha de custos (draft) não disponível. Os custos serão calculados apenas com base no preço de tabela.');
    }
    if (systemHealth.hasSafetyStock === false) {
        warnings.push('⚠️ Planilha de estoque de segurança não disponível. Não haverá cálculo de excesso/falta.');
    }
    if (systemHealth.hasIgnoredItems === false) {
        warnings.push('⚠️ Planilha de itens ignorados não disponível. Itens como sacolas podem aparecer nos cálculos.');
    }

    return warnings;
}

// ============================================================================
// CORREÇÃO BUG 3: FUNÇÃO PARA CONSTRUIR LISTA DE PDVs REAIS
// ============================================================================

/**
 * Constrói a lista de PDVs disponíveis a partir do PDV_MAPPING do constants.js.
 * Transforma o mapeamento em uma estrutura amigável para o frontend:
 * { code: '4842', name: 'Metrópole', displayName: '4842 - Metrópole' }
 * 
 * @returns {Array<Object>} Lista de PDVs com código, nome e displayName
 */
function buildAvailablePdvs() {
    // Mapeamento de código -> nome amigável da loja
    // Extraído do README original do projeto Python
    const pdvNames = {
        '4842': 'Metrópole',
        '5152': 'Coração',
        '6105': 'Assai Anchieta',
        '6106': 'Direita',
        '6110': 'Arouche',
        '8001': 'Dom José',
        '11576': 'Davó',
        '12055': 'São Bento',
        '12056': 'Marechal',
        '12605': 'Coop',
        '12645': 'Light',
        '14120': 'VD SBC',
        '14353': 'VD SP',
        '20371': 'Luz',
        '21502': 'Bem Barato',
        '23000': 'Outlet',
        '23379': 'Assai Piraporinha'
    };
    
    // Usa ALL_PDVS do constants.js como fonte de verdade dos códigos
    return ALL_PDVS.map(code => {
        const name = pdvNames[code] || `PDV ${code}`;
        return {
            code: code,
            name: name,
            displayName: `${code} - ${name}`
        };
    });
}

// Cache da lista de PDVs (não muda em runtime)
let cachedAvailablePdvs = null;

/**
 * Retorna a lista de PDVs disponíveis (com cache interno).
 * @returns {Array<Object>} Lista de PDVs
 */
function getAvailablePdvs() {
    if (!cachedAvailablePdvs) {
        cachedAvailablePdvs = buildAvailablePdvs();
    }
    return cachedAvailablePdvs;
}

// ============================================================================
// FUNÇÃO PRINCIPAL DE OBTENÇÃO DE DADOS (COM CACHE)
// ============================================================================

/**
 * Função interna para obter os dados.
 * Verifica se o cache é válido (não expirou). Se estiver expirado ou vazio,
 * chama o dataService para processar tudo novamente.
 * @returns {Promise<Object>} Objeto com os dados processados
 */
async function getData() {
    const now = Date.now();

    // Verifica se o cache ainda é válido (TTL de 1 hora)
    if (cachedData && (now - lastFetchTime < CACHE_TTL_MS)) {
        console.log('[api] ✅ Retornando dados do cache (válido).');
        return cachedData;
    }

    console.log('[api] 🔄 Cache expirado ou vazio. Iniciando processamento completo...');
    cachedData = await dataService.processAllData();
    lastFetchTime = now;
    console.log('[api] ✅ Dados processados e armazenados em cache.');

    return cachedData;
}

// ============================================================================
// ROTA GET /data
// ============================================================================

/**
 * Rota GET /api/data
 * Retorna todos os dados processados para o frontend.
 * CORREÇÃO BUG 3: Inclui availablePdvs com lista real de PDVs.
 */
router.get('/data', async (req, res) => {
    const routeLabel = 'GET /api/data';
    try {
        const data = await getData();
        
        // Gera avisos se o dashboard estiver em modo parcial
        const warnings = generateWarnings(data.systemHealth);
        
        // CORREÇÃO BUG 3: Lista real de PDVs para o frontend
        const availablePdvs = getAvailablePdvs();
        
        res.json({
            success: true,
            data,
            warnings,
            availablePdvs // ✅ NOVO: lista real de PDVs
        });
    } catch (error) {
        const classified = classifyError(error);
        logError({ route: routeLabel, error, category: classified.category });

        res.status(500).json({
            success: false,
            message: classified.message,
            errorCategory: classified.category,
            missingEnvVars: classified.missingEnvVars,
            technicalMessage: !classified.isUserFriendly && error ? error.message : undefined
        });
    }
});

// ============================================================================
// ROTA POST /refresh
// ============================================================================

/**
 * Rota POST /api/refresh
 * Força a atualização dos dados, invalidando o cache atual.
 * Equivale ao botão "Forçar Atualização" do Streamlit.
 * CORREÇÃO BUG 3: Inclui availablePdvs com lista real de PDVs.
 */
router.post('/refresh', async (req, res) => {
    const routeLabel = 'POST /api/refresh';
    try {
        console.log(`[api] 🔄 [${getLogTimestamp()}] Recebida requisição para forçar atualização...`);

        // Invalida o cache
        cachedData = null;
        lastFetchTime = 0;

        // Busca os dados novamente
        const data = await getData();
        
        // Gera avisos se o dashboard estiver em modo parcial
        const warnings = generateWarnings(data.systemHealth);
        
        // CORREÇÃO BUG 3: Lista real de PDVs para o frontend
        const availablePdvs = getAvailablePdvs();

        res.json({
            success: true,
            message: 'Dados atualizados com sucesso.',
            data,
            warnings,
            availablePdvs // ✅ NOVO: lista real de PDVs
        });
    } catch (error) {
        const classified = classifyError(error);
        logError({ route: routeLabel, error, category: classified.category });

        res.status(500).json({
            success: false,
            message: `Falha ao forçar atualização. ${classified.message}`,
            errorCategory: classified.category,
            missingEnvVars: classified.missingEnvVars,
            technicalMessage: !classified.isUserFriendly && error ? error.message : undefined
        });
    }
});

// ============================================================================
// CORREÇÃO BUG 3: NOVA ROTA GET /pdvs (endpoint dedicado)
// ============================================================================

/**
 * Rota GET /api/pdvs
 * Retorna a lista de PDVs disponíveis para popular o filtro do frontend.
 * Endpoint dedicado para casos onde o frontend precisa apenas da lista de PDVs
 * sem carregar todos os dados do dashboard.
 */
router.get('/pdvs', (req, res) => {
    try {
        const availablePdvs = getAvailablePdvs();
        res.json({
            success: true,
            data: availablePdvs,
            total: availablePdvs.length
        });
    } catch (error) {
        logError({ 
            route: 'GET /api/pdvs', 
            error, 
            category: 'PROCESSING_ERROR' 
        });
        res.status(500).json({
            success: false,
            message: 'Falha ao carregar lista de PDVs.',
            errorCategory: 'PROCESSING_ERROR'
        });
    }
});

module.exports = router;