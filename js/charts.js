/* ===================================
   Hubstrom - Gráficos Premium
   Identidade Visual
   =================================== */

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

// Animação customizada
const customAnimation = {
    duration: 1500,
    easing: 'easeOutQuart',
    delay: (context) => context.dataIndex * 100
};

// Inicialização quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    initMotivoChart();
    initStatusChart();
    initTempoChart();
    initModuloChart();
});

// Gráfico de Motivos - Doughnut Premium
function initMotivoChart() {
    const ctx = document.getElementById('motivoChart');
    if (!ctx) return;

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Usabilidade (49%)', 'Financeiro (32%)', 'Migração (19%)'],
            datasets: [{
                data: [26, 17, 10],
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
                hoverBorderColor: hubstromColors.dark,
                spacing: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '60%',
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
                }
            }
        }
    });
}

// Gráfico de Status - Doughnut Premium
function initStatusChart() {
    const ctx = document.getElementById('statusChart');
    if (!ctx) return;

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Cancelado', 'Revertido', 'Desistência', 'Em negociação', 'Primeiro Contato'],
            datasets: [{
                data: [34, 13, 4, 1, 1],
                backgroundColor: [
                    hubstromColors.danger,
                    hubstromColors.accent,
                    hubstromColors.info,
                    hubstromColors.warning,
                    hubstromColors.darkLight
                ],
                hoverBackgroundColor: [
                    hubstromColors.dangerLight,
                    hubstromColors.accentLight,
                    hubstromColors.infoLight,
                    hubstromColors.warningLight,
                    hubstromColors.dark
                ],
                borderWidth: 0,
                hoverBorderWidth: 3,
                hoverBorderColor: hubstromColors.dark,
                spacing: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '60%',
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
                }
            }
        }
    });
}

// Gráfico de Tempo de Uso - Bar Premium
function initTempoChart() {
    const ctx = document.getElementById('tempoChart');
    if (!ctx) return;

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['0-3 meses', '3-6 meses', '6-12 meses', '+12 meses'],
            datasets: [
                {
                    label: 'Cancelados',
                    data: [12, 12, 4, 6],
                    backgroundColor: createGradient(ctx, hubstromColors.danger, hubstromColors.dangerLight),
                    hoverBackgroundColor: hubstromColors.dangerLight,
                    borderRadius: 8,
                    borderSkipped: false
                },
                {
                    label: 'Revertidos',
                    data: [4, 5, 2, 2],
                    backgroundColor: createGradient(ctx, hubstromColors.accent, hubstromColors.accentLight),
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

// Gráfico de Módulos - Horizontal Bar Premium
function initModuloChart() {
    const ctx = document.getElementById('moduloChart');
    if (!ctx) return;

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['ConnectHub', 'XMLHub', 'TaskHub', 'MonitorHub'],
            datasets: [{
                label: 'Reclamações',
                data: [7, 5, 4, 2],
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
