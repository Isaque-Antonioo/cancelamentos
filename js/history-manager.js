/* ===================================
   Hubstrom - Gerenciador de Histórico
   Controle de dados mensais
   Integrado com Firebase Realtime Database
   =================================== */

// Chave base para localStorage (fallback)
const HISTORY_KEY = 'hubstrom_cancelamentos_history';
const CURRENT_MONTH_KEY = 'hubstrom_current_month';

// Cache local para evitar múltiplas requisições
let monthsCache = {};
let firebaseMonthsList = null;

// ==========================================
// FUNÇÕES DE DADOS (COM FIREBASE)
// ==========================================

// Obter lista de meses com dados salvos
async function getHistoryMonths() {
    // Tentar Firebase primeiro
    if (typeof isFirebaseReady === 'function' && isFirebaseReady()) {
        try {
            const firebaseMonths = await getHistoryMonthsFromFirebase();
            if (firebaseMonths.length > 0) {
                firebaseMonthsList = firebaseMonths;
                return firebaseMonths;
            }
        } catch (e) {
            console.warn('Erro ao buscar do Firebase, usando localStorage:', e);
        }
    }

    // Fallback para localStorage
    const history = localStorage.getItem(HISTORY_KEY);
    if (!history) return [];

    try {
        const data = JSON.parse(history);
        return Object.keys(data).sort().reverse();
    } catch (e) {
        console.error('Erro ao ler histórico:', e);
        return [];
    }
}

// Obter dados de um mês específico
async function getMonthData(monthKey) {
    // Verificar cache primeiro
    if (monthsCache[monthKey]) {
        return monthsCache[monthKey];
    }

    // Tentar Firebase primeiro
    if (typeof isFirebaseReady === 'function' && isFirebaseReady()) {
        try {
            const firebaseData = await getMonthDataFromFirebase(monthKey);
            if (firebaseData) {
                monthsCache[monthKey] = firebaseData;
                return firebaseData;
            }
        } catch (e) {
            console.warn('Erro ao buscar do Firebase:', e);
        }
    }

    // Fallback para localStorage
    const history = localStorage.getItem(HISTORY_KEY);
    if (!history) return null;

    try {
        const data = JSON.parse(history);
        return data[monthKey] || null;
    } catch (e) {
        console.error('Erro ao ler dados do mês:', e);
        return null;
    }
}

// Salvar dados do mês atual
async function saveMonthData(monthKey, data) {
    const dataToSave = {
        savedAt: new Date().toISOString(),
        summary: data.summary,
        kpis: data.kpis,
        sections: data.sections,
        chartsData: data.chartsData,
        csvData: data.csvData
    };

    // Salvar no Firebase se disponível
    if (typeof isFirebaseReady === 'function' && isFirebaseReady()) {
        try {
            const success = await saveMonthDataToFirebase(monthKey, dataToSave);
            if (success) {
                // Atualizar cache
                monthsCache[monthKey] = dataToSave;
                console.log('Dados salvos no Firebase:', monthKey);
            }
        } catch (e) {
            console.error('Erro ao salvar no Firebase:', e);
        }
    }

    // Sempre salvar também no localStorage como backup
    let history = {};
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
        try {
            history = JSON.parse(stored);
        } catch (e) {
            history = {};
        }
    }

    history[monthKey] = dataToSave;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    console.log('Dados salvos localmente:', monthKey);
}

// Verificar se há dados para um mês (versão síncrona para UI)
function hasDataForMonth(monthKey) {
    // Verificar cache
    if (monthsCache[monthKey]) {
        return true;
    }

    // Verificar lista do Firebase em cache
    if (firebaseMonthsList && firebaseMonthsList.includes(monthKey)) {
        return true;
    }

    // Verificar localStorage
    const history = localStorage.getItem(HISTORY_KEY);
    if (!history) return false;

    try {
        const data = JSON.parse(history);
        return data[monthKey] !== undefined;
    } catch (e) {
        return false;
    }
}

// Verificar se há dados para um mês (versão assíncrona)
async function hasDataForMonthAsync(monthKey) {
    // Verificar cache
    if (monthsCache[monthKey]) {
        return true;
    }

    // Tentar Firebase
    if (typeof hasDataForMonthInFirebase === 'function' && isFirebaseReady()) {
        try {
            return await hasDataForMonthInFirebase(monthKey);
        } catch (e) {
            console.warn('Erro ao verificar Firebase:', e);
        }
    }

    // Fallback para localStorage
    return hasDataForMonth(monthKey);
}

