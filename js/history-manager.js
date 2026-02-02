/* ===================================
   Hubstrom - Gerenciador de Histórico
   Controle de dados mensais
   =================================== */

// Chave base para localStorage
const HISTORY_KEY = 'hubstrom_cancelamentos_history';
const CURRENT_MONTH_KEY = 'hubstrom_current_month';

// Obter lista de meses com dados salvos
function getHistoryMonths() {
    const history = localStorage.getItem(HISTORY_KEY);
    if (!history) return [];

    try {
        const data = JSON.parse(history);
        return Object.keys(data).sort().reverse(); // Mais recente primeiro
    } catch (e) {
        console.error('Erro ao ler histórico:', e);
        return [];
    }
}

// Obter dados de um mês específico
function getMonthData(monthKey) {
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
function saveMonthData(monthKey, data) {
    let history = {};

    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
        try {
            history = JSON.parse(stored);
        } catch (e) {
            history = {};
        }
    }

    history[monthKey] = {
        savedAt: new Date().toISOString(),
        summary: data.summary,
        kpis: data.kpis,
        charts: data.charts,
        csvData: data.csvData // Dados brutos do CSV
    };

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    console.log('Dados salvos para:', monthKey);
}

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

// Verificar se há dados para um mês
function hasDataForMonth(monthKey) {
    const data = getMonthData(monthKey);
    return data !== null;
}

// Deletar dados de um mês
function deleteMonthData(monthKey) {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (!stored) return;

    try {
        const history = JSON.parse(stored);
        delete history[monthKey];
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        console.log('Dados deletados para:', monthKey);
    } catch (e) {
        console.error('Erro ao deletar dados:', e);
    }
}

