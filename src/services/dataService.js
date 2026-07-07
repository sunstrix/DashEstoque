/**
 * dataService.js
 * Núcleo da lógica de negócio do projeto.
 * - Orquestra o download e parsing das 4 planilhas (incluindo ignorados).
 * - Aplica a regra de custo (MAIOR entre preço de tabela e custo draft, ou apenas draft se tabela não existir).
 * - Exclui todos os SKUs da planilha de ignorados de TODOS os cálculos, KPIs, gráficos e tabelas.
 * - Calcula todos os KPIs financeiros e de estoque.
 * - Estrutura os dados para consumo pelo frontend e aplicação de filtros (PDV/Marca).
 * - Calcula DDV (Demanda Diária de Venda), Cobertura de Estoque e Estoque em Trânsito.
 * 
 * ROBUSTEZ: Usa Promise.allSettled para permitir que planilhas auxiliares falhem
 * sem derrubar o dashboard. Apenas a planilha principal é obrigatória.
 */

const XLSX = require('xlsx');
const { SHEET_NAMES } = require('../config/constants');
const { downloadMainSpreadsheet } = require('./downloadService');
const { processDraftCosts } = require('./draftService');
const { processSafetyStock } = require('./safetyStockService');
const { processIgnoredItems } = require('./ignoredService');
const { getBrasiliaTime, getCurrentTimestampMs } = require('./timeService');

/**
 * Busca a chave de uma coluna de forma flexível (case-insensitive).
 * @param {Object} row - Objeto de linha do sheet_to_json.
 * @param {Array<string>} patterns - Padrões possíveis para a coluna.
 * @returns {string|undefined} - A chave encontrada.
 */
function findKey(row, patterns) {
    const keys = Object.keys(row);
    return keys.find(k => patterns.some(p => k.toUpperCase().trim() === p.toUpperCase().trim()));
}

/**
 * Converte valor numérico brasileiro (string ou number) para float seguro.
 */