// Deletar dados de um mês
async function deleteMonthData(monthKey) {
    // Deletar do Firebase
    if (typeof isFirebaseReady === 'function' && isFirebaseReady()) {
        try {
            await deleteMonthDataFromFirebase(monthKey);
        } catch (e) {
            console.error('Erro ao deletar do Firebase:', e);
        }
    }

    // Deletar do localStorage
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
        try {
            const history = JSON.parse(stored);
            delete history[monthKey];
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch (e) {
            console.error('Erro ao deletar dados:', e);
        }
    }

    // Limpar cache
    delete monthsCache[monthKey];
    console.log('Dados deletados para:', monthKey);
}

// ==========================================
// FUNÇÕES DE MÊS
// ==========================================

// Obter mês atual selecionado
function getCurrentMonth() {
    return localStorage.getItem(CURRENT_MONTH_KEY) || generateCurrentMonthKey();
}

// Definir mês atual
function setCurrentMonth(monthKey) {
    localStorage.setItem(CURRENT_MONTH_KEY, monthKey);
}

// Gerar chave do mês atual (formato: 2026-01)
function generateCurrentMonthKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

// Formatar chave do mês para exibição
function formatMonthDisplay(monthKey) {
    const [year, month] = monthKey.split('-');
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const monthIndex = parseInt(month) - 1;
    return `${months[monthIndex]} ${year}`;
}

// Gerar lista de meses disponíveis (últimos 12 meses)
function getAvailableMonths() {
    const months = [];
    const now = new Date();

    for (let i = 0; i < 12; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const key = `${year}-${month}`;

        months.push({
            key: key,
            display: formatMonthDisplay(key),
            hasData: hasDataForMonth(key)
        });
    }

    return months;
}

// ==========================================
// FUNÇÕES DE UI
// ==========================================

// Inicializar seletor de mês
async function initMonthSelector() {
    const selector = document.getElementById('monthSelector');
    if (!selector) return;

    // Buscar meses do Firebase para atualizar cache
    if (typeof isFirebaseReady === 'function' && isFirebaseReady()) {
        try {
            firebaseMonthsList = await getHistoryMonthsFromFirebase();
        } catch (e) {
            console.warn('Erro ao buscar meses do Firebase:', e);
        }
    }

    const currentMonth = getCurrentMonth();
    const availableMonths = getAvailableMonths();

    // Limpar opções existentes
    selector.innerHTML = '';

    // Adicionar opções
    availableMonths.forEach(month => {
        const option = document.createElement('option');
        option.value = month.key;
        option.textContent = month.display;

        // Verificar se tem dados (cache local + Firebase)
        const hasData = month.hasData || (firebaseMonthsList && firebaseMonthsList.includes(month.key));

        if (hasData) {
            option.textContent += ' ✓';
            option.classList.add('has-data');
        }

        if (month.key === currentMonth) {
            option.selected = true;
        }

        selector.appendChild(option);
    });

    // Atualizar título do header
    updateHeaderTitle(currentMonth);
}

// Atualizar título do header com o mês selecionado
function updateHeaderTitle(monthKey) {
    const titleElement = document.getElementById('headerSubtitle');
    if (titleElement) {
        titleElement.textContent = formatMonthDisplay(monthKey) + ' | Relatório Completo';
    }
}

// Manipular mudança de mês
async function handleMonthChange(newMonthKey) {
    const previousMonth = getCurrentMonth();

    // Se está mudando de mês e há dados na tela, salvar automaticamente
    if (previousMonth !== newMonthKey) {
        const screenKpis = captureKPIsFromScreen();
        if (screenKpis.total > 0) {
            console.log(`Salvando dados de ${previousMonth} antes de trocar...`);
            try {
                await saveCurrentData(previousMonth);
                console.log(`Dados de ${previousMonth} salvos automaticamente`);
            } catch (e) {
                console.error('Erro ao salvar automaticamente:', e);
            }
        }
    }

    // Aplicar estado de loading durante a transição
    document.body.classList.remove('dashboard-loaded');
    document.body.classList.add('dashboard-loading');

    // Atualizar mês atual
    setCurrentMonth(newMonthKey);
    updateHeaderTitle(newMonthKey);

    // Mostrar loading
    showNotification('Carregando dados...', 'info');

    // Carregar dados do novo mês se existirem
    const monthData = await getMonthData(newMonthKey);

    if (monthData) {
        loadMonthData(monthData);
        showNotification(`Dados de ${formatMonthDisplay(newMonthKey)} carregados!`, 'success');
    } else {
        clearDashboard();
        showNotification(`${formatMonthDisplay(newMonthKey)} - Sem dados. Sincronize com a planilha.`);
    }

    // Atualizar seletor para mostrar indicadores atualizados
    await initMonthSelector();

    // Remover estado de loading após carregar
    markDashboardLoaded();
}

