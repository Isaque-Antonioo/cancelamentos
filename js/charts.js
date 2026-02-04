/* ===================================
   Hubstrom - Gráficos Premium
   Identidade Visual
   =================================== */

// Variável global para armazenar instâncias dos gráficos
window.hubstromCharts = window.hubstromCharts || {};

// Paleta de Cores Hubstrom
const hubstromColors = {
    dark: '#1e293b',
    darkLight: '#334155',
    accent: '#35cca3',
    accentLight: '#5ddbb8',
    accentDark: '#2ba882',
    danger: '#ef4444',
    dangerLight: '#f87171',
    warning: '#f59e0b',
    warningLight: '#fbbf24',
    info: '#3b82f6',
    infoLight: '#60a5fa',
    textPrimary: '#f8fafc',
    textSecondary: '#94a3b8'
};

// Registrar o plugin datalabels
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

// Configurações globais do Chart.js
Chart.defaults.color = hubstromColors.textSecondary;
Chart.defaults.font.family = "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif";
Chart.defaults.plugins.tooltip.backgroundColor = hubstromColors.dark;
Chart.defaults.plugins.tooltip.titleColor = hubstromColors.accent;
Chart.defaults.plugins.tooltip.bodyColor = hubstromColors.textPrimary;
Chart.defaults.plugins.tooltip.borderColor = 'rgba(53, 204, 163, 0.3)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.padding = 12;

// Desabilitar datalabels globalmente (habilitar apenas onde necessário)
Chart.defaults.plugins.datalabels = {
    display: false
};

// Função para determinar cor do texto baseada na cor de fundo
function getContrastColor(backgroundColor) {
    // Cores que precisam de texto escuro (cores claras)
    const lightColors = ['#f59e0b', '#fbbf24', '#fbbf24', '#fcd34d', '#fef3c7', '#f59e0b'];
    const warningColors = [hubstromColors.warning, hubstromColors.warningLight];

    if (warningColors.includes(backgroundColor) || lightColors.includes(backgroundColor)) {
        return '#1a1a2e'; // Texto escuro para fundos claros (amarelo/laranja)
    }
    return '#ffffff'; // Texto branco para fundos escuros
}

// Função para obter cor do datalabel baseada no contexto
function getDatalabelColor(context) {
    const dataset = context.dataset;
    const index = context.dataIndex;
    let bgColor;

    if (Array.isArray(dataset.backgroundColor)) {
        bgColor = dataset.backgroundColor[index];
    } else {
        bgColor = dataset.backgroundColor;
    }

    return getContrastColor(bgColor);
}

// Animação customizada
const customAnimation = {
    duration: 1500,
    easing: 'easeOutQuart',
    delay: (context) => context.dataIndex * 100
};

// Inicialização quando o DOM estiver pronto
// NÃO inicializar automaticamente - deixar o history-manager carregar os dados primeiro
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se há dados salvos - se não houver, inicializar gráficos vazios após delay
    setTimeout(() => {
        // Se os gráficos ainda não foram inicializados pelo history-manager
        if (!window.hubstromCharts.motivoChart) {
            initEmptyCharts();
        }
    }, 1000);
});

// Inicializar gráficos vazios (placeholder)
function initEmptyCharts() {
    const chartConfigs = [
        { id: 'motivoChart', type: 'doughnut' },
        { id: 'statusChart', type: 'doughnut' },
        { id: 'tempoChart', type: 'bar' },
        { id: 'moduloChart', type: 'bar' }
    ];

    chartConfigs.forEach(config => {
        const ctx = document.getElementById(config.id);
        if (ctx && !window.hubstromCharts[config.id]) {
            window.hubstromCharts[config.id] = new Chart(ctx, {
                type: config.type,
                data: {
                    labels: ['Aguardando dados...'],
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

// Gráfico de Motivos - Doughnut Premium com valores dentro
function initMotivoChart() {
    const ctx = document.getElementById('motivoChart');
    if (!ctx) return;

    window.hubstromCharts.motivoChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Usabilidade (48%)', 'Migração (20%)', 'Financeiro (32%)'],
            datasets: [{
                data: [32, 13, 21],
                backgroundColor: [
                    hubstromColors.danger,
                    hubstromColors.warning,
                    hubstromColors.info
                ],
                hoverBackgroundColor: [
                    hubstromColors.dangerLight,
                    hubstromColors.warningLight,
                    hubstromColors.infoLight
                ],
                borderWidth: 0,
                hoverBorderWidth: 3,
                hoverBorderColor: '#ffffff',
                spacing: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '55%',
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 1500,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: hubstromColors.textSecondary,
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: {
                            size: 11,
                            weight: '500'
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return ` ${value} solicitações (${percentage}%)`;
                        }
                    }
                },
                datalabels: {
                    display: true,
                    color: getDatalabelColor,
                    font: {
                        weight: 'bold',
                        size: 14
                    },
                    formatter: (value, context) => {
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = ((value / total) * 100).toFixed(0);
                        return value > 0 ? `${value}\n(${percentage}%)` : '';
                    },
                    textAlign: 'center'
                }
            }
        }
    });
}

// Gráfico de Status - Doughnut Premium com valores dentro
function initStatusChart() {
    const ctx = document.getElementById('statusChart');
    if (!ctx) return;

    window.hubstromCharts.statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Cancelado', 'Revertido', 'Desistência', 'Em negociação'],
            datasets: [{
                data: [42, 17, 7, 0],
                backgroundColor: [
                    hubstromColors.danger,
                    hubstromColors.accent,
                    hubstromColors.info,
                    hubstromColors.warning
                ],
                hoverBackgroundColor: [
                    hubstromColors.dangerLight,
                    hubstromColors.accentLight,
                    hubstromColors.infoLight,
                    hubstromColors.warningLight
                ],
                borderWidth: 0,
                hoverBorderWidth: 3,
                hoverBorderColor: '#ffffff',
                spacing: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '55%',
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 1500,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: hubstromColors.textSecondary,
                        padding: 12,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: {
                            size: 11,
                            weight: '500'
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return ` ${value} (${percentage}%)`;
                        }
                    }
                },
                datalabels: {
                    display: (context) => context.dataset.data[context.dataIndex] > 0,
                    color: getDatalabelColor,
                    font: {
                        weight: 'bold',
                        size: 13
                    },
                    formatter: (value) => {
                        return value > 0 ? value : '';
                    },
                    textAlign: 'center'
                }
            }
        }
    });
}

