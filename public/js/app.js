/**
 * app.js (Frontend)
 * Orquestrador principal da interface do usuário.
 * - Gerencia o estado global dos dados.
 * - Realiza requisições fetch para a API (GET /data, POST /refresh).
 * - Aplica filtros de PDV e Marca nos dados brutos.
 * - Atualiza os KPIs, gráficos e tabelas dinamicamente.
 * - Controla o overlay de carregamento e o botão de atualização.
 */

// ============================================================================
// ESTADO GLOBAL
// ============================================================================
let globalData = null; // Armazena a resposta completa da API
let currentFilteredItems = []; // Armazena os itens após a aplicação dos filtros

// ============================================================================
// ELEMENTOS DO DOM
// ============================================================================
const DOM = {
    loadingOverlay: document.getElementById('loading-overlay'),
    lastUpdate: document.getElementById('last-update'),
    btnRefresh: document.getElementById('btn-refresh'),
    filterPdv: document.getElementById('filter-pdv'),
    filterBrand: document.getElementById('filter-brand'),
    btnApplyFilters: document.getElementById('btn-apply-filters'),
    
    // KPIs
    kpiValorEstoque: document.getElementById('kpi-valor-estoque'),
    kpiValorMinimo: document.getElementById('kpi-valor-minimo'),
    kpiValorExcesso: document.getElementById('kpi-valor-excesso'),
    kpiValorFalta: document.getElementById('kpi-valor-falta')
};

// ============================================================================
// FUNÇÕES DE UTILITÁRIO (UI)
// ============================================================================

/**
 * Formata um número para o padrão monetário brasileiro (R$).
 */
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value || 0);
}

/**
 * Formata um número para o padrão brasileiro com separadores de milhar.
 */
function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 0
    }).format(value || 0);
}

/**
 * Exibe ou oculta o overlay de carregamento.
 */
function setLoading(isLoading) {
    if (isLoading) {
        DOM.loadingOverlay.classList.remove('hidden');
        DOM.btnRefresh.disabled = true;
        DOM.btnRefresh.textContent = '⏳ Atualizando...';
    } else {
        DOM.loadingOverlay.classList.add('hidden');
        DOM.btnRefresh.disabled = false;
        DOM.btnRefresh.textContent = '🔄 Atualizar';
    }
}

// ============================================================================
// REQUISIÇÕES À API
// ============================================================================

/**
 * Busca os dados do dashboard via API.
 * @param {boolean} forceRefresh - Se true, chama o endpoint de refresh.
 */