// Capturar KPIs diretamente da tela
function captureKPIsFromScreen() {
    const kpiValues = document.querySelectorAll('.kpi-value');
    const kpiLabels = document.querySelectorAll('.kpi-label');

    // Função para extrair número de texto (valores monetários e contagens)
    const extractNumber = (text) => {
        if (!text) return 0;
        // Remove R$, %, espaços e converte formato brasileiro para número
        // Formato: 1.234,56 -> 1234.56
        const cleaned = text.replace(/[R$%\s]/g, '').replace(/\./g, '').replace(',', '.');
        return parseFloat(cleaned) || 0;
    };

    // Função específica para extrair porcentagem (preserva ponto decimal)
    const extractPercent = (text) => {
        if (!text) return 0;
        // Remove apenas % e espaços, converte vírgula para ponto se necessário
        const cleaned = text.replace(/[%\s]/g, '').replace(',', '.');
        return parseFloat(cleaned) || 0;
    };

    // Extrair porcentagem do label
    const extractPercentage = (text) => {
        const match = text.match(/\((\d+\.?\d*)%\)/);
        return match ? parseFloat(match[1]) : 0;
    };

    const total = extractNumber(kpiValues[0]?.textContent);
    const cancelados = extractNumber(kpiValues[1]?.textContent);
    const revertidos = extractNumber(kpiValues[2]?.textContent);
    const emTratativa = extractNumber(kpiValues[3]?.textContent);
    const valorTotal = extractNumber(kpiValues[4]?.textContent);
    const valorCancelado = extractNumber(kpiValues[5]?.textContent);
    const valorRevertido = extractNumber(kpiValues[6]?.textContent);
    const taxaReversao = extractPercent(kpiValues[7]?.textContent);

    return {
        total,
        cancelados,
        revertidos,
        emTratativa,
        valorTotal,
        valorCancelado,
        valorRevertido,
        taxaReversao
    };
}

// Capturar dados dos gráficos
function captureChartsData() {
    const chartsData = {};
    const chartIds = ['motivoChart', 'statusChart', 'tempoChart', 'moduloChart'];

    // Usar variável global hubstromCharts (mais confiável)
    if (window.hubstromCharts) {
        chartIds.forEach(id => {
            const chartInstance = window.hubstromCharts[id];
            if (chartInstance && chartInstance.data) {
                chartsData[id] = {
                    labels: chartInstance.data.labels,
                    datasets: chartInstance.data.datasets.map(ds => ({
                        data: Array.isArray(ds.data) ? [...ds.data] : ds.data,
                        backgroundColor: ds.backgroundColor,
                        borderColor: ds.borderColor
                    }))
                };
                console.log(`Gráfico ${id} capturado:`, chartsData[id].labels);
            }
        });
    }

    // Fallback: tentar Chart.getChart se hubstromCharts não funcionou
    if (Object.keys(chartsData).length === 0) {
        console.log('Tentando fallback com Chart.getChart...');
        chartIds.forEach(id => {
            const canvas = document.getElementById(id);
            if (canvas) {
                const chartInstance = Chart.getChart(canvas);
                if (chartInstance && chartInstance.data) {
                    chartsData[id] = {
                        labels: chartInstance.data.labels,
                        datasets: chartInstance.data.datasets.map(ds => ({
                            data: Array.isArray(ds.data) ? [...ds.data] : ds.data,
                            backgroundColor: ds.backgroundColor,
                            borderColor: ds.borderColor
                        }))
                    };
                }
            }
        });
    }

    console.log('Total de gráficos capturados:', Object.keys(chartsData).length);
    return chartsData;
}

// Capturar todas as seções da tela
function captureSectionsFromScreen() {
    const alertBox = document.querySelector('.highlight-box');
    const insightsList = document.getElementById('insightsList');
    const recommendationsList = document.getElementById('recommendationsList');

    // Capturar seção de concorrentes
    let competitorsHTML = '';
    document.querySelectorAll('.section').forEach(section => {
        const h2 = section.querySelector('h2');
        if (h2 && h2.textContent.includes('Concorrentes')) {
            const tagsContainer = section.querySelector('div');
            if (tagsContainer) {
                competitorsHTML = tagsContainer.innerHTML;
            }
        }
    });

    // Capturar seção de análise de usabilidade
    let usabilityHTML = '';
    const problemGrid = document.querySelector('.problem-grid');
    if (problemGrid) {
        usabilityHTML = problemGrid.innerHTML;
    }

    return {
        alertBox: alertBox ? alertBox.innerHTML : '',
        insights: insightsList ? insightsList.innerHTML : '',
        recommendations: recommendationsList ? recommendationsList.innerHTML : '',
        competitors: competitorsHTML,
        usabilityAnalysis: usabilityHTML
    };
}

