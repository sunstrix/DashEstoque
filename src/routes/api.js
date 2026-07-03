/**
 * api.js
 * Define as rotas da API REST utilizando Express Router.
 * - GET /data: Retorna os dados processados (utiliza cache em memória).
 * - POST /refresh: Força a atualização dos dados, limpando o cache.
 * - Implementa cache em memória com TTL de 1 hora para otimizar performance.
 */

const express = require('express');
const router = express.Router();

const dataService = require('../services/dataService');
const { CACHE_TTL_MS } = require('../config/constants');

// Variáveis de controle do cache em memória
let cachedData = null;
let lastFetchTime = 0;

/**
 * Função interna para obter os dados.
 * Verifica se o cache é válido (não expirou). Se estiver expirado ou vazio,
 * chama o dataService para processar tudo novamente.
 * @returns {Promise<Object>} - Objeto com os dados processados.
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

/**
 * Rota GET /data
 * Retorna todos os dados processados para o frontend.
 */
router.get('/data', async (req, res) => {
    try {
        const data = await getData();
        res.json({ 
            success: true, 
            data 
        });
    } catch (error) {
        console.error('[api] ❌ Erro ao processar dados:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno ao processar os dados do dashboard.', 
            error: error.message 
        });
    }
});

/**
 * Rota POST /refresh
 * Força a atualização dos dados, invalidando o cache atual.
 * Equivale ao botão "Forçar Atualização" do Streamlit.
 */
router.post('/refresh', async (req, res) => {
    try {
        console.log('[api] 🔄 Recebida requisição para forçar atualização...');
        
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
        console.error('[api] ❌ Erro ao forçar atualização:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro ao forçar a atualização dos dados.', 
            error: error.message 
        });
    }
});

module.exports = router;