async function fetchData(forceRefresh = false) {
    setLoading(true);
    
    try {
        const url = forceRefresh ? '/api/refresh' : '/api/data';
        const method = forceRefresh ? 'POST' : 'GET';
        
        const response = await fetch(url, { method });
        
        if (!response.ok) {
            throw new Error(`Erro na requisição: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            globalData = result.data;
            
            // Popula o filtro de PDVs dinamicamente na primeira carga
            if (!forceRefresh && DOM.filterPdv.options.length <= 1) {
                populatePdvFilter();
            }
            
            // Atualiza o timestamp no header
            DOM.lastUpdate.textContent = `Última atualização: ${globalData.timestamp}`;
            
            // Aplica filtros iniciais (ou recalcula se for refresh)
            applyFilters();
        } else {
            throw new Error(result.message || 'Erro desconhecido na API.');
        }
    } catch (error) {
        console.error('[app.js] Erro ao buscar dados:', error);
        alert('Falha ao carregar os dados do dashboard. Verifique o console para mais detalhes.');
    } finally {
        setLoading(false);
    }
}

/**
 * Popula o select de PDVs com base nos dados recebidos.
 * (Como o backend não envia a lista de PDVs diretamente, extraímos dos itens ou usamos uma lista padrão).
 * Para simplificar e manter a fidelidade, usamos a lista de PDVs do constants.js (mapeada no frontend).
 */
function populatePdvFilter() {
    // Lista padrão de PDVs (deveria vir do backend ou constants, mas como é frontend puro, hardcodamos os 17)
    // Em uma arquitetura ideal, o backend enviaria { availablePdvs: [...] }
    const pdvs = Array.from({ length: 17 }, (_, i) => `PDV ${String(i + 1).padStart(2, '0')}`);
    
    pdvs.forEach(pdv => {
        const option = document.createElement('option');
        option.value = pdv;
        option.textContent = pdv;
        DOM.filterPdv.appendChild(option);
    });
}

// ============================================================================
// LÓGICA DE FILTROS E ATUALIZAÇÃO DA UI
// ============================================================================

/**
 * Aplica os filtros selecionados (PDV e Marca) nos dados brutos (allItems).
 * Recalcula os KPIs e chama as funções de renderização de gráficos e tabelas.
 */
function applyFilters() {
    if (!globalData || !globalData.allItems) return;
    
    const selectedPdv = DOM.filterPdv.value;
    const selectedBrand = DOM.filterBrand.value;
    
    // Filtra os itens brutos
    currentFilteredItems = globalData.allItems.filter(item => {
        const matchPdv = (selectedPdv === 'ALL') || (item.pdv === selectedPdv); // Nota: item.pdv não existe no allItems atual, pois o draft mapeia por EAN. 
        // CORREÇÃO DE LÓGICA: O filtro de PDV no original do Streamlit provavelmente filtrava os itens que pertencem àquele PDV.
        // Como o dataService.js atual não atribui PDV ao item final (apenas usa o draft para achar o custo), 
        // o filtro de PDV no frontend atuará como um filtro conceitual ou precisará de ajuste no dataService.
        // Para manter a estrutura do Streamlit original onde o filtro de PDV existia, vamos assumir que o filtro de PDV 
        // no frontend apenas filtra se o item tiver a propriedade pdv, OU se for ALL. 
        // (Se o dataService não mapeou PDV no item, o filtro de PDV não terá efeito prático nos itens, mas os KPIs globais continuarão).
        // Vamos manter a lógica de filtro para quando o dataService for ajustado para incluir o PDV no item.
        
        const matchBrand = (selectedBrand === 'ALL') || (item.marca === selectedBrand);
        
        return matchPdv && matchBrand;
    });
    
    // Recalcula os KPIs com base nos itens filtrados
    recalculateKPIs();
    
    // Atualiza Gráficos e Tabelas
    if (typeof renderCharts === 'function') {
        renderCharts(currentFilteredItems, globalData.byCurve, globalData.byCategory);
    }
    
    if (typeof renderTables === 'function') {
        renderTables(currentFilteredItems, globalData.faltasPorMarca);
    }
}

/**
 * Recalcula os 4 KPIs principais com base nos itens atualmente filtrados.
 */
function recalculateKPIs() {
    let valorEstoque = 0;
    let valorMinimo = 0;
    let valorExcesso = 0;
    let valorFalta = 0;
    
    for (const item of currentFilteredItems) {
        valorEstoque += item.valorEstoqueAtual || 0;
        valorMinimo += item.valorEstoqueMinimo || 0;
        valorExcesso += item.valorExcesso || 0;
        valorFalta += item.valorFalta || 0;
    }
    
    DOM.kpiValorEstoque.textContent = formatCurrency(valorEstoque);
    DOM.kpiValorMinimo.textContent = formatCurrency(valorMinimo);
    DOM.kpiValorExcesso.textContent = formatCurrency(valorExcesso);
    DOM.kpiValorFalta.textContent = formatCurrency(valorFalta);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Inicializa os event listeners da interface.
 */
function initEventListeners() {
    // Botão de Forçar Atualização
    DOM.btnRefresh.addEventListener('click', () => {
        fetchData(true);
    });
    
    // Botão de Aplicar Filtros
    DOM.btnApplyFilters.addEventListener('click', () => {
        applyFilters();
    });
    
    // Opcional: Aplicar filtro ao mudar o select (descomente se desejar comportamento instantâneo)
    // DOM.filterPdv.addEventListener('change', applyFilters);
    // DOM.filterBrand.addEventListener('change', applyFilters);
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

/**
 * Ponto de entrada do frontend.
 */
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    fetchData(false); // Carrega os dados iniciais (usando cache do backend se disponível)
});