// Salvar dados atuais (versão melhorada que funciona com ou sem CSV)
async function saveCurrentData(monthKey) {
    // Capturar KPIs da tela
    const screenKpis = captureKPIsFromScreen();

    // Capturar seções para verificar se há conteúdo
    const sections = captureSectionsFromScreen();

    // Verificar se há dados na tela de várias formas
    const hasKpiData = screenKpis.total > 0;
    const hasSectionData = sections.alertBox && !sections.alertBox.includes('AGUARDANDO DADOS');
    const hasChartData = Object.keys(captureChartsData()).length > 0;

    console.log('Verificação de dados:', { hasKpiData, hasSectionData, hasChartData, screenKpis });

    // Se não tem nenhum tipo de dado, não salvar
    if (!hasKpiData && !hasSectionData && !hasChartData) {
        console.warn('Nenhum dado para salvar');
        showNotification('Nenhum dado para salvar. Carregue dados primeiro.', 'warning');
        return;
    }

    let summary;
    let kpis;

    // Se tiver csvData, usar o método tradicional para summary
    if (window.csvData && window.csvData.length > 0) {
        summary = prepareDataSummary(window.csvData);
        kpis = {
            total: summary.total,
            cancelados: summary.status['Cancelado'] || 0,
            revertidos: summary.status['Revertido'] || 0,
            desistencia: summary.status['Desistência'] || 0,
            emTratativa: summary.status['Em negociação'] || 0,
            valorTotal: summary.valorTotal,
            valorCancelado: summary.valorCancelado,
            valorRevertido: summary.valorRevertido
        };
    } else {
        // Usar dados capturados da tela
        kpis = screenKpis;
        summary = {
            total: screenKpis.total,
            status: {
                'Cancelado': screenKpis.cancelados,
                'Revertido': screenKpis.revertidos,
                'Em negociação': screenKpis.emTratativa
            },
            valorTotal: screenKpis.valorTotal,
            valorCancelado: screenKpis.valorCancelado,
            valorRevertido: screenKpis.valorRevertido
        };
    }

    // Capturar dados dos gráficos (sections já foi capturado acima)
    const chartsData = captureChartsData();

    console.log('Salvando dados:', { kpis, chartsData: Object.keys(chartsData), sections: Object.keys(sections) });

    await saveMonthData(monthKey, {
        summary: summary,
        kpis: kpis,
        csvData: window.csvData || null,
        chartsData: chartsData,
        sections: sections
    });

    showNotification(`Dados de ${formatMonthDisplay(monthKey)} salvos!`, 'success');
}

// Carregar dados do mês
function loadMonthData(monthData) {
    if (!monthData) return;

    console.log('Carregando dados do mês:', monthData);

    // Restaurar csvData global
    window.csvData = monthData.csvData || null;

    // Atualizar KPIs - usar kpis primeiro, depois summary
    if (monthData.kpis) {
        updateKPIsFromValues(monthData.kpis);
    } else if (monthData.summary) {
        updateKPIs(monthData.summary);
    }

    // Restaurar gráficos
    // Prioridade: 1) csvData + summary, 2) chartsData salvos
    if (monthData.csvData && monthData.summary && monthData.summary.motivos) {
        // Se tiver CSV completo, usar updateCharts normal
        updateCharts(monthData.summary);
    } else if (monthData.chartsData && Object.keys(monthData.chartsData).length > 0) {
        // Se tiver chartsData salvos, restaurar deles
        console.log('Restaurando gráficos de chartsData:', monthData.chartsData);
        restoreChartsFromData(monthData.chartsData);
    } else {
        // Se não tiver nada, mostrar gráficos vazios
        console.log('Sem dados de gráficos para restaurar');
    }

    // Restaurar seções salvas
    if (monthData.sections) {
        console.log('Restaurando seções:', Object.keys(monthData.sections));

        // Restaurar alerta crítico
        const alertBox = document.querySelector('.highlight-box');
        if (alertBox && monthData.sections.alertBox && monthData.sections.alertBox.length > 0) {
            alertBox.innerHTML = monthData.sections.alertBox;
            console.log('Alerta restaurado');
        }

        // Restaurar insights
        const insightsList = document.getElementById('insightsList');
        if (insightsList && monthData.sections.insights && monthData.sections.insights.length > 0) {
            insightsList.innerHTML = monthData.sections.insights;
            console.log('Insights restaurados');
        }

        // Restaurar recomendações
        const recommendationsList = document.getElementById('recommendationsList');
        if (recommendationsList && monthData.sections.recommendations && monthData.sections.recommendations.length > 0) {
            recommendationsList.innerHTML = monthData.sections.recommendations;
            console.log('Recomendações restauradas');
        }

        // Restaurar concorrentes
        if (monthData.sections.competitors && monthData.sections.competitors.length > 0) {
            document.querySelectorAll('.section').forEach(section => {
                const h2 = section.querySelector('h2');
                if (h2 && h2.textContent.includes('Concorrentes')) {
                    const tagsContainer = section.querySelector('div');
                    if (tagsContainer) {
                        tagsContainer.innerHTML = monthData.sections.competitors;
                        console.log('Concorrentes restaurados');
                    }
                }
            });
        }

        // Restaurar análise de usabilidade
        if (monthData.sections.usabilityAnalysis && monthData.sections.usabilityAnalysis.length > 0) {
            const problemGrid = document.querySelector('.problem-grid');
            if (problemGrid) {
                problemGrid.innerHTML = monthData.sections.usabilityAnalysis;
                console.log('Análise de usabilidade restaurada');
            }
        }
    } else {
        console.log('Nenhuma seção para restaurar');
    }

    // Habilitar botão de análise se API está configurada
    const btnGenerate = document.getElementById('btnGenerate');
    if (btnGenerate && hasApiKeyConfigured()) {
        btnGenerate.disabled = false;
    }

    // Atualizar nome do arquivo
    const csvFileName = document.getElementById('csvFileName');
    if (csvFileName) {
        csvFileName.textContent = 'Dados do histórico';
    }
}

