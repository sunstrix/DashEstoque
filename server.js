/**
 * server.js
 * Ponto de entrada da aplicação DashEstoque.
 * 
 * Fluxo de inicialização:
 * 1. Carrega variáveis de ambiente do arquivo .env
 * 2. Valida variáveis de ambiente (obrigatórias e opcionais)
 * 3. Se variável obrigatória faltar → encerra com erro
 * 4. Se variáveis opcionais faltarem → loga avisos mas continua
 * 5. Configura Express com middlewares, rotas e servidor estático
 * 6. Inicia o servidor HTTP
 */

// ============================================================================
// 1) CARREGAMENTO DE VARIÁVEIS DE AMBIENTE
// ============================================================================
require('dotenv').config();

// ============================================================================
// 2) VALIDAÇÃO DE VARIÁVEIS DE AMBIENTE (ANTES DE QUALQUER OUTRA CONFIGURAÇÃO)
// ============================================================================
const {
    validateEnvironment,
    logValidationResult,
    getMissingRequiredVars
} = require('./src/config/validateEnv');

const validationResult = validateEnvironment();

// Loga o resultado da validação de forma clara e estruturada
logValidationResult(validationResult);

// Se houver variáveis OBRIGATÓRIAS faltando, encerra o servidor imediatamente
const missingRequired = getMissingRequiredVars(validationResult);
if (missingRequired.length > 0) {
    console.error('');
    console.error('============================================================');
    console.error('  [server.js] ❌ ERRO FATAL: SERVIDOR NÃO INICIADO');
    console.error('============================================================');
    console.error('');
    console.error(`  Variável(is) obrigatória(s) ausente(s): ${missingRequired.join(', ')}`);
    console.error('');
    console.error('  Abra o arquivo .env na raiz do projeto e configure as variáveis.');
    console.error('  Consulte .env.example para referência.');
    console.error('');
    console.error('============================================================');
    console.error('');
    process.exit(1);
}

// Se houver variáveis OPCIONAIS faltando, loga aviso mas continua
if (validationResult.missingOptional.length > 0) {
    console.warn('');
    console.warn('============================================================');
    console.warn('  [server.js] ⚠️  AVISO: SERVIDOR INICIANDO EM MODO PARCIAL');
    console.warn('============================================================');
    console.warn('');
    console.warn(`  Variável(is) opcional(is) ausente(s): ${validationResult.missingOptional.join(', ')}`);
    console.warn('');
    console.warn('  O dashboard funcionará, mas sem os dados dessas planilhas:');
    for (const varName of validationResult.missingOptional) {
        const info = validationResult.optional[varName];
        if (info && info.impact) {
            console.warn(`    - ${varName}: ${info.impact}`);
        }
    }
    console.warn('');
    console.warn('  Para habilitar todos os recursos, configure as variáveis no .env.');
    console.warn('============================================================');
    console.warn('');
}

// ============================================================================
// 3) IMPORTAÇÕES DE MÓDULOS (APÓS VALIDAÇÃO BEM-SUCEDIDA)
// ============================================================================
const express = require('express');
const cors = require('cors');
const path = require('path');

const apiRoutes = require('./src/routes/api');

// ============================================================================
// 4) CONFIGURAÇÃO DO EXPRESS
// ============================================================================
const app = express();
const PORT = validationResult.port; // Usa porta validada (ou default 3000)

// Middlewares globais
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos (HTML, CSS, JS do frontend)
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// 5) ROTAS DA API
// ============================================================================
app.use('/api', apiRoutes);

// Rota raiz para servir o index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================================
// 6) INICIALIZAÇÃO DO SERVIDOR
// ============================================================================
app.listen(PORT, () => {
    console.log('');
    console.log('============================================================');
    console.log(`  [DashEstoque] ✅ Servidor rodando em http://localhost:${PORT}`);
    console.log('============================================================');
    console.log('');
    console.log('  📊 Dashboard disponível em:');
    console.log(`     http://localhost:${PORT}`);
    console.log('');
    console.log('  🔌 API endpoints:');
    console.log(`     GET  http://localhost:${PORT}/api/data    (dados processados)`);
    console.log(`     POST http://localhost:${PORT}/api/refresh (forçar atualização)`);
    console.log('');
    console.log('  Para parar o servidor, pressione CTRL+C.');
    console.log('============================================================');
    console.log('');
});

// ============================================================================
// 7) TRATAMENTO DE ERROS NÃO CAPTURADOS
// ============================================================================
process.on('uncaughtException', (error) => {
    console.error('');
    console.error('============================================================');
    console.error('  [server.js] ❌ ERRO NÃO CAPTURADO (uncaughtException)');
    console.error('============================================================');
    console.error('');
    console.error(`  Mensagem: ${error.message}`);
    console.error(`  Stack: ${error.stack}`);
    console.error('');
    console.error('  O servidor continuará rodando, mas este erro pode indicar');
    console.error('  um problema que precisa ser corrigido.');
    console.error('============================================================');
    console.error('');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('');
    console.error('============================================================');
    console.error('  [server.js] ❌ PROMISE REJEITADA NÃO TRATADA');
    console.error('============================================================');
    console.error('');
    console.error(`  Razão: ${reason}`);
    console.error('');
    console.error('  Este erro pode indicar um problema assíncrono não tratado.');
    console.error('============================================================');
    console.error('');
});