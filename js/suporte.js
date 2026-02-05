/* ===================================
   Suporte Técnico - Dashboard
   Conexão Google Sheets + Charts
   =================================== */

// Configuração da planilha
const SUPORTE_CONFIG = {
    sheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQCqR3fa7F3g3m7oJjaL0GTFr80MACWMDP--7qLvtRS1t2o5Ulx9oRsSVfFlMysL18wSs5EyIoaPOJQ/pub',
    gid: '1911528911',
    refreshInterval: 5 * 60 * 1000
};

// Paleta de cores
const suporteColors = {
    accent: '#35cca3', accentLight: '#4eebc4',
    danger: '#ef4444', dangerLight: '#f87171',
    warning: '#f59e0b', warningLight: '#fbbf24',
    success: '#2ed573', successLight: '#69f0ae',
    info: '#3b82f6', infoLight: '#60a5fa',
    purple: '#a855f7', purpleLight: '#c084fc',
    pink: '#ec4899', pinkLight: '#f472b6',
    cyan: '#06b6d4', cyanLight: '#22d3ee',
    orange: '#f97316', orangeLight: '#fb923c',
    teal: '#14b8a6', slate: '#64748b',
    dark: '#1e293b', textPrimary: '#f8fafc', textSecondary: '#94a3b8'
};

const chartPalette = [
    suporteColors.accent, suporteColors.info, suporteColors.warning,
    suporteColors.danger, suporteColors.purple, suporteColors.pink,
    suporteColors.cyan, suporteColors.orange, suporteColors.teal,
    suporteColors.successLight, suporteColors.infoLight, suporteColors.warningLight,
    suporteColors.dangerLight, suporteColors.purpleLight, suporteColors.pinkLight
];

// Estado global
let allData = [];           // Todos os dados da planilha
let filteredData = [];      // Dados filtrados pelo mês
let suporteCharts = {};
let currentMonth = 'todos';
let refreshTimer = null;

// Palavras que indicam que é linha de cabeçalho (não dados)
const HEADER_WORDS = ['razão social', 'razao social', 'módulo', 'modulo', 'processo', 'canal de atendimento', 'canal', 'ligação', 'ligacao', 'status', 'dia/mês', 'dia/mes', 'colaborador', 'atendente'];

// Meses para referência
const MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ===================================
// INICIALIZAÇÃO
// ===================================
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        document.getElementById('sidebar').classList.add('ready');
    }, 50);

    Chart.register(ChartDataLabels);
    Chart.defaults.font.family = "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif";
    Chart.defaults.color = suporteColors.textSecondary;
    Chart.defaults.plugins.tooltip.backgroundColor = suporteColors.dark;
    Chart.defaults.plugins.tooltip.titleColor = suporteColors.textPrimary;
    Chart.defaults.plugins.tooltip.bodyColor = suporteColors.textSecondary;
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(53, 204, 163, 0.3)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.padding = 10;

    fetchData();
    refreshTimer = setInterval(fetchData, SUPORTE_CONFIG.refreshInterval);
});

// ===================================
// FETCH E PARSE
// ===================================
async function fetchData() {
    try {
        const csvUrl = `${SUPORTE_CONFIG.sheetUrl}?gid=${SUPORTE_CONFIG.gid}&single=true&output=csv`;
        const response = await fetch(csvUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const csvText = await response.text();
        allData = parseCSV(csvText);

        if (allData.length === 0) {
            updateSubtitle('Nenhum dado encontrado na planilha');
            return;
        }

        buildMonthFilter(allData);
        applyFilter();

    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        updateSubtitle('Erro ao carregar dados. Verifique a conexão.');
    }
}

function parseCSV(text) {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 2) continue;

        const row = {};
        headers.forEach((header, idx) => {
            row[header] = (values[idx] || '').trim();
        });

        row._razaoSocial = getCol(row, 'Razão Social', 'Razao Social', 'Cliente', 'Empresa') || '';
        row._modulo = getCol(row, 'Módulo', 'Modulo', 'Module') || '';
        row._processo = getCol(row, 'Processo', 'Process') || '';
        row._canal = getCol(row, 'Canal de Atendimento', 'Canal de atendimento', 'Canal', 'Channel') || '';
        row._ligacao = getCol(row, 'Ligação', 'Ligacao', 'Ligações', 'Call') || '';
        row._status = getCol(row, 'Status', 'Situação', 'Situacao') || '';
        row._diaMes = getCol(row, 'Dia/Mês', 'Dia/Mes', 'Dia', 'Data', 'Date') || '';
        row._colaborador = getCol(row, 'Colaborador', 'Atendente', 'Responsável', 'Responsavel') || '';

        // Extrair mês numérico do campo Dia/Mês (formato dd/mm ou dd/mm/yyyy)
        row._mesNum = extractMonth(row._diaMes);

        // Filtrar linhas de cabeçalho repetidas e linhas vazias
        if (isHeaderRow(row)) continue;
        if (!row._razaoSocial && !row._status && !row._modulo) continue;

        data.push(row);
    }

    return data;
}