// Inicializar seletor de mês
function initMonthSelector() {
    const selector = document.getElementById('monthSelector');
    if (!selector) return;

    const currentMonth = getCurrentMonth();
    const availableMonths = getAvailableMonths();

    // Limpar opções existentes
    selector.innerHTML = '';

    // Adicionar opções
    availableMonths.forEach(month => {
        const option = document.createElement('option');
        option.value = month.key;
        option.textContent = month.display;

        if (month.hasData) {
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
function handleMonthChange(newMonthKey) {
    const previousMonth = getCurrentMonth();

    // Se há dados não salvos no mês atual, perguntar se quer salvar
    if (window.csvData && window.csvData.length > 0 && previousMonth !== newMonthKey) {
        const shouldSave = confirm(`Deseja salvar os dados atuais de ${formatMonthDisplay(previousMonth)} antes de trocar?`);
        if (shouldSave) {
            saveCurrentData(previousMonth);
        }
    }

    // Atualizar mês atual
    setCurrentMonth(newMonthKey);
    updateHeaderTitle(newMonthKey);

    // Carregar dados do novo mês se existirem
    const monthData = getMonthData(newMonthKey);

    if (monthData) {
        loadMonthData(monthData);
        showNotification(`Dados de ${formatMonthDisplay(newMonthKey)} carregados!`);
    } else {
        clearDashboard();
        showNotification(`${formatMonthDisplay(newMonthKey)} - Sem dados. Carregue um CSV.`);
    }

    // Atualizar seletor para mostrar indicadores atualizados
    initMonthSelector();
}

// Salvar dados atuais
function saveCurrentData(monthKey) {
    if (!window.csvData || window.csvData.length === 0) {
        console.warn('Nenhum dado para salvar');
        return;
    }

    const summary = prepareDataSummary(window.csvData);

    // Coletar KPIs atuais
    const kpis = {
        total: summary.total,
        cancelados: summary.status['Cancelado'] || 0,
        revertidos: summary.status['Revertido'] || 0,
        desistencia: summary.status['Desistência'] || 0,
        emTratativa: summary.status['Em negociação'] || 0,
        valorTotal: summary.valorTotal,
        valorCancelado: summary.valorCancelado,
        valorRevertido: summary.valorRevertido
    };

    // Capturar HTML das seções dinâmicas
    const alertBox = document.querySelector('.highlight-box');
    const insightsList = document.getElementById('insightsList');
    const recommendationsList = document.getElementById('recommendationsList');
    const competitorsSection = document.querySelector('.section:has(h2)');

    // Encontrar seção de concorrentes corretamente
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

    saveMonthData(monthKey, {
        summary: summary,
        kpis: kpis,
        csvData: window.csvData,
        // Salvar HTML das seções
        sections: {
            alertBox: alertBox ? alertBox.innerHTML : '',
            insights: insightsList ? insightsList.innerHTML : '',
            recommendations: recommendationsList ? recommendationsList.innerHTML : '',
            competitors: competitorsHTML
        }
    });

    showNotification(`Dados de ${formatMonthDisplay(monthKey)} salvos!`, 'success');
}

// Carregar dados do mês
function loadMonthData(monthData) {
    if (!monthData) return;

    // Restaurar csvData global
    window.csvData = monthData.csvData;

    // Atualizar KPIs
    if (monthData.summary) {
        updateKPIs(monthData.summary);
        updateCharts(monthData.summary);
    }

    // Restaurar seções salvas
    if (monthData.sections) {
        // Restaurar alerta crítico
        const alertBox = document.querySelector('.highlight-box');
        if (alertBox && monthData.sections.alertBox) {
            alertBox.innerHTML = monthData.sections.alertBox;
        }

        // Restaurar insights
        const insightsList = document.getElementById('insightsList');
        if (insightsList && monthData.sections.insights) {
            insightsList.innerHTML = monthData.sections.insights;
        }

        // Restaurar recomendações
        const recommendationsList = document.getElementById('recommendationsList');
        if (recommendationsList && monthData.sections.recommendations) {
            recommendationsList.innerHTML = monthData.sections.recommendations;
        }

        // Restaurar concorrentes
        if (monthData.sections.competitors) {
            document.querySelectorAll('.section').forEach(section => {
                const h2 = section.querySelector('h2');
                if (h2 && h2.textContent.includes('Concorrentes')) {
                    const tagsContainer = section.querySelector('div');
                    if (tagsContainer) {
                        tagsContainer.innerHTML = monthData.sections.competitors;
                    }
                }
            });
        }
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
                <strong>Carregue um CSV</strong> para visualizar os dados deste mês.
            </p>
            <p style="color: #ffffff;">
                Selecione o arquivo CSV com os dados de cancelamentos para gerar a análise completa.
            </p>
        `;
    }

    // Limpar insights
    const insightsList = document.getElementById('insightsList');
    if (insightsList) {
        insightsList.innerHTML = `
            <li style="color: var(--text-secondary); font-style: italic;">
                Nenhum insight disponível. Carregue um CSV para gerar análises.
            </li>
        `;
    }

    // Limpar recomendações
    const recommendationsList = document.getElementById('recommendationsList');
    if (recommendationsList) {
        recommendationsList.innerHTML = `
            <article class="recommendation-card" style="opacity: 0.5;">
                <h4>Aguardando dados...</h4>
                <p>Carregue um arquivo CSV para visualizar as recomendações baseadas nos dados de cancelamento.</p>
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
        csvFileName.textContent = 'Carregar CSV';
    }

    // Destruir e recriar gráficos vazios
    clearCharts();
}

// Limpar gráficos
function clearCharts() {
    const chartIds = ['motivoChart', 'statusChart', 'tempoChart', 'moduloChart'];

    chartIds.forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            // Obter instância do Chart.js e destruir
            const chartInstance = Chart.getChart(canvas);
            if (chartInstance) {
                chartInstance.destroy();
            }

            // Criar gráfico vazio
            new Chart(canvas, {
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
function saveCurrentMonth() {
    const currentMonth = getCurrentMonth();

    if (!window.csvData || window.csvData.length === 0) {
        showNotification('Nenhum dado para salvar. Carregue um CSV primeiro.', 'warning');
        return;
    }

    saveCurrentData(currentMonth);
    initMonthSelector(); // Atualizar indicador de dados
}

// Inicialização quando DOM carrega
document.addEventListener('DOMContentLoaded', () => {
    // Pequeno delay para garantir que outros scripts carregaram
    setTimeout(() => {
        // Inicializar seletor de mês
        initMonthSelector();

        // Verificar se há dados para o mês atual
        const currentMonth = getCurrentMonth();
        const monthData = getMonthData(currentMonth);

        if (monthData) {
            // Carregar dados automaticamente
            loadMonthData(monthData);
            showNotification(`Dados de ${formatMonthDisplay(currentMonth)} carregados do histórico.`);
        }
    }, 100);
});
