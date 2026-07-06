/**
 * constants.js
 * Centraliza todas as constantes do projeto DashEstoque:
 * - URLs das planilhas do SharePoint (migradas do Google Sheets)
 * - Nomes das abas das planilhas Excel
 * - Mapeamento de lojas para os 17 PDVs
 * - Cores do tema visual
 * - TTL de cache
 */

// ============================================================================
// URLs DAS PLANILHAS (SharePoint - links públicos com download direto)
// ============================================================================
const SPREADSHEET_URLS = {
    // Planilha principal: CONSULTA_DE_ESTOQUE.xlsx
    MAIN: process.env.SPREADSHEET_MAIN_URL || '',
    
    // Planilha de estoque de segurança: Planilha Retaguarda.xlsx
    SAFETY_STOCK: process.env.SPREADSHEET_SAFETY_STOCK_URL || '',
    
    // Planilha draft de custos: DRAFT_PDVS.xlsx
    DRAFT: process.env.SPREADSHEET_DRAFT_URL || '',
    
    // Planilha de ignorados: IGNORADOS.xlsx
    IGNORED: process.env.SPREADSHEET_IGNORED_URL || ''
};

// ============================================================================
// NOMES DAS ABAS DAS PLANILHAS
// ============================================================================
const SHEET_NAMES = {
    // Abas da planilha principal (estoque, preço tabela, classe, categoria)
    // ATENÇÃO: Estes nomes devem corresponder EXATAMENTE aos nomes das abas no Excel
    // (case-insensitive, mas preferencialmente em maiúsculas)
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
// Este mapeamento é usado para converter o nome da loja (da planilha draft)
// para o código numérico do PDV que aparece no frontend
const PDV_MAPPING = {
    '4842': ['4842', 'METROPOLE', 'N. S. F. COSMETICOS E PRESENTES LTDA', 'LOJA: 4842'],
    '5152': ['5152', 'CORACAO', 'N. S. F. COSMETICOS E PRESENTES LTDA', 'LOJA: 5152'],
    '6105': ['6105', 'ASSAI ANCHIETA', 'N. S. F. COSMETICOS E PRESENTES LTDA', 'LOJA: 6105'],
    '6106': ['6106', 'DIREITA', 'N. S. F. COSMETICOS E PRESENTES LTDA', 'LOJA: 6106'],
    '6110': ['6110', 'AROCHE', 'N. S. F. COSMETICOS E PRESENTES LTDA', 'LOJA: 6110'],
    '8001': ['8001', 'DOM JOSE', 'N. S. F. COSMETICOS E PRESENTES LTDA', 'LOJA: 8001'],
    '11576': ['11576', 'DAVO', 'N. S. F. COSMETICOS E PRESENTES LTDA', 'LOJA: 11576'],
    '12055': ['12055', 'SAO BENTO', 'N. S. F. COSMETICOS E PRESENTES LTDA', 'LOJA: 12055'],
    '12056': ['12056', 'MARECHAL', 'S. P. ARON COSMETICOS EPP', 'LOJA: 12056'],
    '12605': ['12605', 'COOP', 'N.S.F. COSMETICOS E PRESENTES LTDA.', 'LOJA: 12605'],
    '12645': ['12645', 'LIGHT', 'N. S. F. COSMETICOS E PRESENTES LTDA', 'LOJA: 12645'],
    '14120': ['14120', 'VD SBC', 'ARPEL DISTRIBUIDORA DE COSMETICOS LTDA - EPP', 'LOJA: 14120'],
    '14353': ['14353', 'VD SP', 'ARPEL DISTRIBUIDORA DE COSMETICOS LTDA - EPP', 'LOJA: 14353'],
    '20371': ['20371', 'LUZ', 'N. S. F. COSMÉTICOS E PRESENTES LTDA.', 'LOJA: 20371'],
    '21502': ['21502', 'BEM BARATO', 'N. S. F. COSMETICOS E PRESENTES LTD', 'LOJA: 21502'],
    '23000': ['23000', 'OUTLET', 'N. S. F. COSMETICOS E PRESENTES LTD', 'LOJA: 23000'],
    '23379': ['23379', 'ASSAI PIRAPORINHA', 'N. S. F. COSMETICOS E PRESENTES LTD', 'LOJA: 23379']
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
    BORDER: '#30363d'
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
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora em milissegundos

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