function toFloat(val) {
    if (val === null || val === undefined || val === '') return 0;
    const str = String(val).replace(/\s/g, '').replace(',', '.');
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Normaliza um EAN/SKU para comparação consistente.
 * Remove espaços, hífens e pontos (mesma lógica do ignoredService).
 * @param {string} ean - EAN bruto.
 * @returns {string} - EAN normalizado.
 */
function normalizeEAN(ean) {
    if (!ean) return '';
    return String(ean).replace(/[\s\-\.]/g, '').trim();
}

/**
 * Extrai o total do histórico de vendas de uma linha.
 * Replica a lógica do app.py original: soma das colunas I até Z (índices 8 a 25).
 * 
 * @param {Object} row - Objeto de linha do sheet_to_json
 * @param {Array<string>} keys - Array de chaves (nomes das colunas) da linha
 * @returns {number} Total do histórico de vendas
 */
function extrairHistoricoVendas(row, keys) {
    let total = 0;
    
    // Estratégia 1: Tentar encontrar colunas de histórico por nome (mais robusto)
    const historicoKeys = keys.filter(k => {
        const kUpper = k.toUpperCase().trim();
        return (
            kUpper.startsWith('MÊS') || kUpper.startsWith('MES') ||
            kUpper.startsWith('JAN') || kUpper.startsWith('FEV') ||
            kUpper.startsWith('MAR') || kUpper.startsWith('ABR') ||
            kUpper.startsWith('MAI') || kUpper.startsWith('JUN') ||
            kUpper.startsWith('JUL') || kUpper.startsWith('AGO') ||
            kUpper.startsWith('SET') || kUpper.startsWith('OUT') ||
            kUpper.startsWith('NOV') || kUpper.startsWith('DEZ') ||
            kUpper.startsWith('VENDA') || kUpper.startsWith('VENDAS') ||
            /^\d{2}\/\d{4}$/.test(kUpper) || // Formato MM/YYYY
            /^\d{4}$/.test(kUpper) // Apenas ano
        );
    });
    
    if (historicoKeys.length > 0) {
        for (const key of historicoKeys) {
            total += toFloat(row[key]);
        }
        return total;
    }
    
    // Estratégia 2 (fallback): Usar índices 8-25 (colunas I-Z) como no Python original
    // Isso replica exatamente o comportamento do app.py: colunas I (índice 8) até Z (índice 25)
    if (keys.length >= 26) {
        for (let i = 8; i <= 25; i++) {
            total += toFloat(row[keys[i]]);
        }
    }
    
    return total;
}

/**
 * Processa a planilha principal (abas BOTICARIO, EUDORA, QUEM_DISSE_BERENICE).
 * 
 * CORREÇÃO BUG 2: Agora valida se as abas esperadas existem e lança erro claro se não existirem.
 * CORREÇÃO BUG 4: Agora extrai histórico de vendas, calcula DDV, Cobertura e lê Estoque em Trânsito.
 */
async function parseMainSpreadsheet(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const items = [];

    const brandMap = {
        [SHEET_NAMES.MAIN.BOTICARIO]: 'O Boticário',
        [SHEET_NAMES.MAIN.EUDORA]: 'Eudora',
        [SHEET_NAMES.MAIN.QUEM_DISSE_BERENICE]: 'Quem Disse Berenice?'
    };

    const expectedSheets = Object.keys(brandMap);
    const availableSheets = workbook.SheetNames;
    
    // =========================================================================
    // CORREÇÃO BUG 2: Validação rigorosa das abas esperadas
    // =========================================================================
    const abasEncontradas = [];
    const abasFaltantes = [];
    
    for (const expectedSheet of expectedSheets) {
        const found = availableSheets.find(s => 
            s.toUpperCase().trim() === expectedSheet.toUpperCase().trim()
        );
        if (found) {
            abasEncontradas.push({ esperado: expectedSheet, real: found });
        } else {
            abasFaltantes.push(expectedSheet);
        }
    }
    
    console.log(`[dataService] 📋 Abas disponíveis no arquivo: ${JSON.stringify(availableSheets)}`);
    console.log(`[dataService] 📋 Abas esperadas encontradas: ${abasEncontradas.length}/${expectedSheets.length}`);
    
    if (abasFaltantes.length > 0) {
        console.warn(`[dataService] ⚠️ Abas faltantes: ${JSON.stringify(abasFaltantes)}`);
    }
    
    // Se NENHUMA das abas esperadas foi encontrada, lançar erro claro
    if (abasEncontradas.length === 0) {
        const errorMsg = `[dataService] ❌ NENHUMA das abas esperadas foi encontrada no arquivo baixado. ` +
            `Abas esperadas: ${JSON.stringify(expectedSheets)}. ` +
            `Abas disponíveis no arquivo: ${JSON.stringify(availableSheets)}. ` +
            `Verifique se a URL no .env está apontando para a planilha correta.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    
    // Se algumas abas estão faltando (mas pelo menos uma existe), logar aviso e continuar
    if (abasFaltantes.length > 0 && abasEncontradas.length > 0) {
        console.warn(`[dataService] ⚠️ Algumas abas esperadas não foram encontradas. ` +
            `Faltando: ${JSON.stringify(abasFaltantes)}. ` +
            `Processando apenas as abas disponíveis.`);
    }

    // =========================================================================
    // PARSING DAS ABAS ENCONTRADAS
    // =========================================================================
    for (const { esperado, real } of abasEncontradas) {
        const sheet = workbook.Sheets[real];
        if (!sheet) continue;

        const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const marca = brandMap[esperado];
        let itensDaAba = 0;

        for (const row of rawData) {
            const keys = Object.keys(row);
            
            const eanRaw = String(row[findKey(row, ['EAN', 'CÓDIGO', 'CODIGO', 'SKU', 'CÓD. EAN', 'COD. EAN'])] || '').trim();
            const ean = normalizeEAN(eanRaw);
            if (!ean) continue;

            const qtdEstoque = toFloat(row[findKey(row, ['QTD', 'ESTOQUE', 'QUANTIDADE', 'QTD ESTOQUE', 'SALDO', 'SALDO ATUAL'])]);
            const precoTabela = toFloat(row[findKey(row, ['PREÇO TABELA', 'PRECO TABELA', 'VALOR', 'PREÇO', 'PRECO', 'VALOR UNITÁRIO', 'VALOR UNITARIO'])]);
            const curva = String(row[findKey(row, ['CURVA', 'CLASSE', 'CLASSIFICAÇÃO', 'CLASSIFICACAO'])] || 'E').trim().toUpperCase();
            const categoria = String(row[findKey(row, ['CATEGORIA', 'GRUPO', 'FAMÍLIA', 'FAMILIA'])] || 'Outros').trim();
            const produto = String(row[findKey(row, ['PRODUTO', 'NOME', 'DESCRIÇÃO', 'DESCRICAO', 'ITEM', 'DESCRIÇÃO DO PRODUTO', 'DESCRICAO DO PRODUTO'])] || '').trim();
            
            // CORREÇÃO BUG 4: Extrair histórico de vendas e calcular DDV
            const historicoTotal = extrairHistoricoVendas(row, keys);
            const ddv = historicoTotal > 0 ? historicoTotal / 365 : 0;
            
            // CORREÇÃO BUG 4: Calcular cobertura de estoque (null se DDV = 0)
            const coberturaEstoque = ddv > 0 ? qtdEstoque / ddv : null;
            
            // CORREÇÃO BUG 4: Ler coluna Estoque em Trânsito (com múltiplos nomes possíveis)
            const estoqueTransito = toFloat(row[findKey(row, [
                'Estoque em Trânsito', 'Estoque em Transito',
                'ESTOQUE EM TRÂNSITO', 'ESTOQUE EM TRANSITO',
                'Estoque Trânsito', 'Estoque Transito',
                'Em Trânsito', 'Em Transito',
                'TRÂNSITO', 'TRANSITO',
                'Estoque em Transito', 'EM TRÂNSITO', 'EM TRANSITO'
            ])]);

            items.push({ 
                ean, 
                produto, 
                marca, 
                qtdEstoque, 
                precoTabela, 
                curva, 
                categoria,
                // CORREÇÃO BUG 4: Novos campos
                historicoTotal,
                ddv,
                coberturaEstoque,
                estoqueTransito
            });
            itensDaAba++;
        }
        
        console.log(`[dataService] ✅ Aba '${real}' processada: ${itensDaAba} itens extraídos.`);
    }

    return items;
}

/**
 * Orquestrador principal. Baixa, cruza dados, aplica regras e calcula KPIs.
 * Usa Promise.allSettled para garantir que falhas em planilhas auxiliares
 * (draft, segurança, ignorados) não derrubem o dashboard inteiro.
 */
async function processAllData() {
    console.log('[dataService] 🔄 Iniciando processamento completo dos dados...');
    const startMs = getCurrentTimestampMs();

    // =========================================================================
    // 1) DOWNLOADS EM PARALELO COM PROMISE.ALLSETTLED (FALLBACK INDIVIDUAL)
    // =========================================================================
    const results = await Promise.allSettled([
        downloadMainSpreadsheet(), // [0] Obrigatória
        processDraftCosts(),       // [1] Opcional
        processSafetyStock(),      // [2] Opcional
        processIgnoredItems()      // [3] Opcional
    ]);

    const [mainResult, draftResult, safetyResult, ignoredResult] = results;

    // -------------------------------------------------------------------------
    // 1.1) Validação da Planilha Principal (OBRIGATÓRIA)
    // -------------------------------------------------------------------------
    if (mainResult.status === 'rejected') {
        console.error('[dataService] ❌ Falha crítica: Planilha principal não pôde ser processada.');
        throw new Error(`Falha ao baixar/parsear planilha principal: ${mainResult.reason.message}`);
    }
    const mainBuffer = mainResult.value;

    // -------------------------------------------------------------------------
    // 1.2) Extração das Planilhas Auxiliares (com fallback de segurança)
    // -------------------------------------------------------------------------
    const draftCosts = draftResult.status === 'fulfilled' ? draftResult.value : [];
    const safetyStockMap = safetyResult.status === 'fulfilled' ? safetyResult.value : {};
    const ignoredEANs = ignoredResult.status === 'fulfilled' ? ignoredResult.value : new Set();

    // Log de avisos para planilhas auxiliares que falharam
    if (draftResult.status === 'rejected') {
        console.warn(`[dataService] ⚠️ Planilha draft de custos falhou: ${draftResult.reason.message}. Usando custos draft = 0.`);
    }
    if (safetyResult.status === 'rejected') {
        console.warn(`[dataService] ⚠️ Planilha de estoque de segurança falhou: ${safetyResult.reason.message}. Usando estoque de segurança = 0.`);
    }
    if (ignoredResult.status === 'rejected') {
        console.warn(`[dataService] ⚠️ Planilha de itens ignorados falhou: ${ignoredResult.reason.message}. Nenhum item será filtrado.`);
    }

    console.log(`[dataService] Planilhas auxiliares carregadas. Ignorados: ${ignoredEANs.size} SKUs.`);

    // =========================================================================
    // 2) PARSE DA PLANILHA PRINCIPAL
    // =========================================================================
    const allMainItems = await parseMainSpreadsheet(mainBuffer);
    console.log(`[dataService] Planilha principal parseada: ${allMainItems.length} itens totais.`);

    // CORREÇÃO BUG 2: Se não há itens após parse, lançar erro claro
    if (allMainItems.length === 0) {
        throw new Error('[dataService] ❌ A planilha principal foi baixada mas não contém nenhum item válido. Verifique a estrutura das colunas (EAN/Código, QTD/Estoque, etc.).');
    }

    // =========================================================================
    // 3) FILTRO DE ITENS IGNORADOS
    // =========================================================================
    const mainItems = allMainItems.filter(item => !ignoredEANs.has(item.ean));
    const ignoredCount = allMainItems.length - mainItems.length;
    if (ignoredCount > 0) {
        console.log(`[dataService] ⚠️ ${ignoredCount} itens foram excluídos por estarem na planilha de ignorados.`);
    }

    // =========================================================================
    // 4) INDEXAÇÃO DE CUSTOS DRAFT E APLICAÇÃO DA REGRA DE CUSTO
    // =========================================================================
    const draftByEAN = {};
    for (const dc of draftCosts) {
        const normalizedEan = normalizeEAN(dc.ean);
        if (!draftByEAN[normalizedEan]) draftByEAN[normalizedEan] = dc.custo;
    }

    const processedItems = [];
    for (const item of mainItems) {
        const custoDraft = draftByEAN[item.ean] || 0;
        let custoFinal = 0;

        // 📜 REGRA DE CUSTO FIEL AO PYTHON ORIGINAL:
        // Se não houver preço de tabela -> usa custo draft
        // Se houver os dois -> usa o MAIOR valor
        if (item.precoTabela > 0 && custoDraft > 0) {
            custoFinal = Math.max(item.precoTabela, custoDraft);
        } else if (custoDraft > 0) {
            custoFinal = custoDraft;
        } else {
            custoFinal = item.precoTabela || 0;
        }

        const estoqueSeguranca = safetyStockMap[item.ean] || 0;

        const qtdExcesso = Math.max(0, item.qtdEstoque - estoqueSeguranca);
        const qtdFalta = Math.max(0, estoqueSeguranca - item.qtdEstoque);
        const valorExcesso = qtdExcesso * custoFinal;
        const valorFalta = qtdFalta * custoFinal;
        const valorEstoqueAtual = item.qtdEstoque * custoFinal;
        const valorEstoqueMinimo = estoqueSeguranca * custoFinal;
        const valorCustoEstoqueAtual = valorEstoqueAtual;
        
        // CORREÇÃO BUG 4: Recalcular cobertura com base no custo final
        const coberturaEstoqueValor = item.ddv > 0 ? valorEstoqueAtual / (item.ddv * custoFinal) : null;

        processedItems.push({
            ...item,
            custoDraft,
            custoFinal,
            estoqueSeguranca,
            qtdExcesso,
            qtdFalta,
            valorExcesso,
            valorFalta,
            valorEstoqueAtual,
            valorEstoqueMinimo,
            valorCustoEstoqueAtual,
            // CORREÇÃO BUG 4: Campo adicional de cobertura em valor
            coberturaEstoqueValor
        });
    }

    // =========================================================================
    // 5) CONSOLIDAÇÃO DE KPIs E AGRUPAMENTOS
    // =========================================================================
    const consolidatedKPIs = {
        Valor_Estoque_Atual: 0,
        Valor_Estoque_Minimo: 0,
        Qtd_Excesso: 0,
        Valor_Excesso: 0,
        Qtd_Falta: 0,
        Valor_Falta: 0,
        Valor_Custo_Estoque_Atual: 0
    };

    const byBrand = {};
    const byCurve = {};
    const byCategory = {};
    const excessosCriticos = [];
    const faltasPorMarca = {};

    for (const item of processedItems) {
        // Soma KPIs globais
        consolidatedKPIs.Valor_Estoque_Atual += item.valorEstoqueAtual;
        consolidatedKPIs.Valor_Estoque_Minimo += item.valorEstoqueMinimo;
        consolidatedKPIs.Qtd_Excesso += item.qtdExcesso;
        consolidatedKPIs.Valor_Excesso += item.valorExcesso;
        consolidatedKPIs.Qtd_Falta += item.qtdFalta;
        consolidatedKPIs.Valor_Falta += item.valorFalta;
        consolidatedKPIs.Valor_Custo_Estoque_Atual += item.valorCustoEstoqueAtual;

        // Agrupa por Marca
        if (!byBrand[item.marca]) byBrand[item.marca] = { qtdItens: 0, custoTotal: 0 };
        byBrand[item.marca].qtdItens += 1;
        byBrand[item.marca].custoTotal += item.valorEstoqueAtual;

        // Agrupa por Curva
        const cNorm = item.curva || 'E';
        if (!byCurve[cNorm]) byCurve[cNorm] = { custoTotal: 0 };
        byCurve[cNorm].custoTotal += item.valorCustoEstoqueAtual;

        // Agrupa por Categoria
        const cat = item.categoria || 'Outros';
        if (!byCategory[cat]) byCategory[cat] = { qtdTotal: 0 };
        byCategory[cat].qtdTotal += item.qtdEstoque;

        // Tabela de excessos críticos
        if (item.qtdExcesso > 0) excessosCriticos.push(item);
        
        // Tabela de faltas por marca
        if (item.qtdFalta > 0) {
            if (!faltasPorMarca[item.marca]) {
                faltasPorMarca[item.marca] = { qtdTotal: 0, valorTotal: 0, itensFaltantes: 0 };
            }
            faltasPorMarca[item.marca].qtdTotal += item.qtdFalta;
            faltasPorMarca[item.marca].valorTotal += item.valorFalta;
            faltasPorMarca[item.marca].itensFaltantes += 1;
        }
    }

    // Ordena excessos por valor decrescente (limita a 100)
    excessosCriticos.sort((a, b) => b.valorExcesso - a.valorExcesso);

    const endMs = getCurrentTimestampMs();
    const processingTime = ((endMs - startMs) / 1000).toFixed(2);

    console.log(`[dataService] ✅ Processamento concluído em ${processingTime}s. ${processedItems.length} itens processados.`);

    return {
        timestamp: getBrasiliaTime(),
        consolidatedKPIs,
        byBrand,
        byCurve,
        byCategory,
        excessosCriticos: excessosCriticos.slice(0, 100),
        faltasPorMarca,
        allItems: processedItems,
        ignoredCount: ignoredCount,
        processingTime,
        // Metadados de saúde do sistema para o frontend/api
        systemHealth: {
            hasDraftCosts: draftCosts.length > 0,
            hasSafetyStock: Object.keys(safetyStockMap).length > 0,
            hasIgnoredItems: ignoredEANs.size > 0
        }
    };
}

module.exports = {
    processAllData
};