// Atualizar KPIs diretamente dos valores (quando não há summary completo)
function updateKPIsFromValues(kpis) {
    const kpiValues = document.querySelectorAll('.kpi-value');
    const kpiLabels = document.querySelectorAll('.kpi-label');

    if (kpiValues.length >= 8) {
        kpiValues[0].textContent = kpis.total || 0;
        kpiValues[1].textContent = kpis.cancelados || 0;
        kpiValues[2].textContent = kpis.revertidos || 0;
        kpiValues[3].textContent = kpis.emTratativa || 0;

        // Formatar valores monetários
        const formatMoney = (val) => {
            if (!val) return 'R$ 0';
            return 'R$ ' + val.toLocaleString('pt-BR');
        };

        kpiValues[4].textContent = formatMoney(kpis.valorTotal);
        kpiValues[5].textContent = formatMoney(kpis.valorCancelado);
        kpiValues[6].textContent = formatMoney(kpis.valorRevertido);

        // Taxa de reversão (corrige valores salvos incorretamente acima de 100%)
        let taxaReversao = kpis.taxaReversao ||
            (kpis.valorTotal > 0 ? ((kpis.valorRevertido / kpis.valorTotal) * 100).toFixed(1) : 0);

        // Correção para dados salvos com erro (ex: 378 em vez de 37.8)
        if (taxaReversao > 100) {
            taxaReversao = (taxaReversao / 10).toFixed(1);
        }
        kpiValues[7].textContent = taxaReversao + '%';

        // Atualizar labels com porcentagens
        const total = kpis.total || 1;
        const pctCancelados = ((kpis.cancelados / total) * 100).toFixed(1);
        const pctRevertidos = ((kpis.revertidos / total) * 100).toFixed(1);
        const pctEmTratativa = ((kpis.emTratativa / total) * 100).toFixed(1);

        if (kpiLabels[1]) kpiLabels[1].textContent = `Cancelados (${pctCancelados}%)`;
        if (kpiLabels[2]) kpiLabels[2].textContent = `Revertidos (${pctRevertidos}%)`;
        if (kpiLabels[3]) kpiLabels[3].textContent = `Em Tratativa (${pctEmTratativa}%)`;
    }
}

