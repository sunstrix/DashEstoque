/**
 * app.js (Frontend)
 * Orquestrador principal da interface do usuário.
 * - Gerencia o estado global dos dados.
 * - Realiza requisições fetch para a API (GET /data, POST /refresh).
 * - Aplica filtros de PDV e Marca nos dados brutos.
 * - Atualiza os KPIs, gráficos e tabelas dinamicamente.
 * - Controla o overlay de carregamento, o botão de atualização e o badge de itens ignorados.
 * - CORREÇÃO BUG 3: Consome lista real de PDVs do backend (availablePdvs) em vez de hardcode.
 */

// ============================================================================
// ESTADO GLOBAL
// ============================================================================
let globalData = null;        // Armazena a resposta completa da API
let currentFilteredItems = []; // Armazena os itens após a aplicação dos filtros
let availablePdvs = [];       // Lista real de PDVs (do backend)

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
    
    // Badge de itens ignorados
    ignoredBadge: document.getElementById('ignored-badge'),
    ignoredCount: document.getElementById('ignored-count'),
    
    // Container de avisos (modo parcial)
    warningsContainer: document.getElementById('warnings-container'),
    
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

/**
 * Atualiza o badge de itens ignorados no header.
 * Exibe o badge apenas se houver itens ignorados (> 0).
 * @param {number} count - Quantidade de itens ignorados.
 */
function updateIgnoredBadge(count) {
    if (!DOM.ignoredBadge || !DOM.ignoredCount) return;
    
    if (count && count > 0) {
        DOM.ignoredCount.textContent = formatNumber(count);
        DOM.ignoredBadge.classList.remove('hidden');
    } else {
        DOM.ignoredBadge.classList.add('hidden');
    }
}

/**
 * Renderiza avisos (warnings) do backend no topo do dashboard.
 * Esses avisos indicam quando o dashboard está em "modo parcial"
 * (ex: planilha draft ausente, safety stock ausente, etc.).
 * 
 * @param {Array<string>} warnings - Array de mensagens de aviso
 */
function renderWarnings(warnings) {
    if (!DOM.warningsContainer) return;
    
    // Limpa avisos anteriores
    DOM.warningsContainer.innerHTML = '';
    
    if (!warnings || warnings.length === 0) {
        DOM.warningsContainer.classList.add('hidden');
        return;
    }
    
    // Cria banner de aviso para cada mensagem
    for (const warning of warnings) {
        const banner = document.createElement('div');
        banner.className = 'warning-banner';
        banner.innerHTML = `<span class="warning-icon">⚠️</span><span>${warning}</span>`;
        DOM.warningsContainer.appendChild(banner);
    }
    
    DOM.warningsContainer.classList.remove('hidden');
}

// ============================================================================
// CORREÇÃO BUG 3: POPULAR SELECT DE PDVs COM LISTA REAL DO BACKEND
// ============================================================================

/**
 * Popula o <select> de PDVs com a lista real vinda do backend.
 * CORREÇÃO BUG 3: Substitui a versão hardcoded ("PDV 01"..."PDV 17")
 * por valores reais como "4842 - Metrópole", "5152 - Coração", etc.
 * 
 * @param {Array<Object>} pdvs - Lista de PDVs do backend
 *   Cada PDV tem: { code: '4842', name: 'Metrópole', displayName: '4842 - Metrópole' }
 */