function isHeaderRow(row) {
    // Detectar linhas que são repetições do cabeçalho
    const vals = [row._razaoSocial, row._modulo, row._processo, row._canal, row._status, row._colaborador];
    for (const val of vals) {
        if (val && HEADER_WORDS.includes(val.toLowerCase().trim())) {
            return true;
        }
    }
    return false;
}

function extractMonth(diaMes) {
    if (!diaMes) return null;
    const parts = diaMes.split('/');
    if (parts.length >= 2) {
        const month = parseInt(parts[1]);
        if (month >= 1 && month <= 12) return month;
    }
    return null;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current); current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function getCol(row, ...names) {
    for (const name of names) {
        for (const key of Object.keys(row)) {
            if (key.toLowerCase().trim() === name.toLowerCase().trim()) return row[key];
        }
    }
    return null;
}

// ===================================
// FILTRO POR MÊS
// ===================================
function buildMonthFilter(data) {
    const selector = document.getElementById('monthFilter');
    if (!selector) return;

    // Descobrir meses disponíveis
    const months = new Set();
    data.forEach(row => {
        if (row._mesNum) months.add(row._mesNum);
    });

    const sortedMonths = Array.from(months).sort((a, b) => a - b);

    // Guardar seleção atual
    const prev = selector.value;

    selector.innerHTML = `<option value="todos">Todos os meses</option>`;
    sortedMonths.forEach(m => {
        const count = data.filter(r => r._mesNum === m).length;
        selector.innerHTML += `<option value="${m}">${MESES_NOMES[m - 1]} (${count})</option>`;
    });

    // Restaurar seleção
    if (prev && selector.querySelector(`option[value="${prev}"]`)) {
        selector.value = prev;
    }
    currentMonth = selector.value;
}

function handleMonthFilter(value) {
    currentMonth = value;
    applyFilter();
}

