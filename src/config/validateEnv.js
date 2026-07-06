/**
 * validateEnv.js
 * Validador de variáveis de ambiente do projeto DashEstoque.
 * 
 * Classifica cada variável em:
 * - OBRIGATÓRIA: se faltar, o servidor NÃO inicia (erro fatal)
 * - OPCIONAL: se faltar, loga aviso mas o servidor inicia normalmente
 * 
 * Este módulo é chamado no server.js ANTES de iniciar o servidor,
 * evitando que o usuário descubra erros só ao clicar no dashboard.
 */

// ============================================================================
// DEFINIÇÃO DAS VARIÁVEIS DE AMBIENTE
// ============================================================================

/**
 * Lista de variáveis de ambiente obrigatórias.
 * Se qualquer uma destas faltar, o servidor NÃO deve iniciar.
 */
const REQUIRED_ENV_VARS = [
    {
        name: 'SPREADSHEET_MAIN_URL',
        description: 'URL da planilha principal (estoque, preços, classes, categorias)',
        impact: 'Sem esta planilha, o dashboard não tem dados para exibir'
    }
];

/**
 * Lista de variáveis de ambiente opcionais.
 * Se alguma destas faltar, o servidor inicia mas loga aviso.
 * O dashboard funcionará parcialmente (sem os dados daquela planilha).
 */
const OPTIONAL_ENV_VARS = [
    {
        name: 'SPREADSHEET_DRAFT_URL',
        description: 'URL da planilha draft de custos (mapeamento de PDVs e custos)',
        impact: 'Sem esta planilha, o custo draft será 0 para todos os itens (usará apenas preço de tabela)'
    },
    {
        name: 'SPREADSHEET_SAFETY_STOCK_URL',
        description: 'URL da planilha de estoque de segurança (mínimos por SKU)',
        impact: 'Sem esta planilha, não haverá cálculo de excesso/falta (todos os mínimos serão 0)'
    },
    {
        name: 'SPREADSHEET_IGNORED_URL',
        description: 'URL da planilha de itens ignorados (sacolas, produtos irrelevantes)',
        impact: 'Sem esta planilha, itens como sacolas aparecerão nos cálculos (podendo inflar valores)'
    }
];

/**
 * Variável de ambiente da porta do servidor (opcional, com default 3000).
 */
const PORT_ENV_VAR = {
    name: 'PORT',
    description: 'Porta onde o servidor será executado',
    defaultValue: 3000
};

// ============================================================================
// FUNÇÃO PRINCIPAL DE VALIDAÇÃO
// ============================================================================

/**
 * Valida todas as variáveis de ambiente necessárias.
 * 
 * @returns {Object} Resultado da validação com a estrutura:
 * {
 *   isValid: boolean,              // true se todas as obrigatórias existem
 *   required: { name: { exists, value } },  // Status das obrigatórias
 *   optional: { name: { exists, value } },  // Status das opcionais
 *   missingRequired: string[],     // Lista de obrigatórias ausentes
 *   missingOptional: string[],     // Lista de opcionais ausentes
 *   port: number                   // Porta configurada (ou default)
 * }
 */
function validateEnvironment() {
    const result = {
        isValid: true,
        required: {},
        optional: {},
        missingRequired: [],
        missingOptional: [],
        port: parseInt(process.env.PORT, 10) || PORT_ENV_VAR.defaultValue
    };

    // ------------------------------------------------------------------------
    // 1) Verifica variáveis OBRIGATÓRIAS
    // ------------------------------------------------------------------------
    for (const envVar of REQUIRED_ENV_VARS) {
        const value = process.env[envVar.name];
        const exists = value !== undefined && value !== null && value.trim() !== '';
        
        result.required[envVar.name] = {
            exists,
            value: exists ? value : undefined,
            description: envVar.description,
            impact: envVar.impact
        };

        if (!exists) {
            result.isValid = false;
            result.missingRequired.push(envVar.name);
        }
    }

    // ------------------------------------------------------------------------
    // 2) Verifica variáveis OPCIONAIS
    // ------------------------------------------------------------------------
    for (const envVar of OPTIONAL_ENV_VARS) {
        const value = process.env[envVar.name];
        const exists = value !== undefined && value !== null && value.trim() !== '';
        
        result.optional[envVar.name] = {
            exists,
            value: exists ? value : undefined,
            description: envVar.description,
            impact: envVar.impact
        };

        if (!exists) {
            result.missingOptional.push(envVar.name);
        }
    }

    return result;
}

// ============================================================================
// FUNÇÃO DE LOG DE RESULTADOS
// ============================================================================

/**
 * Loga no console o resultado da validação de forma clara e colorida.
 * 
 * @param {Object} validationResult - Resultado retornado por validateEnvironment()
 */