function populatePdvFilter(pdvs) {
    if (!DOM.filterPdv) return;
    
    // Preserva a opção "Todos os PDVs" que já existe no HTML
    // Remove apenas as opções adicionadas dinamicamente anteriormente
    const allOptions = Array.from(DOM.filterPdv.options);
    for (let i = allOptions.length - 1; i >= 1; i--) {
        DOM.filterPdv.remove(i);
    }
    
    // Se não há PDVs disponíveis, adiciona opção indicando isso
    if (!pdvs || pdvs.length === 0) {
        const emptyOption = document.createElement('option');
        emptyOption.value = 'ALL';
        emptyOption.textContent = 'Nenhum PDV disponível';
        emptyOption.disabled = true;
        DOM.filterPdv.appendChild(emptyOption);
        return;
    }
    
    // Adiciona uma opção para cada PDV real
    for (const pdv of pdvs) {
        const option = document.createElement('option');
        option.value = pdv.code;
        option.textContent = pdv.displayName;
        DOM.filterPdv.appendChild(option);
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
            // Tenta ler a resposta de erro estruturada
            let errorData = null;
            try {
                errorData = await response.json();
            } catch (e) {
                // Resposta não é JSON válido
            }
            
            const errorMessage = errorData && errorData.message 
                ? errorData.message 
                : `Erro na requisição: ${response.status}`;
            
            throw new Error(errorMessage);
        }
        
        const result = await response.json();
        
        if (result.success) {
            globalData = result.data;
            
            // CORREÇÃO BUG 3: Popula o filtro de PDVs com lista real do backend
            // (apenas na primeira carga ou quando forceRefresh)
            if (result.availablePdvs && result.availablePdvs.length > 0) {
                availablePdvs = result.availablePdvs;
                populatePdvFilter(result.availablePdvs);
            }
            
            // Renderiza avisos (warnings) se houver (modo parcial)
            if (result.warnings) {
                renderWarnings(result.warnings);
            }
            
            // Atualiza o timestamp no header
            DOM.lastUpdate.textContent = `Última atualização: ${globalData.timestamp}`;
            
            // Atualiza o badge de itens ignorados
            updateIgnoredBadge(globalData.ignoredCount);
            
            // Aplica filtros iniciais (ou recalcula se for refresh)
            applyFilters();
        } else {
            throw new Error(result.message || 'Erro desconhecido na API.');
        }
    } catch (error) {
        console.error('[app.js] Erro ao buscar dados:', error);
        alert(`Falha ao carregar os dados do dashboard:\n\n${error.message}\n\nVerifique o console para mais detalhes.`);
    } finally {
        setLoading(false);
    }
}

// ============================================================================
// LÓGICA DE FILTROS E ATUALIZAÇÃO DA UI
// ============================================================================

/**
 * Aplica os filtros selecionados (PDV e Marca) nos dados brutos (allItems).
 * Recalcula os KPIs e chama as funções de renderização de gráficos e tabelas.
 * 
 * CORREÇÃO BUG 3: O filtro de PDV agora usa o código real do PDV (ex: '4842')
 * em vez de strings genéricas como 'PDV 01'.
 */
function applyFilters() {
    if (!globalData || !globalData.allItems) return;
    
    const selectedPdv = DOM.filterPdv.value;
    const selectedBrand = DOM.filterBrand.value;
    
    // Filtra os itens brutos
    currentFilteredItems = globalData.allItems.filter(item => {
        // Filtro por PDV: só aplica se o item tiver a propriedade 'pdv'
        // (caso o dataService passe a expor esse campo no futuro)
        const matchPdv = (selectedPdv === 'ALL') || 
                        (item.pdv && item.pdv === selectedPdv);
        
        // Filtro por Marca
        const matchBrand = (selectedBrand === 'ALL') || (item.marca === selectedBrand);
        
        return matchPdv && matchBrand;
    });
    
    // Aviso no console se o filtro de PDV está ativo mas nenhum item tem pdv
    // (indica que o dataService precisa ser ajustado para expor o campo pdv)
    if (selectedPdv !== 'ALL' && currentFilteredItems.length === 0) {
        const hasAnyPdv = globalData.allItems.some(item => item.pdv);
        if (!hasAnyPdv) {
            console.warn(
                '[app.js] ⚠️ Filtro de PDV selecionado, mas os itens não têm campo "pdv". ' +
                'Para o filtro de PDV funcionar completamente, o dataService.js precisa ' +
                'expor o PDV associado a cada item (via mapeamento do draft).'
            );
            // Fallback: mostra todos os itens se o filtro de PDV não puder ser aplicado
            currentFilteredItems = globalData.allItems.filter(item => {
                return (selectedBrand === 'ALL') || (item.marca === selectedBrand);
            });
        }
    }
    
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