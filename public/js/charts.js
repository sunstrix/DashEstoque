/**
 * charts.js
 * Responsável por renderizar e atualizar os 3 gráficos do dashboard utilizando Chart.js.
 * - Comparativo por Marca (Qtd Itens + Custo Total)
 * - Custo por Curva (A/B/C/E)
 * - Estoque por Categoria
 * 
 * Configura o tema dark para os gráficos (textos claros, grid sutil, fundo transparente).
 */

// ============================================================================
// INSTÂNCIAS DOS GRÁFICOS (para permitir atualização/destruição)
// ============================================================================
let chartBrands = null;
let chartCurve = null;
let chartCategory = null;

// ============================================================================
// CONFIGURAÇÕES GLOBAIS DO CHART.JS (TEMA DARK)
// ============================================================================
Chart.defaults.color = '#cccccc';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Cores das Marcas
const BRAND_COLORS = {
    'O Boticário': '#007A33',
    'Eudora': '#a855f7',
    'Quem Disse Berenice?': '#ff4b4b'
};

// Cores das Curvas
const CURVE_COLORS = {
    'A': '#007A33',
    'B': '#D4AF37',
    'C': '#a855f7',
    'E': '#ff4b4b'
};

// Paleta de cores para Categorias (tons variados)
const CATEGORY_COLORS = [
    '#007A33', '#D4AF37', '#a855f7', '#ff4b4b', '#3b82f6', 
    '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4',
    '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#e11d48'
];

// ============================================================================
// FUNÇÕES DE RENDERIZAÇÃO
// ============================================================================

/**
 * Renderiza o gráfico comparativo de marcas (Barras duplas: Qtd Itens e Custo Total).
 */
function renderBrandChart(filteredItems) {
    const ctx = document.getElementById('chart-brands').getContext('2d');
    
    // Agrega dados por marca
    const brandData = {};
    for (const item of filteredItems) {
        if (!brandData[item.marca]) {
            brandData[item.marca] = { qtdItens: 0, custoTotal: 0 };
        }
        brandData[item.marca].qtdItens += 1;
        brandData[item.marca].custoTotal += item.valorEstoqueAtual || 0;
    }

    const labels = Object.keys(brandData);
    const qtdData = labels.map(l => brandData[l].qtdItens);
    const custoData = labels.map(l => brandData[l].custoTotal);
    const bgColors = labels.map(l => BRAND_COLORS[l] || '#888888');
    const bgColorsAlpha = bgColors.map(c => c + '99'); // Adiciona transparência

    // Destrói gráfico anterior se existir
    if (chartBrands) chartBrands.destroy();

    chartBrands = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Qtd. Itens',
                    data: qtdData,
                    backgroundColor: bgColorsAlpha,
                    borderColor: bgColors,
                    borderWidth: 1,
                    yAxisID: 'y',
                    order: 2
                },
                {
                    label: 'Custo Total (R$)',
                    data: custoData,
                    type: 'line',
                    borderColor: '#D4AF37',
                    backgroundColor: 'rgba(212, 175, 55, 0.1)',
                    borderWidth: 2,
                    pointBackgroundColor: '#D4AF37',
                    pointRadius: 4,
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y1',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#cccccc' }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.dataset.yAxisID === 'y1') {
                                label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                            } else {
                                label += context.parsed.y;
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#cccccc' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Qtd. Itens', color: '#cccccc' },
                    ticks: { color: '#cccccc' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Custo Total (R$)', color: '#D4AF37' },
                    ticks: { 
                        color: '#D4AF37',
                        callback: function(value) {
                            return 'R$ ' + (value / 1000).toFixed(0) + 'k';
                        }
                    },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

/**
 * Renderiza o gráfico de custo por curva (Doughnut).
 */
function renderCurveChart(byCurve) {
    const ctx = document.getElementById('chart-curve').getContext('2d');
    
    const labels = Object.keys(byCurve).sort();
    const data = labels.map(l => byCurve[l].custoTotal || 0);
    const bgColors = labels.map(l => CURVE_COLORS[l] || '#888888');

    if (chartCurve) chartCurve.destroy();

    chartCurve = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.map(l => `Curva ${l}`),
            datasets: [{
                data: data,
                backgroundColor: bgColors,
                borderColor: '#0e1117',
                borderWidth: 3,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { 
                        color: '#cccccc',
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) label += ': ';
                            label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed);
                            
                            // Calcula porcentagem
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                            label += ` (${percentage}%)`;
                            
                            return label;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Renderiza o gráfico de estoque por categoria (Barras horizontais).
 */
function renderCategoryChart(byCategory) {
    const ctx = document.getElementById('chart-category').getContext('2d');
    
    // Ordena categorias por quantidade total (decrescente) e pega as top 10
    const sortedCategories = Object.entries(byCategory)
        .sort((a, b) => b[1].qtdTotal - a[1].qtdTotal)
        .slice(0, 10);

    const labels = sortedCategories.map(c => c[0]);
    const data = sortedCategories.map(c => c[1].qtdTotal);
    
    // Gera cores alternadas
    const bgColors = labels.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length] + 'CC');
    const borderColors = labels.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]);

    if (chartCategory) chartCategory.destroy();

    chartCategory = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Qtd. Total em Estoque',
                data: data,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y', // Barras horizontais
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Qtd: ${new Intl.NumberFormat('pt-BR').format(context.parsed.x)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Quantidade Total', color: '#cccccc' },
                    ticks: { color: '#cccccc' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                y: {
                    ticks: { color: '#cccccc', font: { size: 11 } },
                    grid: { display: false }
                }
            }
        }
    });
}

/**
 * Função principal chamada pelo app.js para renderizar todos os gráficos.
 */
function renderCharts(filteredItems, byCurve, byCategory) {
    // Ajusta a altura dos containers dinamicamente para o Chart.js renderizar bem
    document.getElementById('chart-brands').parentElement.style.height = '350px';
    document.getElementById('chart-curve').parentElement.style.height = '350px';
    document.getElementById('chart-category').parentElement.style.height = '400px';

    renderBrandChart(filteredItems);
    renderCurveChart(byCurve);
    renderCategoryChart(byCategory);
}