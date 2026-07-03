/**
 * api.js
 * Define as rotas da API REST utilizando Express Router.
 * - GET /api/data: Retorna os dados processados (utiliza cache em memória)
 * - POST /api/refresh: Força a atualização dos dados, limpando o cache
 * - Implementa cache em memória com TTL de 1 hora para otimizar performance
 * - Tratamento robusto de erros com logs estruturados e mensagens acionáveis
 */

const express = require('express');
const router = express.Router();

const dataService = require('../services/dataService');
const { CACHE_TTL_MS } = require('../config/constants');

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
 *
 * @param {Error} error - Objeto de erro capturado
 * @returns {{ category: string, message: string, isUserFriendly: boolean }}
 */
function classifyError(error) {
    const msg = (error && error.message) || 'Erro desconhecido';
    const stack = (error && error.stack) || '';

    // Categoria 1: Erros de download (SharePoint/Google Sheets)
    if (msg.includes('[downloadService]') || msg.toLowerCase().includes('download')) {
        return {
            category: 'DOWNLOAD_ERROR',
            message: 'Falha ao baixar uma ou mais planilhas. Verifique se as URLs no .env estão corretas e se as planilhas estão compartilhadas publicamente.',
            isUserFriendly: true
        };
    }

    // Categoria 2: URL inválida ou não configurada
    if (msg.includes('URL inválida') || msg.includes('não configurada') || msg.includes('placeholder')) {
        return {
            category: 'CONFIG_ERROR',
            message: 'Configuração incorreta. Verifique o arquivo .env e certifique-se de que todas as URLs das planilhas estão definidas.',
            isUserFriendly: true
        };
    }

    // Categoria 3: Erros de parsing de planilha (estrutura incorreta, colunas ausentes)
    if (msg.includes('sheet_to_json') || msg.includes('XLSX') || msg.toLowerCase().includes('aba') || msg.toLowerCase().includes('coluna')) {
        return {
            category: 'PARSING_ERROR',
            message: 'Erro ao processar planilha. Verifique se as abas e colunas estão nomeadas conforme o esperado (BOTICARIO, EUDORA, QUEM_DISSE_BERENICE, etc.).',
            isUserFriendly: true
        };
    }

    // Categoria 4: Erros de rede/conectividade
    if (msg.includes('ECONN') || msg.includes('ETIMEDOUT') || msg.includes('network') || msg.includes('timeout')) {
        return {
            category: 'NETWORK_ERROR',
            message: 'Problema de conectividade. Verifique sua conexão com a internet e tente novamente.',
            isUserFriendly: true
        };
    }

    // Categoria 5: Erros genéricos de processamento
    return {
        category: 'PROCESSING_ERROR',
        message: msg.length > 200 ? msg.substring(0, 200) + '...' : msg,
        isUserFriendly: false
    };
}

/**
 * Registra log estruturado de erro no console do servidor.
 * Inclui timestamp, categoria, método HTTP, path e stack trace.
 *
 * @param {Object} options - Opções do log
 * @param {string} options.route - Rota onde ocorreu o erro (ex: 'GET /api/data')
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
 */
router.get('/data', async (req, res) => {
    const routeLabel = 'GET /api/data';
    try {
        const data = await getData();
        res.json({
            success: true,
            data
        });
    } catch (error) {
        const classified = classifyError(error);
        logError({ route: routeLabel, error, category: classified.category });

        res.status(500).json({
            success: false,
            message: classified.message,
            errorCategory: classified.category,
            // Inclui mensagem técnica apenas para erros não-amigáveis (ajuda dev)
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

        res.json({
            success: true,
            message: 'Dados atualizados com sucesso.',
            data
        });
    } catch (error) {
        const classified = classifyError(error);
        logError({ route: routeLabel, error, category: classified.category });

        // Em caso de erro no refresh, tenta restaurar o cache anterior se existir
        // (a invalidação foi feita, mas se o novo processamento falhou, não há o que restaurar —
        //  apenas logamos e retornamos erro claro)

        res.status(500).json({
            success: false,
            message: `Falha ao forçar atualização. ${classified.message}`,
            errorCategory: classified.category,
            technicalMessage: !classified.isUserFriendly && error ? error.message : undefined
        });
    }
});

module.exports = router;