function applyFilter() {
    if (currentMonth === 'todos') {
        filteredData = allData;
    } else {
        const mes = parseInt(currentMonth);
        filteredData = allData.filter(r => r._mesNum === mes);
    }

    const summary = buildSummary(filteredData);
    updateKPIs(summary);
    updateCharts(summary);
    renderTable(filteredData);

    const mesLabel = currentMonth === 'todos' ? 'Todos os meses' : MESES_NOMES[parseInt(currentMonth) - 1];
    updateSubtitle(`${filteredData.length} chamados (${mesLabel}) • Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);

    // Atualizar título do timeline
    const timelineTitle = document.getElementById('timelineTitle');
    if (timelineTitle) {
        timelineTitle.textContent = currentMonth === 'todos' ? 'Chamados por Mês' : `Chamados por Dia - ${mesLabel}`;
    }
}

// ===================================
// NORMALIZAÇÃO DE VALORES
// ===================================
function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function normalizeStatus(val) {
    if (!val) return '';
    const v = val.trim();
    const low = v.toLowerCase().replace(/\s+/g, ' ');

    if (low.includes('resolv')) return 'Resolvido';
    if (low.includes('conclu')) return 'Concluído';
    if (low.includes('andamento') || low.includes('progres')) return 'Em Andamento';
    if (low.includes('pend') || low.includes('aguard') || low.includes('aberto')) return 'Pendente';
    if (low.includes('cancel')) return 'Cancelado';
    if (low.includes('finaliz') || low.includes('feito') || low.includes('atendido')) return 'Finalizado';

    // Capitalizar primeira letra
    return capitalizeFirst(v);
}

function normalizeGeneric(val) {
    if (!val) return '';
    const v = val.trim().replace(/\s+/g, ' ');
    // Capitalizar cada palavra
    return v.split(' ').map(w => {
        if (w.length <= 2) return w.toLowerCase(); // de, do, da, em
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
}

function normalizeColaborador(val) {
    if (!val) return '';
    const v = val.trim().replace(/\s+/g, ' ');
    // Capitalizar nome
    return v.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// ===================================
// PROCESSAMENTO DOS DADOS
// ===================================
function buildSummary(data) {
    const summary = {
        total: data.length,
        status: {},
        modulos: {},
        canais: {},
        processos: {},
        colaboradores: {},
        ligacoes: { sim: 0, nao: 0 },
        clientesUnicos: new Set(),
        timeline: {}
    };

    data.forEach(row => {
        const status = normalizeStatus(row._status);
        if (status) summary.status[status] = (summary.status[status] || 0) + 1;

        const modulo = normalizeGeneric(row._modulo);
        if (modulo) summary.modulos[modulo] = (summary.modulos[modulo] || 0) + 1;

        const canal = normalizeGeneric(row._canal);
        if (canal) summary.canais[canal] = (summary.canais[canal] || 0) + 1;

        const processo = normalizeGeneric(row._processo);
        if (processo) summary.processos[processo] = (summary.processos[processo] || 0) + 1;

        const colaborador = normalizeColaborador(row._colaborador);
        if (colaborador) summary.colaboradores[colaborador] = (summary.colaboradores[colaborador] || 0) + 1;

        const ligacao = row._ligacao.toLowerCase().trim();
        if (ligacao === 'sim' || ligacao === 's' || ligacao === 'yes' || ligacao === '1') {
            summary.ligacoes.sim++;
        } else if (ligacao) {
            summary.ligacoes.nao++;
        }

        if (row._razaoSocial) summary.clientesUnicos.add(row._razaoSocial.toLowerCase().trim());

        // Timeline: se filtrando 1 mês, mostrar por dia; se todos, agrupar por mês
        if (currentMonth === 'todos') {
            if (row._mesNum) {
                const mesKey = MESES_ABREV[row._mesNum - 1];
                summary.timeline[mesKey] = (summary.timeline[mesKey] || 0) + 1;
            }
        } else {
            const dia = row._diaMes.trim();
            if (dia) {
                const parts = dia.split('/');
                const dayKey = parts[0] ? parts[0].padStart(2, '0') : dia;
                summary.timeline[dayKey] = (summary.timeline[dayKey] || 0) + 1;
            }
        }
    });

    return summary;
}

// ===================================
// ATUALIZAR KPIs
// ===================================
function updateKPIs(summary) {
    setKPI('kpiTotal', summary.total.toLocaleString('pt-BR'));

    const resolvedKeys = Object.keys(summary.status).filter(s =>
        ['Resolvido', 'Concluído', 'Finalizado'].includes(s)
    );
    const resolvidos = resolvedKeys.reduce((sum, k) => sum + summary.status[k], 0);
    const pctR = summary.total > 0 ? ((resolvidos / summary.total) * 100).toFixed(1) : 0;
    setKPI('kpiResolvido', resolvidos.toLocaleString('pt-BR'), `Resolvidos (${pctR}%)`);

    const pendingKeys = Object.keys(summary.status).filter(s =>
        ['Pendente', 'Em Andamento'].includes(s)
    );
    const pendentes = pendingKeys.reduce((sum, k) => sum + summary.status[k], 0);
    const pctP = summary.total > 0 ? ((pendentes / summary.total) * 100).toFixed(1) : 0;
    setKPI('kpiPendente', pendentes.toLocaleString('pt-BR'), `Pendentes (${pctP}%)`);

    setKPI('kpiClientes', summary.clientesUnicos.size.toLocaleString('pt-BR'));
    setKPI('kpiLigacoes', summary.ligacoes.sim.toLocaleString('pt-BR'));
}

function setKPI(id, value, labelOverride) {
    const card = document.getElementById(id);
    if (!card) return;
    const valueEl = card.querySelector('.kpi-value');
    const labelEl = card.querySelector('.kpi-label');
    if (valueEl) valueEl.textContent = value;
    if (labelOverride && labelEl) labelEl.textContent = labelOverride;
}

// ===================================
// GRÁFICOS
// ===================================
function getContrastColor(bgColor) {
    const lightColors = ['#f59e0b', '#fbbf24', '#fcd34d', '#fef3c7'];
    if (lightColors.includes(bgColor)) return '#1a1a2e';
    return '#ffffff';
}

function getDatalabelColor(context) {
    const bg = Array.isArray(context.dataset.backgroundColor)
        ? context.dataset.backgroundColor[context.dataIndex]
        : context.dataset.backgroundColor;
    return getContrastColor(bg);
}

// Limitar categorias: top N + agrupar resto como "Outros"
function limitCategories(obj, maxItems) {
    const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    if (entries.length <= maxItems) {
        return { labels: entries.map(e => e[0]), values: entries.map(e => e[1]) };
    }

    const top = entries.slice(0, maxItems);
    const others = entries.slice(maxItems);
    const othersTotal = others.reduce((sum, e) => sum + e[1], 0);

    if (othersTotal > 0) {
        top.push(['Outros', othersTotal]);
    }

    return { labels: top.map(e => e[0]), values: top.map(e => e[1]) };
}

function updateCharts(summary) {
    createStatusChart(summary.status);
    createModuloChart(summary.modulos);
    createCanalChart(summary.canais);
    createColaboradorChart(summary.colaboradores);
    createProcessoChart(summary.processos);
    createTimelineChart(summary.timeline);
}

function createDoughnutChart(canvasId, labels, data, colors) {
    if (suporteCharts[canvasId]) suporteCharts[canvasId].destroy();
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    suporteCharts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: 'rgba(15, 20, 25, 0.8)',
                hoverBorderColor: '#ffffff',
                hoverBorderWidth: 2,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '55%',
            animation: { duration: 1200, easing: 'easeOutQuart' },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: suporteColors.textSecondary,
                        padding: 10,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                            return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                        }
                    }
                },
                datalabels: {
                    display: function(ctx) {
                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        return total > 0 && (ctx.dataset.data[ctx.dataIndex] / total) > 0.04;
                    },
                    color: getDatalabelColor,
                    font: { weight: 'bold', size: 12 },
                    formatter: function(value, ctx) {
                        const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        const pct = total > 0 ? ((value / total) * 100).toFixed(0) : 0;
                        return `${value}\n(${pct}%)`;
                    },
                    textAlign: 'center'
                }
            }
        }
    });
}

function createBarChart(canvasId, labels, data, colors, horizontal) {
    if (suporteCharts[canvasId]) suporteCharts[canvasId].destroy();
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const barCount = labels.length;
    const thickness = horizontal ? Math.max(16, Math.min(28, 200 / barCount)) : undefined;

    suporteCharts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, labels.length),
                borderRadius: 6,
                borderSkipped: false,
                barThickness: thickness,
                maxBarThickness: 35
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: horizontal ? 'y' : 'x',
            animation: { duration: 1200, easing: 'easeOutQuart' },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: suporteColors.textSecondary, font: { size: 11 } },
                    beginAtZero: true
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: suporteColors.textSecondary, font: { size: 11 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return ` ${ctx.parsed[horizontal ? 'x' : 'y']} chamados`;
                        }
                    }
                },
                datalabels: {
                    display: function(ctx) { return ctx.dataset.data[ctx.dataIndex] > 0; },
                    color: '#ffffff',
                    anchor: horizontal ? 'end' : 'end',
                    align: horizontal ? 'right' : 'top',
                    offset: 4,
                    font: { weight: 'bold', size: 11 }
                }
            }
        }
    });
}

function createStatusChart(statusData) {
    const limited = limitCategories(statusData, 6);
    const colors = limited.labels.map(label => {
        const l = label.toLowerCase();
        if (l === 'resolvido' || l === 'finalizado') return suporteColors.success;
        if (l === 'concluído') return suporteColors.accentLight;
        if (l === 'em andamento') return suporteColors.info;
        if (l === 'pendente') return suporteColors.warning;
        if (l === 'cancelado') return suporteColors.danger;
        if (l === 'outros') return suporteColors.slate;
        return suporteColors.purple;
    });
    createDoughnutChart('chartStatus', limited.labels, limited.values, colors);
}

function createModuloChart(moduloData) {
    const limited = limitCategories(moduloData, 8);
    const colors = limited.labels.map((l, i) =>
        l === 'Outros' ? suporteColors.slate : chartPalette[i % chartPalette.length]
    );
    createDoughnutChart('chartModulo', limited.labels, limited.values, colors);
}

function createCanalChart(canalData) {
    const limited = limitCategories(canalData, 6);
    const canalColors = [suporteColors.info, suporteColors.accent, suporteColors.warning, suporteColors.purple, suporteColors.pink, suporteColors.cyan, suporteColors.slate];
    createDoughnutChart('chartCanal', limited.labels, limited.values, canalColors);
}

function createColaboradorChart(colaboradorData) {
    const limited = limitCategories(colaboradorData, 8);
    const colors = limited.labels.map((l, i) =>
        l === 'Outros' ? suporteColors.slate : chartPalette[i % chartPalette.length]
    );
    createBarChart('chartColaborador', limited.labels, limited.values, colors, true);
}

function createProcessoChart(processoData) {
    const limited = limitCategories(processoData, 8);
    const colors = limited.labels.map((l, i) =>
        l === 'Outros' ? suporteColors.slate : chartPalette[i % chartPalette.length]
    );
    createBarChart('chartProcesso', limited.labels, limited.values, colors, true);
}

function createTimelineChart(timelineData) {
    if (suporteCharts['chartTimeline']) suporteCharts['chartTimeline'].destroy();

    let entries;
    if (currentMonth === 'todos') {
        // Ordenar por mês
        const monthOrder = MESES_ABREV;
        entries = Object.entries(timelineData).sort((a, b) =>
            monthOrder.indexOf(a[0]) - monthOrder.indexOf(b[0])
        );
    } else {
        // Ordenar por dia numérico
        entries = Object.entries(timelineData).sort((a, b) =>
            parseInt(a[0]) - parseInt(b[0])
        );
        // Formatar labels com "Dia X"
        entries = entries.map(([day, count]) => [`Dia ${parseInt(day)}`, count]);
    }

    const labels = entries.map(e => e[0]);
    const data = entries.map(e => e[1]);

    const ctx = document.getElementById('chartTimeline');
    if (!ctx) return;

    // Gradiente de cores por mês
    const colors = labels.map((_, i) => {
        const t = labels.length > 1 ? i / (labels.length - 1) : 0;
        return `rgba(53, 204, 163, ${0.4 + t * 0.6})`;
    });

    suporteCharts['chartTimeline'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: suporteColors.accent,
                borderWidth: 1,
                borderRadius: 6,
                maxBarThickness: 50
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            animation: { duration: 1200, easing: 'easeOutQuart' },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: suporteColors.textSecondary, font: { size: 12, weight: '500' } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: suporteColors.textSecondary },
                    beginAtZero: true
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: (ctx) => ` ${ctx.parsed.y} chamados` }
                },
                datalabels: {
                    display: (ctx) => ctx.dataset.data[ctx.dataIndex] > 0,
                    color: '#ffffff',
                    anchor: 'end',
                    align: 'top',
                    offset: 2,
                    font: { weight: 'bold', size: 12 }
                }
            }
        }
    });
}

// ===================================
// TABELA
// ===================================
function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Nenhum registro encontrado</td></tr>';
        document.getElementById('tableCount').textContent = '0 registros';
        return;
    }

    // Mostrar últimos 200 para performance
    const displayed = data.slice(0, 200);

    tbody.innerHTML = displayed.map(row => `
        <tr>
            <td title="${escapeHTML(row._razaoSocial)}">${escapeHTML(row._razaoSocial)}</td>
            <td>${escapeHTML(row._modulo)}</td>
            <td>${escapeHTML(row._processo)}</td>
            <td>${escapeHTML(row._canal)}</td>
            <td><span class="badge-ligacao ${row._ligacao.toLowerCase().trim() === 'sim' ? 'badge-sim' : 'badge-nao'}">${escapeHTML(row._ligacao)}</span></td>
            <td><span class="badge-status ${getStatusClass(row._status)}">${escapeHTML(row._status)}</span></td>
            <td>${escapeHTML(row._diaMes)}</td>
            <td>${escapeHTML(row._colaborador)}</td>
        </tr>
    `).join('');

    const suffix = data.length > 200 ? ` (mostrando 200 de ${data.length})` : '';
    document.getElementById('tableCount').textContent = `${data.length} registros${suffix}`;
}

function filterTable(query) {
    const q = query.toLowerCase().trim();
    const rows = document.querySelectorAll('#tableBody tr');
    let visible = 0;
    rows.forEach(row => {
        const match = !q || row.textContent.toLowerCase().includes(q);
        row.style.display = match ? '' : 'none';
        if (match) visible++;
    });
    document.getElementById('tableCount').textContent = `${visible} registros`;
}

function getStatusClass(status) {
    const s = status.toLowerCase();
    if (s.includes('resolv') || s.includes('conclu') || s.includes('finaliz') || s.includes('atendido')) return 'status-resolvido';
    if (s.includes('pend') || s.includes('aguard') || s.includes('aberto')) return 'status-pendente';
    if (s.includes('cancel') || s.includes('escal') || s.includes('critic')) return 'status-critico';
    if (s.includes('andamento') || s.includes('progres') || s.includes('tratativa')) return 'status-andamento';
    return 'status-outro';
}

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===================================
// UI
// ===================================
function updateSubtitle(text) {
    const el = document.getElementById('headerSubtitle');
    if (el) el.textContent = text;
}

function refreshData() {
    const btn = document.querySelector('.btn-refresh');
    if (btn) {
        btn.style.animation = 'spin 1s linear';
        setTimeout(() => btn.style.animation = '', 1000);
    }
    fetchData();
}

// ===================================
// SIDEBAR
// ===================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
    document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const sidebar = document.getElementById('sidebar');
        if (sidebar.classList.contains('active')) toggleSidebar();
    }
});