// Restaurar gráficos a partir dos dados salvos
function restoreChartsFromData(chartsData) {
    if (!chartsData) return;

    // Inicializar variável global
    window.hubstromCharts = window.hubstromCharts || {};

    Object.keys(chartsData).forEach(chartId => {
        const canvas = document.getElementById(chartId);
        if (!canvas) return;

        const savedData = chartsData[chartId];
        if (!savedData || !savedData.labels) return;

        // Destruir gráfico existente (da variável global ou via Chart.getChart)
        if (window.hubstromCharts[chartId]) {
            window.hubstromCharts[chartId].destroy();
        } else {
            const existingChart = Chart.getChart(canvas);
            if (existingChart) {
                existingChart.destroy();
            }
        }

        // Determinar tipo de gráfico
        const chartType = (chartId === 'tempoChart' || chartId === 'moduloChart') ? 'bar' : 'doughnut';
        const isHorizontal = chartId === 'moduloChart';

        // Recriar gráfico e salvar na variável global com datalabels
        window.hubstromCharts[chartId] = new Chart(canvas, {
            type: chartType,
            data: {
                labels: savedData.labels,
                datasets: savedData.datasets.map(ds => ({
                    data: ds.data,
                    backgroundColor: ds.backgroundColor,
                    borderColor: ds.borderColor || 'transparent',
                    borderWidth: 1
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: chartType === 'doughnut' ? '55%' : undefined,
                plugins: {
                    legend: {
                        display: chartType === 'doughnut',
                        position: 'bottom',
                        labels: { color: '#94a3b8', padding: 10, font: { size: 11 } }
                    },
                    datalabels: {
                        display: (context) => context.dataset.data[context.dataIndex] > 0,
                        color: (context) => {
                            const bgColors = context.dataset.backgroundColor;
                            const bgColor = Array.isArray(bgColors) ? bgColors[context.dataIndex] : bgColors;
                            const lightColors = ['#f59e0b', '#fbbf24', '#fcd34d'];
                            return lightColors.includes(bgColor) ? '#1a1a2e' : '#ffffff';
                        },
                        anchor: 'center',
                        align: 'center',
                        font: { weight: 'bold', size: chartType === 'doughnut' ? 13 : 11 },
                        formatter: (value, context) => {
                            if (chartType === 'doughnut' && chartId === 'motivoChart') {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? ((value / total) * 100).toFixed(0) : 0;
                                return value > 0 ? `${value}\n(${pct}%)` : '';
                            }
                            return value > 0 ? value : '';
                        },
                        textAlign: 'center'
                    }
                },
                scales: chartType === 'bar' ? {
                    y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
                } : {}
            }
        });
    });
}

// Limpar dashboard para novo mês
function clearDashboard() {
    // Limpar dados globais
    window.csvData = null;

    // Resetar KPIs para valores padrão
    const kpiValues = document.querySelectorAll('.kpi-value');
    kpiValues.forEach((el, index) => {
        if (index < 4) {
            el.textContent = '0';
        } else if (index === 4) {
            el.textContent = 'R$ 0';
        } else if (index === 5) {
            el.textContent = 'R$ 0';
        } else if (index === 6) {
            el.textContent = 'R$ 0';
        } else if (index === 7) {
            el.textContent = '0%';
        }
    });

    // Atualizar labels dos KPIs
    const kpiLabels = document.querySelectorAll('.kpi-label');
    if (kpiLabels.length >= 4) {
        kpiLabels[1].textContent = 'Cancelados (0%)';
        kpiLabels[2].textContent = 'Revertidos (0%)';
        kpiLabels[3].textContent = 'Em Tratativa (0%)';
        if (kpiLabels[7]) kpiLabels[7].textContent = 'Taxa de Reversão';
    }

    // Limpar alerta crítico
    const alertBox = document.querySelector('.highlight-box');
    if (alertBox) {
        alertBox.innerHTML = `
            <h3>📊 AGUARDANDO DADOS</h3>
            <p style="font-size: 1.2em; margin-bottom: 10px;">
                <strong>Sincronize com a planilha</strong> para visualizar os dados deste mês.
            </p>
            <p style="color: #ffffff;">
                Clique no botão "Sincronizar" para carregar os dados do Google Sheets.
            </p>
        `;
    }

    // Limpar insights
    const insightsList = document.getElementById('insightsList');
    if (insightsList) {
        insightsList.innerHTML = `
            <li style="color: var(--text-secondary); font-style: italic;">
                Aguardando dados... Sincronize com a planilha para gerar análises.
            </li>
        `;
    }

    // Limpar recomendações
    const recommendationsList = document.getElementById('recommendationsList');
    if (recommendationsList) {
        recommendationsList.innerHTML = `
            <article class="recommendation-card" style="opacity: 0.5;">
                <h4>Aguardando dados...</h4>
                <p>Sincronize com a planilha do Google Sheets para visualizar as recomendações.</p>
            </article>
        `;
    }

    // Limpar concorrentes
    document.querySelectorAll('.section').forEach(section => {
        const h2 = section.querySelector('h2');
        if (h2 && h2.textContent.includes('Concorrentes')) {
            const tagsContainer = section.querySelector('div');
            if (tagsContainer) {
                tagsContainer.innerHTML = `
                    <span class="competitor-tag" style="opacity: 0.5;">Aguardando dados...</span>
                `;
            }
        }
    });

    // Desabilitar botão de gerar análise
    const btnGenerate = document.getElementById('btnGenerate');
    if (btnGenerate) {
        btnGenerate.disabled = true;
    }

    // Resetar nome do arquivo
    const csvFileName = document.getElementById('csvFileName');
    if (csvFileName) {
        csvFileName.textContent = 'Sem dados';
    }

    // Limpar análise de usabilidade
    const problemGrid = document.querySelector('.problem-grid');
    if (problemGrid) {
        problemGrid.innerHTML = `
            <article class="problem-card" style="opacity: 0.5; grid-column: 1 / -1;">
                <h4>Aguardando dados...</h4>
                <p>Sincronize com a planilha para visualizar a análise detalhada.</p>
            </article>
        `;
    }

    // Destruir e recriar gráficos vazios
    clearCharts();
}

// Limpar gráficos
function clearCharts() {
    const chartIds = ['motivoChart', 'statusChart', 'tempoChart', 'moduloChart'];

    // Inicializar variável global
    window.hubstromCharts = window.hubstromCharts || {};

    chartIds.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            // Destruir gráfico existente (da variável global ou via Chart.getChart)
            if (window.hubstromCharts[id]) {
                window.hubstromCharts[id].destroy();
            } else {
                const chartInstance = Chart.getChart(canvas);
                if (chartInstance) {
                    chartInstance.destroy();
                }
            }

            // Criar gráfico vazio e salvar na variável global
            window.hubstromCharts[id] = new Chart(canvas, {
                type: id.includes('tempo') || id.includes('modulo') ? 'bar' : 'doughnut',
                data: {
                    labels: ['Sem dados'],
                    datasets: [{
                        data: [1],
                        backgroundColor: ['rgba(100, 116, 139, 0.3)'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    }
                }
            });
        }
    });
}

// Botão para salvar manualmente
async function saveCurrentMonth() {
    const currentMonth = getCurrentMonth();

    // Verificar se há dados na tela (KPIs ou seções)
    const screenKpis = captureKPIsFromScreen();
    const sections = captureSectionsFromScreen();
    const hasKpiData = screenKpis.total > 0;
    const hasSectionData = sections.alertBox && !sections.alertBox.includes('AGUARDANDO DADOS');

    if (!hasKpiData && !hasSectionData) {
        showNotification('Nenhum dado para salvar. Sincronize com a planilha primeiro.', 'warning');
        return;
    }

    await saveCurrentDataWithHistory(currentMonth);
    await initMonthSelector(); // Atualizar indicador de dados
}

// Salvar dados com histórico (nova função principal)
async function saveCurrentDataWithHistory(monthKey) {
    // Primeiro, salvar versão atual no histórico (se houver dados existentes)
    if (typeof saveToHistory === 'function' && isFirebaseReady()) {
        try {
            await saveToHistory(monthKey);
            console.log('Versão anterior salva no histórico');
        } catch (e) {
            console.warn('Erro ao salvar no histórico:', e);
        }
    }

    // Agora salvar os dados atuais
    await saveCurrentData(monthKey);

    // Limpar histórico antigo (manter últimas 10 versões)
    if (typeof cleanOldHistory === 'function') {
        try {
            await cleanOldHistory(monthKey, 10);
        } catch (e) {
            console.warn('Erro ao limpar histórico antigo:', e);
        }
    }
}

// Botão para excluir dados do mês
async function deleteCurrentMonth() {
    const currentMonth = getCurrentMonth();
    const monthDisplay = formatMonthDisplay(currentMonth);

    // Confirmar exclusão
    if (!confirm(`Tem certeza que deseja excluir todos os dados de ${monthDisplay}?\n\nEsta ação não pode ser desfeita.`)) {
        return;
    }

    try {
        // Deletar do Firebase e localStorage
        await deleteMonthData(currentMonth);

        // Limpar cache
        delete monthsCache[currentMonth];

        // Limpar dashboard
        clearDashboard();

        // Atualizar seletor
        await initMonthSelector();

        showNotification(`Dados de ${monthDisplay} excluídos com sucesso!`, 'success');
    } catch (error) {
        console.error('Erro ao excluir dados:', error);
        showNotification('Erro ao excluir dados. Tente novamente.', 'error');
    }
}

// ==========================================
// MODAL DE HISTÓRICO DE VERSÕES
// ==========================================

// Abrir modal de histórico
async function openHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (!modal) return;

    modal.style.display = 'flex';

    // Carregar lista de versões
    await loadHistoryList();
}

// Fechar modal de histórico
function closeHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Carregar lista de versões do histórico
async function loadHistoryList() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;

    historyList.innerHTML = '<div class="history-loading">Carregando histórico...</div>';

    const currentMonth = getCurrentMonth();

    if (!isFirebaseReady()) {
        historyList.innerHTML = '<div class="history-empty">Firebase não está conectado.</div>';
        return;
    }

    try {
        const versions = await getHistoryVersions(currentMonth);

        if (versions.length === 0) {
            historyList.innerHTML = `
                <div class="history-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <p>Nenhuma versão anterior encontrada para <strong>${formatMonthDisplay(currentMonth)}</strong>.</p>
                    <p style="font-size: 0.9em; color: var(--text-muted);">Versões serão criadas automaticamente quando você sincronizar com a planilha.</p>
                </div>
            `;
            return;
        }

        // Renderizar lista de versões
        let html = `<div class="history-month-title">Versões de ${formatMonthDisplay(currentMonth)}</div>`;

        versions.forEach((version, index) => {
            const date = new Date(version.date);
            const formattedDate = date.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // Extrair resumo dos KPIs
            const kpis = version.kpis || version.summary || {};
            const total = kpis.total || 0;
            const cancelados = kpis.cancelados || kpis.status?.['Cancelado'] || 0;
            const revertidos = kpis.revertidos || kpis.status?.['Revertido'] || 0;

            html += `
                <div class="history-item ${index === 0 ? 'latest' : ''}">
                    <div class="history-item-header">
                        <span class="history-date">${formattedDate}</span>
                        ${index === 0 ? '<span class="history-badge">Mais recente</span>' : ''}
                    </div>
                    <div class="history-item-summary">
                        <span class="history-stat"><strong>${total}</strong> solicitações</span>
                        <span class="history-stat danger"><strong>${cancelados}</strong> cancelados</span>
                        <span class="history-stat success"><strong>${revertidos}</strong> revertidos</span>
                    </div>
                    <div class="history-item-actions">
                        <button class="btn-restore" onclick="restoreHistoryVersion('${version.key}')" title="Restaurar esta versão">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="1 4 1 10 7 10"/>
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                            </svg>
                            Restaurar
                        </button>
                        <button class="btn-delete-history" onclick="deleteHistoryVersionUI('${version.key}')" title="Excluir esta versão">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        });

        historyList.innerHTML = html;
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        historyList.innerHTML = '<div class="history-empty">Erro ao carregar histórico. Tente novamente.</div>';
    }
}

// Restaurar versão do histórico
async function restoreHistoryVersion(versionKey) {
    const currentMonth = getCurrentMonth();
    const monthDisplay = formatMonthDisplay(currentMonth);

    if (!confirm(`Deseja restaurar esta versão?\n\nOs dados atuais de ${monthDisplay} serão substituídos pela versão selecionada.\n\n(Uma cópia dos dados atuais será salva no histórico)`)) {
        return;
    }

    try {
        showNotification('Restaurando versão...', 'info');

        const success = await restoreFromHistory(currentMonth, versionKey);

        if (success) {
            // Limpar cache
            delete monthsCache[currentMonth];

            // Recarregar dados
            const monthData = await getMonthData(currentMonth);
            if (monthData) {
                loadMonthData(monthData);
            }

            // Atualizar lista do histórico
            await loadHistoryList();

            showNotification('Versão restaurada com sucesso!', 'success');
        } else {
            showNotification('Erro ao restaurar versão.', 'error');
        }
    } catch (error) {
        console.error('Erro ao restaurar:', error);
        showNotification('Erro ao restaurar versão. Tente novamente.', 'error');
    }
}

// Deletar versão do histórico (UI)
async function deleteHistoryVersionUI(versionKey) {
    if (!confirm('Deseja excluir esta versão do histórico?\n\nEsta ação não pode ser desfeita.')) {
        return;
    }

    try {
        const currentMonth = getCurrentMonth();
        const success = await deleteHistoryVersion(currentMonth, versionKey);

        if (success) {
            await loadHistoryList();
            showNotification('Versão excluída do histórico.', 'success');
        } else {
            showNotification('Erro ao excluir versão.', 'error');
        }
    } catch (error) {
        console.error('Erro ao excluir versão:', error);
        showNotification('Erro ao excluir versão. Tente novamente.', 'error');
    }
}

// Fechar modal ao clicar fora
document.addEventListener('click', (e) => {
    const historyModal = document.getElementById('historyModal');
    if (e.target === historyModal) {
        closeHistoryModal();
    }
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================

// Função para marcar dashboard como carregado (remove flash visual)
function markDashboardLoaded() {
    document.body.classList.remove('dashboard-loading');
    document.body.classList.add('dashboard-loaded');
}

// Inicialização quando DOM carrega
document.addEventListener('DOMContentLoaded', () => {
    // Pequeno delay para garantir que outros scripts carregaram
    setTimeout(async () => {
        // Inicializar seletor de mês
        await initMonthSelector();

        // Verificar se há dados para o mês atual
        const currentMonth = getCurrentMonth();
        const monthData = await getMonthData(currentMonth);

        if (monthData) {
            // Carregar dados automaticamente
            loadMonthData(monthData);
            showNotification(`Dados de ${formatMonthDisplay(currentMonth)} carregados do histórico.`);
        }

        // Marcar dashboard como carregado (remove o estado de loading)
        markDashboardLoaded();
    }, 500); // Delay maior para esperar Firebase inicializar
});

// Escutar quando Firebase estiver pronto
window.addEventListener('firebaseReady', async () => {
    console.log('Firebase pronto! Atualizando seletor de meses...');

    // Verificar se há dados locais para sincronizar
    const localHistory = localStorage.getItem(HISTORY_KEY);
    if (localHistory) {
        try {
            const history = JSON.parse(localHistory);
            const localMonths = Object.keys(history);
            const firebaseMonths = await getHistoryMonthsFromFirebase();

            // Sincronizar meses que estão apenas localmente
            for (const month of localMonths) {
                if (!firebaseMonths.includes(month)) {
                    console.log(`Sincronizando ${month} para o Firebase...`);
                    await saveMonthDataToFirebase(month, history[month]);
                }
            }
        } catch (e) {
            console.error('Erro ao sincronizar dados locais:', e);
        }
    }

    // Atualizar seletor
    await initMonthSelector();
});
