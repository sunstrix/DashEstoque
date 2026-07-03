/**
 * tables.js
 * Responsável por renderizar as tabelas de análise do dashboard.
 * - Excessos Críticos (Top 100)
 * - Faltas por Marca
 * 
 * Utiliza funções locais de formatação para garantir independência de escopo global.
 */

// ============================================================================
// FUNÇÕES DE FORMATAÇÃO (LOCAIS)
// ============================================================================

/**
 * Formata um número para o padrão monetário brasileiro (R$).
 */
function formatCurrencyLocal(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value || 0);
}

/**
 * Formata um número para o padrão brasileiro com separadores de milhar.
 */
function formatNumberLocal(value) {
    return new Intl.NumberFormat('pt-BR', {
        maximumFractionDigits: 0
    }).format(value || 0);
}

// ============================================================================
// FUNÇÕES DE RENDERIZAÇÃO DAS TABELAS
// ============================================================================

/**
 * Renderiza a tabela de Excessos Críticos (Top 100).
 * @param {Array<Object>} excessosCriticos - Array de itens com excesso, já ordenado por valor.
 */
function renderExcessosTable(excessosCriticos) {
    const tbody = document.querySelector('#table-excessos tbody');
    if (!tbody) return;
    
    tbody.innerHTML = ''; // Limpa linhas anteriores

    if (!excessosCriticos || excessosCriticos.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="4" style="text-align: center; color: #8b949e; padding: 1.5rem;">Nenhum excesso crítico encontrado para os filtros atuais.</td>';
        tbody.appendChild(tr);
        return;
    }

    for (const item of excessosCriticos) {
        const tr = document.createElement('tr');
        // Exibe o nome do produto se existir, caso contrário, o EAN
        const produtoDisplay = item.produto || item.ean;
        
        tr.innerHTML = `
            <td title="${produtoDisplay}">${produtoDisplay}</td>
            <td>${item.marca}</td>
            <td>${formatNumberLocal(item.qtdExcesso)}</td>
            <td>${formatCurrencyLocal(item.valorExcesso)}</td>
        `;
        tbody.appendChild(tr);
    }
}

/**
 * Renderiza a tabela de Faltas por Marca.
 * @param {Object} faltasPorMarca - Objeto consolidado com as faltas agrupadas por marca.
 */
function renderFaltasTable(faltasPorMarca) {
    const tbody = document.querySelector('#table-faltas tbody');
    if (!tbody) return;

    tbody.innerHTML = ''; // Limpa linhas anteriores

    if (!faltasPorMarca || Object.keys(faltasPorMarca).length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="4" style="text-align: center; color: #8b949e; padding: 1.5rem;">Nenhuma falta encontrada para os filtros atuais.</td>';
        tbody.appendChild(tr);
        return;
    }

    // Ordena as marcas por valor total de falta (decrescente)
    const sortedFaltas = Object.entries(faltasPorMarca).sort((a, b) => b[1].valorTotal - a[1].valorTotal);

    for (const [marca, dados] of sortedFaltas) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${marca}</td>
            <td>${formatNumberLocal(dados.qtdTotal)}</td>
            <td>${formatCurrencyLocal(dados.valorTotal)}</td>
            <td>${formatNumberLocal(dados.itensFaltantes)}</td>
        `;
        tbody.appendChild(tr);
    }
}

/**
 * Função principal chamada pelo app.js para renderizar/atualizar todas as tabelas.
 * @param {Array<Object>} filteredItems - Itens brutos após aplicação dos filtros.
 * @param {Object} faltasPorMarca - Objeto consolidado de faltas por marca.
 */
function renderTables(filteredItems, faltasPorMarca) {
    // Para a tabela de excessos, filtramos os itens com excesso > 0, ordenamos e limitamos a 100
    const excessos = filteredItems
        .filter(item => item.qtdExcesso > 0)
        .sort((a, b) => b.valorExcesso - a.valorExcesso)
        .slice(0, 100);

    renderExcessosTable(excessos);
    renderFaltasTable(faltasPorMarca);
}