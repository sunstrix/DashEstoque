/**
 * constants.js
 * Centraliza todas as constantes do projeto DashEstoque:
 * - URLs das planilhas do Google Sheets
 * - Nomes das abas
 * - Cores do tema visual
 * - TTL de cache
 * - Mapeamento de lojas para PDVs
 * - Nomes das marcas
 */

// ============================================================================
// URLs DAS PLANILHAS (Google Sheets - export xlsx público)
// ============================================================================
// IMPORTANTE: Substitua os valores abaixo pelas URLs reais das suas planilhas.
// O formato esperado é o link público de exportação xlsx do Google Sheets.
const SPREADSHEET_URLS = {
    MAIN: process.env.SPREADSHEET_MAIN_URL || 'COLE_AQUI_A_URL_DA_PLANILHA_PRINCIPAL_XLSX',
    SAFETY: process.env.SPREADSHEET_SAFETY_URL || 'COLE_AQUI_A_URL_DA_PLANILHA_ESTOQUE_SEGURANCA_XLSX',
    DRAFT: process.env.SPREADSHEET_DRAFT_URL || 'COLE_AQUI_A_URL_DA_PLANILHA_DRAFT_CUSTOS_XLSX'
};

// ============================================================================
// NOMES DAS ABAS DAS PLANILHAS
// ============================================================================
const SHEET_NAMES = {
    // Abas da planilha principal (estoque, preço tabela, classe, categoria)
    MAIN: {
        BOTICARIO: 'BOTICARIO',
        EUDORA: 'EUDORA',
        QUEM_DISSE_BERENICE: 'QUEM_DISSE_BERENICE'
    },
    // Abas da planilha de estoque de segurança
    SAFETY: {
        BOT: 'BOT',
        EUD: 'EUD',
        QDB: 'QDB'
    }
};

// ============================================================================
// MAPEAMENTO DE LOJAS PARA OS 17 PDVs
// ============================================================================
// IMPORTANTE: Substitua os valores abaixo pelos nomes reais das lojas
// que correspondem a cada PDV, conforme o draft de custos.
const PDV_MAPPING = {
    'PDV 01': ['LOJA_EXEMPLO_1', 'LOJA_EXEMPLO_2'],
    'PDV 02': ['LOJA_EXEMPLO_3'],
    'PDV 03': ['LOJA_EXEMPLO_4'],
    'PDV 04': ['LOJA_EXEMPLO_5'],
    'PDV 05': ['LOJA_EXEMPLO_6'],
    'PDV 06': ['LOJA_EXEMPLO_7'],
    'PDV 07': ['LOJA_EXEMPLO_8'],
    'PDV 08': ['LOJA_EXEMPLO_9'],
    'PDV 09': ['LOJA_EXEMPLO_10'],
    'PDV 10': ['LOJA_EXEMPLO_11'],
    'PDV 11': ['LOJA_EXEMPLO_12'],
    'PDV 12': ['LOJA_EXEMPLO_13'],
    'PDV 13': ['LOJA_EXEMPLO_14'],
    'PDV 14': ['LOJA_EXEMPLO_15'],
    'PDV 15': ['LOJA_EXEMPLO_16'],
    'PDV 16': ['LOJA_EXEMPLO_17'],
    'PDV 17': ['LOJA_EXEMPLO_18']
};

// Lista de todos os PDVs disponíveis (para filtros)
const ALL_PDVS = Object.keys(PDV_MAPPING);

// ============================================================================
// NOMES DAS MARCAS (utilizado em filtros e legendas)
// ============================================================================
const BRANDS = {
    BOTICARIO: 'O Boticário',
    EUDORA: 'Eudora',
    QUEM_DISSE_BERENICE: 'Quem Disse Berenice?'
};

// Lista de todas as marcas
const ALL_BRANDS = Object.values(BRANDS);

// ============================================================================
// CORES DO TEMA VISUAL
// ============================================================================
const THEME_COLORS = {
    BACKGROUND: '#0e1117',
    BOTICARIO_GREEN: '#007A33',
    GOLD: '#D4AF37',
    EUDORA_PURPLE: '#a855f7',
    QDB_RED: '#ff4b4b',
    TEXT_PRIMARY: '#ffffff',
    TEXT_SECONDARY: '#cccccc',
    BORDER: '#333333'
};

// Mapeamento de marca para cor (usado nos gráficos)
const BRAND_COLORS = {
    [BRANDS.BOTICARIO]: THEME_COLORS.BOTICARIO_GREEN,
    [BRANDS.EUDORA]: THEME_COLORS.EUDORA_PURPLE,
    [BRANDS.QUEM_DISSE_BERENICE]: THEME_COLORS.QDB_RED
};

// ============================================================================
// CONFIGURAÇÕES DE CACHE
// ============================================================================
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora em milissegundos (equivale ao @st.cache_data(ttl=3600))

// ============================================================================
// CONFIGURAÇÕES DE RETRY (download das planilhas)
// ============================================================================
const RETRY_CONFIG = {
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 1000,
    TIMEOUT_MS: 30000
};

// ============================================================================
// EXPORTAÇÃO
// ============================================================================
module.exports = {
    SPREADSHEET_URLS,
    SHEET_NAMES,
    PDV_MAPPING,
    ALL_PDVS,
    BRANDS,
    ALL_BRANDS,
    THEME_COLORS,
    BRAND_COLORS,
    CACHE_TTL_MS,
    RETRY_CONFIG
};