function logValidationResult(validationResult) {
    console.log('');
    console.log('============================================================');
    console.log('  [validateEnv] VALIDAÇÃO DE VARIÁVEIS DE AMBIENTE');
    console.log('============================================================');

    // ------------------------------------------------------------------------
    // Variáveis OBRIGATÓRIAS
    // ------------------------------------------------------------------------
    console.log('');
    console.log('  📋 Variáveis OBRIGATÓRIAS:');
    
    for (const [name, info] of Object.entries(validationResult.required)) {
        if (info.exists) {
            // Trunca a URL para não poluir o log
            const truncated = info.value.length > 60 
                ? info.value.substring(0, 60) + '...' 
                : info.value;
            console.log(`     ✅ ${name}: configurada`);
            console.log(`        ${truncated}`);
        } else {
            console.log(`     ❌ ${name}: NÃO CONFIGURADA`);
            console.log(`        Descrição: ${info.description}`);
            console.log(`        Impacto: ${info.impact}`);
        }
    }

    // ------------------------------------------------------------------------
    // Variáveis OPCIONAIS
    // ------------------------------------------------------------------------
    console.log('');
    console.log('  📋 Variáveis OPCIONAIS:');
    
    for (const [name, info] of Object.entries(validationResult.optional)) {
        if (info.exists) {
            const truncated = info.value.length > 60 
                ? info.value.substring(0, 60) + '...' 
                : info.value;
            console.log(`     ✅ ${name}: configurada`);
            console.log(`        ${truncated}`);
        } else {
            console.log(`     ⚠️  ${name}: não configurada`);
            console.log(`        Descrição: ${info.description}`);
            console.log(`        Impacto: ${info.impact}`);
        }
    }

    // ------------------------------------------------------------------------
    // Porta do servidor
    // ------------------------------------------------------------------------
    console.log('');
    console.log(`  🔌 Porta do servidor: ${validationResult.port}`);

    // ------------------------------------------------------------------------
    // Resumo final
    // ------------------------------------------------------------------------
    console.log('');
    if (validationResult.isValid && validationResult.missingOptional.length === 0) {
        console.log('  ✅ Todas as variáveis de ambiente estão configuradas corretamente.');
    } else if (validationResult.isValid) {
        console.log(`  ⚠️  Servidor pode iniciar, mas ${validationResult.missingOptional.length} variável(is) opcional(is) está(ão) faltando.`);
        console.log(`     O dashboard funcionará parcialmente.`);
    } else {
        console.log(`  ❌ ERRO FATAL: ${validationResult.missingRequired.length} variável(is) obrigatória(s) não configurada(s).`);
        console.log(`     O servidor NÃO pode iniciar.`);
        console.log('');
        console.log('     Variáveis faltando:');
        for (const varName of validationResult.missingRequired) {
            const info = validationResult.required[varName];
            console.log(`       - ${varName}`);
            console.log(`         ${info.impact}`);
        }
        console.log('');
        console.log('     Configure as variáveis no arquivo .env e reinicie o servidor.');
        console.log('     Consulte .env.example para referência.');
    }
    console.log('============================================================');
    console.log('');
}

// ============================================================================
// FUNÇÃO AUXILIAR: OBTER LISTA DE VARIÁVEIS AUSENTES
// ============================================================================

/**
 * Retorna lista combinada de todas as variáveis ausentes (obrigatórias + opcionais).
 * Útil para enviar ao frontend em respostas de erro.
 * 
 * @param {Object} validationResult - Resultado de validateEnvironment()
 * @returns {string[]} Lista de nomes de variáveis ausentes
 */
function getMissingEnvVars(validationResult) {
    return [
        ...validationResult.missingRequired,
        ...validationResult.missingOptional
    ];
}

/**
 * Retorna lista apenas das variáveis OBRIGATÓRIAS ausentes.
 * 
 * @param {Object} validationResult - Resultado de validateEnvironment()
 * @returns {string[]} Lista de nomes de variáveis obrigatórias ausentes
 */
function getMissingRequiredVars(validationResult) {
    return validationResult.missingRequired;
}

/**
 * Retorna lista apenas das variáveis OPCIONAIS ausentes.
 * 
 * @param {Object} validationResult - Resultado de validateEnvironment()
 * @returns {string[]} Lista de nomes de variáveis opcionais ausentes
 */
function getMissingOptionalVars(validationResult) {
    return validationResult.missingOptional;
}

// ============================================================================
// EXPORTAÇÃO
// ============================================================================

module.exports = {
    validateEnvironment,
    logValidationResult,
    getMissingEnvVars,
    getMissingRequiredVars,
    getMissingOptionalVars,
    REQUIRED_ENV_VARS,
    OPTIONAL_ENV_VARS,
    PORT_ENV_VAR
};