// Gráfico de Tempo de Uso - Bar Premium com valores
function initTempoChart() {
    const ctx = document.getElementById('tempoChart');
    if (!ctx) return;

    window.hubstromCharts.tempoChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['0-3 meses', '3-6 meses', '6-12 meses', '+12 meses'],
            datasets: [
                {
                    label: 'Cancelados',
                    data: [20, 16, 6, 7],
                    backgroundColor: hubstromColors.danger,
                    hoverBackgroundColor: hubstromColors.dangerLight,
                    borderRadius: 8,
                    borderSkipped: false
                },
                {
                    label: 'Revertidos',
                    data: [7, 5, 3, 2],
                    backgroundColor: hubstromColors.accent,
                    hoverBackgroundColor: hubstromColors.accentLight,
                    borderRadius: 8,
                    borderSkipped: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            animation: {
                duration: 1500,
                easing: 'easeOutQuart'
            },
            plugins: {
                legend: {
                    labels: {
                        color: hubstromColors.textSecondary,
                        usePointStyle: true,
                        pointStyle: 'rect',
                        padding: 12,
                        font: {
                            size: 11,
                            weight: '500'
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (context) => `Período: ${context[0].label}`,
                        label: (context) => ` ${context.dataset.label}: ${context.raw} clientes`
                    }
                },
                datalabels: {
                    display: (context) => context.dataset.data[context.dataIndex] > 0,
                    color: getDatalabelColor,
                    anchor: 'center',
                    align: 'center',
                    font: {
                        weight: 'bold',
                        size: 11
                    },
                    formatter: (value) => value > 0 ? value : ''
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: hubstromColors.textSecondary,
                        font: { size: 10, weight: '500' }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.06)',
                        drawBorder: false
                    }
                },
                x: {
                    ticks: {
                        color: hubstromColors.textSecondary,
                        font: { size: 10, weight: '500' }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Gráfico de Módulos - Horizontal Bar Premium com valores
function initModuloChart() {
    const ctx = document.getElementById('moduloChart');
    if (!ctx) return;

    window.hubstromCharts.moduloChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['ConnectHub', 'XMLHub', 'TaskHub', 'MonitorHub'],
            datasets: [{
                label: 'Reclamações',
                data: [10, 5, 4, 2],
                backgroundColor: [
                    hubstromColors.danger,
                    hubstromColors.warning,
                    hubstromColors.info,
                    hubstromColors.accent
                ],
                hoverBackgroundColor: [
                    hubstromColors.dangerLight,
                    hubstromColors.warningLight,
                    hubstromColors.infoLight,
                    hubstromColors.accentLight
                ],
                borderRadius: 6,
                borderSkipped: false,
                barThickness: 24
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            animation: {
                duration: 1500,
                easing: 'easeOutQuart',
                delay: (context) => context.dataIndex * 200
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (context) => `Módulo: ${context[0].label}`,
                        label: (context) => ` ${context.raw} reclamações`
                    }
                },
                datalabels: {
                    display: true,
                    color: getDatalabelColor,
                    anchor: 'center',
                    align: 'center',
                    font: {
                        weight: 'bold',
                        size: 12
                    },
                    formatter: (value) => value > 0 ? value : ''
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        color: hubstromColors.textSecondary,
                        font: { size: 10, weight: '500' }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.06)',
                        drawBorder: false
                    }
                },
                y: {
                    ticks: {
                        color: hubstromColors.textSecondary,
                        font: {
                            weight: '600',
                            size: 11
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Função auxiliar para criar gradientes
function createGradient(ctx, colorStart, colorEnd) {
    const canvas = ctx.canvas || ctx;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, colorStart);
    gradient.addColorStop(1, colorEnd);
    return gradient;
}
