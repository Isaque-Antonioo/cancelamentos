/* ===================================
   Bugs - Dashboard
   Firebase Realtime Database
   =================================== */

const BUGS_REFRESH = 5 * 60 * 1000;

const bugsColors = {
    accent: '#f97316', accentLight: '#fb923c',
    danger: '#ef4444', dangerLight: '#fca5a5',
    warning: '#f59e0b', warningLight: '#fcd34d',
    success: '#22c55e', successLight: '#86efac',
    info: '#3b82f6', infoLight: '#93c5fd',
    purple: '#a855f7', purpleLight: '#c084fc',
    cyan: '#06b6d4', cyanLight: '#67e8f9',
    teal: '#14b8a6', slate: '#64748b',
    dark: '#1e293b', textPrimary: '#f8fafc', textSecondary: '#94a3b8'
};

const PRIORITY_ORDER = { 'p0': 0, 'p1': 1, 'p2': 2, 'p3': 3 };

const PRIORITY_COLORS = {
    'P0 - Imediato': '#ef4444',
    'P1 - Crítico':  '#f97316',
    'P2 - Alto':     '#f59e0b',
    'P3 - Médio':    '#3b82f6'
};

const STATUS_COLORS = {
    'Resolvido':           '#22c55e',
    'Solução Confirmada':  '#06b6d4',
    'Registrado':          '#f97316'
};

const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

let allBugsData = [];
let filteredBugsData = [];
let bugsCharts = {};
let currentBugsMonth = 'todos';
let bugsListenerActive = false;
let lastBugsChecksum = '';

// Table state
let bugsTableData = [];
let bugsSortCol = null;
let bugsSortDir = 'desc';
let bugsFilters = { status: '', prioridade: '', modulo: '', responsavel: '', search: '' };
let bugsSearchTimer = null;

// ===================================
// INIT
// ===================================
document.addEventListener('DOMContentLoaded', function () {
    setTimeout(() => document.getElementById('sidebar').classList.add('ready'), 50);

    Chart.register(ChartDataLabels);
    Chart.defaults.font.family = "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif";
    Chart.defaults.color = bugsColors.textSecondary;
    Chart.defaults.plugins.tooltip.backgroundColor = bugsColors.dark;
    Chart.defaults.plugins.tooltip.titleColor = bugsColors.textPrimary;
    Chart.defaults.plugins.tooltip.bodyColor = bugsColors.textSecondary;
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(249,115,22,0.3)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.padding = 10;

    startBugsFirebaseListener();
});

// ===================================
// FIREBASE LISTENER
// ===================================
function startBugsFirebaseListener() {
    if (bugsListenerActive) return;
    bugsListenerActive = true;

    const init = () => {
        if (typeof database === 'undefined' || !database) { setTimeout(init, 200); return; }

        database.ref('bugs_live').on('value', snapshot => {
            const data = snapshot.val();
            if (!data || !data.rows) {
                updateBugsSubtitle('Aguardando dados do Apps Script (aba "Bugs")...');
                return;
            }

            const checksum = `${data.totalRows || data.total}-${data.updatedAt}`;
            if (checksum === lastBugsChecksum) return;
            lastBugsChecksum = checksum;

            allBugsData = convertBugsData(data);
            buildBugsMonthFilter(allBugsData);
            applyBugsMonthFilter(currentBugsMonth);

            const iso = data.updatedISO ? new Date(data.updatedISO).toLocaleString('pt-BR') : '';
            updateBugsSubtitle(`${allBugsData.length} bugs · Atualizado: ${iso}`);
        });
    };

    if (window.firebaseReady) {
        init();
    } else {
        window.addEventListener('firebaseReady', init);
    }
}

// ===================================
// DATA CONVERSION
// ===================================

// Normaliza string removendo acentos e colocando em minúsculas para comparação
function normStr(s) {
    if (!s) return '';
    let r = '';
    const nfd = s.normalize('NFD');
    for (let i = 0; i < nfd.length; i++) {
        const c = nfd.charCodeAt(i);
        if (c < 0x0300 || c > 0x036F) r += nfd[i];
    }
    return r.toLowerCase().trim();
}

// Busca um campo no objeto row por correspondência parcial sem acento
function getField(row, ...candidates) {
    const keys = Object.keys(row);
    for (const candidate of candidates) {
        const nc = normStr(candidate);
        for (const key of keys) {
            const nk = normStr(key);
            if (nk === nc || nk.startsWith(nc) || nc.startsWith(nk)) return (row[key] || '').toString().trim();
        }
    }
    return '';
}

function convertBugsData(data) {
    if (!data || !data.rows || !data.headers) return [];
    const { headers, rows } = data;
    const result = [];

    for (const rowArr of rows) {
        const row = {};
        headers.forEach((h, i) => {
            row[h] = (rowArr[i] !== undefined && rowArr[i] !== null) ? String(rowArr[i]) : '';
        });

        // Busca flexível: aceita nomes originais da planilha ou nomes normalizados
        row._chave          = getField(row, 'Chave', 'chave', 'key');
        row._resumo         = getField(row, 'Resumo', 'resumo', 'summary', 'titulo');
        row._status         = getField(row, 'Status 1', 'Status', 'status');
        row._prioridade     = getField(row, 'Prioridade', 'prioridade', 'priority');
        row._responsavel    = getField(row, 'Responsável', 'Responsavel', 'responsavel', 'assignee');
        row._criado         = getField(row, 'Criado', 'criado', 'created', 'data');
        row._modulo         = getField(row, 'Módulos 1', 'Modulos 1', 'Módulo', 'Modulo', 'modulo', 'module');
        row._funcionalidade = getField(row, 'Funcionalidades', 'Funcionalidade', 'funcionalidade', 'feature');
        row._cliente        = getField(row, 'Razão Social 2', 'Razao Social 2', 'Razão Social', 'Razao Social', 'cliente', 'empresa');
        row._relator        = getField(row, 'Relator da Situação 3', 'Relator', 'relator', 'reporter');

        const parsed = parseBugDate(row._criado);
        if (parsed) {
            row._year   = parsed.year;
            row._month  = parsed.month;
            row._day    = parsed.day;
            row._mesAno = `${parsed.year}-${String(parsed.month).padStart(2, '0')}`;
        } else {
            row._year = row._month = row._day = null;
            row._mesAno = null;
        }

        row._isResolved = isResolvedStatus(row._status);
        row._isCritico  = isCriticoPriority(row._prioridade);
        row._searchText = [row._chave, row._resumo, row._status, row._prioridade, row._responsavel, row._modulo, row._cliente].join(' ').toLowerCase();

        if (row._chave || row._resumo || row._status) result.push(row);
    }

    return result;
}

function parseBugDate(criado) {
    if (!criado) return null;
    // ISO format: YYYY-MM-DD
    const iso = criado.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return { year: parseInt(iso[1]), month: parseInt(iso[2]), day: parseInt(iso[3]) };
    // BR format: DD/MM/YYYY or DD/MM/YY
    const br = criado.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (br) {
        let y = parseInt(br[3]);
        if (y < 100) y += 2000;
        return { year: y, month: parseInt(br[2]), day: parseInt(br[1]) };
    }
    return null;
}

function isResolvedStatus(status) {
    if (!status) return false;
    const s = status.toLowerCase();
    return s.includes('resolv') || s.includes('solução') || s.includes('solucao') || s.includes('confirmad') || s.includes('finaliz') || s.includes('conclu');
}

function isCriticoPriority(prio) {
    if (!prio) return false;
    const p = prio.toLowerCase();
    return p.startsWith('p0') || p.startsWith('p1');
}

// ===================================
// MONTH FILTER
// ===================================
function buildBugsMonthFilter(data) {
    const sel = document.getElementById('bugsMonthFilter');
    if (!sel) return;

    const months = new Set();
    data.forEach(r => { if (r._mesAno) months.add(r._mesAno); });

    const sorted = Array.from(months).sort().reverse();
    const current = sel.value || 'todos';

    sel.innerHTML = '<option value="todos">Todos os meses</option>';
    sorted.forEach(key => {
        const [y, m] = key.split('-');
        const label = `${MESES_NOMES[parseInt(m) - 1]} ${y}`;
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = label;
        if (key === current) opt.selected = true;
        sel.appendChild(opt);
    });
}

function handleBugsMonthFilter(val) {
    currentBugsMonth = val;
    applyBugsMonthFilter(val);
}

function applyBugsMonthFilter(month) {
    filteredBugsData = month === 'todos'
        ? allBugsData
        : allBugsData.filter(r => r._mesAno === month);

    const summary = buildBugsSummary(filteredBugsData);
    updateBugsKPIs(summary);
    updateBugsCharts(summary);
    buildBugsTableFilters(filteredBugsData);
    applyBugsTableFilters();
}

// ===================================
// SUMMARY
// ===================================
function buildBugsSummary(data) {
    const now = new Date();
    const curMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const summary = {
        total: data.length,
        resolvidos: 0,
        abertos: 0,
        criticos: 0,
        estesMes: 0,
        status: {},
        prioridades: {},
        modulos: {},
        responsaveis: {},
        clientes: {},
        timeline: {}
    };

    data.forEach(row => {
        if (row._isResolved) summary.resolvidos++;
        else summary.abertos++;
        if (row._isCritico) summary.criticos++;
        if (row._mesAno === curMonthKey) summary.estesMes++;

        if (row._status) summary.status[row._status] = (summary.status[row._status] || 0) + 1;
        if (row._prioridade) summary.prioridades[row._prioridade] = (summary.prioridades[row._prioridade] || 0) + 1;
        if (row._modulo) summary.modulos[row._modulo] = (summary.modulos[row._modulo] || 0) + 1;
        if (row._responsavel) summary.responsaveis[row._responsavel] = (summary.responsaveis[row._responsavel] || 0) + 1;
        if (row._cliente) summary.clientes[row._cliente] = (summary.clientes[row._cliente] || 0) + 1;

        // Timeline
        if (currentBugsMonth === 'todos') {
            if (row._mesAno) {
                const [y, m] = row._mesAno.split('-');
                const key = `${MESES_ABREV[parseInt(m) - 1]}/${y.slice(2)}`;
                summary.timeline[key] = (summary.timeline[key] || 0) + 1;
            }
        } else {
            if (row._day) {
                const key = String(row._day).padStart(2, '0');
                summary.timeline[key] = (summary.timeline[key] || 0) + 1;
            }
        }
    });

    return summary;
}

// ===================================
// KPIs
// ===================================
function updateBugsKPIs(summary) {
    setBugsKPI('kpiBugsTotal', summary.total.toLocaleString('pt-BR'), 'Total de Bugs');
    setBugsKPI('kpiBugsResolvidos', summary.resolvidos.toLocaleString('pt-BR'),
        `Resolvidos (${summary.total > 0 ? ((summary.resolvidos / summary.total) * 100).toFixed(0) : 0}%)`);
    setBugsKPI('kpiBugsAbertos', summary.abertos.toLocaleString('pt-BR'),
        `Em Aberto (${summary.total > 0 ? ((summary.abertos / summary.total) * 100).toFixed(0) : 0}%)`);
    setBugsKPI('kpiBugsCriticos', summary.criticos.toLocaleString('pt-BR'), 'P0 + P1 Críticos');
    setBugsKPI('kpiBugsMes', summary.estesMes.toLocaleString('pt-BR'), 'Bugs Este Mês');
}

function setBugsKPI(id, value, labelOverride) {
    const card = document.getElementById(id);
    if (!card) return;
    const v = card.querySelector('.kpi-value');
    const l = card.querySelector('.kpi-label');
    if (v) v.textContent = value;
    if (labelOverride && l) l.textContent = labelOverride;
}

// ===================================
// CHARTS
// ===================================
function updateBugsCharts(summary) {
    createBugsTimelineChart(summary.timeline);
    createBugsStatusChart(summary.status);
    createBugsPrioridadeChart(summary.prioridades);
    createBugsModuloChart(summary.modulos);
    createBugsResponsavelChart(summary.responsaveis);
    createBugsTopClientesChart(summary.clientes);
}

function destroyBugsChart(id) {
    if (bugsCharts[id]) { try { bugsCharts[id].destroy(); } catch (e) {} delete bugsCharts[id]; }
}

// Timeline
function createBugsTimelineChart(timelineData) {
    destroyBugsChart('chartBugsTimeline');
    const ctx = document.getElementById('chartBugsTimeline');
    if (!ctx) return;

    let entries;
    if (currentBugsMonth === 'todos') {
        entries = Object.entries(timelineData).sort((a, b) => {
            const [ma, ya] = a[0].split('/');
            const [mb, yb] = b[0].split('/');
            const da = new Date(`20${ya}`, MESES_ABREV.indexOf(ma));
            const db = new Date(`20${yb}`, MESES_ABREV.indexOf(mb));
            return da - db;
        });
    } else {
        entries = Object.entries(timelineData).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    }

    const labels = entries.map(e => e[0]);
    const values = entries.map(e => e[1]);
    const maxVal = Math.max(...values, 1);

    bugsCharts['chartBugsTimeline'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Bugs',
                data: values,
                backgroundColor: values.map((v, i) => i === values.length - 1 ? 'rgba(249,115,22,0.85)' : 'rgba(249,115,22,0.45)'),
                borderColor: '#f97316',
                borderWidth: 1,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end', align: 'top',
                    color: '#e2e8f0',
                    font: { size: 11, weight: 'bold' },
                    formatter: v => v > 0 ? v : ''
                }
            },
            scales: {
                x: { grid: { display: false }, border: { display: false }, ticks: { color: bugsColors.textSecondary, font: { size: 11 } } },
                y: {
                    beginAtZero: true,
                    max: Math.ceil(maxVal * 1.2),
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    border: { display: false },
                    ticks: { color: bugsColors.textSecondary, font: { size: 11 }, maxTicksLimit: 6, stepSize: 1 }
                }
            },
            layout: { padding: { top: 20 } }
        }
    });
}

// Status doughnut
function createBugsStatusChart(statusData) {
    destroyBugsChart('chartBugsStatus');
    const ctx = document.getElementById('chartBugsStatus');
    if (!ctx) return;

    const entries = Object.entries(statusData).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return;

    const labels = entries.map(e => e[0]);
    const values = entries.map(e => e[1]);
    const total = values.reduce((a, b) => a + b, 0);
    const colors = labels.map((l, i) => STATUS_COLORS[l] || [bugsColors.accent, bugsColors.info, bugsColors.purple, bugsColors.teal][i % 4]);

    bugsCharts['chartBugsStatus'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: values, backgroundColor: colors, borderWidth: 3, borderColor: 'rgba(10,15,20,0.8)', hoverOffset: 10, spacing: 2 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 14, font: { size: 12 }, color: '#e2e8f0', usePointStyle: true,
                        generateLabels: chart => chart.data.labels.map((lbl, i) => ({
                            text: `${lbl}: ${chart.data.datasets[0].data[i]}`,
                            fillStyle: chart.data.datasets[0].backgroundColor[i],
                            strokeStyle: chart.data.datasets[0].backgroundColor[i],
                            pointStyle: 'circle', hidden: false, index: i
                        }))
                    }
                },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} (${total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0}%)` } },
                datalabels: { color: '#fff', font: { weight: 'bold', size: 12 }, formatter: (v) => total > 0 && (v / total) * 100 >= 5 ? `${((v / total) * 100).toFixed(0)}%` : '' }
            }
        }
    });
}

// Prioridade doughnut
function createBugsPrioridadeChart(prioData) {
    destroyBugsChart('chartBugsPrioridade');
    const ctx = document.getElementById('chartBugsPrioridade');
    if (!ctx) return;

    const order = ['P0 - Imediato', 'P1 - Crítico', 'P2 - Alto', 'P3 - Médio'];
    const entries = Object.entries(prioData).sort((a, b) => {
        const ai = order.indexOf(a[0]), bi = order.indexOf(b[0]);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    if (!entries.length) return;

    const labels = entries.map(e => e[0]);
    const values = entries.map(e => e[1]);
    const total = values.reduce((a, b) => a + b, 0);
    const colors = labels.map(l => PRIORITY_COLORS[l] || bugsColors.slate);

    bugsCharts['chartBugsPrioridade'] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: values, backgroundColor: colors, borderWidth: 3, borderColor: 'rgba(10,15,20,0.8)', hoverOffset: 10, spacing: 2 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { padding: 14, font: { size: 12 }, color: '#e2e8f0', usePointStyle: true,
                        generateLabels: chart => chart.data.labels.map((lbl, i) => ({
                            text: `${lbl}: ${chart.data.datasets[0].data[i]}`,
                            fillStyle: chart.data.datasets[0].backgroundColor[i],
                            strokeStyle: chart.data.datasets[0].backgroundColor[i],
                            pointStyle: 'circle', hidden: false, index: i
                        }))
                    }
                },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} (${total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0}%)` } },
                datalabels: { color: '#fff', font: { weight: 'bold', size: 12 }, formatter: v => total > 0 && (v / total) * 100 >= 5 ? `${((v / total) * 100).toFixed(0)}%` : '' }
            }
        }
    });
}

// Módulo horizontal bar
function createBugsModuloChart(moduloData) {
    destroyBugsChart('chartBugsModulo');
    const ctx = document.getElementById('chartBugsModulo');
    if (!ctx) return;

    const entries = Object.entries(moduloData).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!entries.length) return;

    const labels = entries.map(e => e[0]);
    const values = entries.map(e => e[1]);
    const maxVal = values[0] || 1;

    bugsCharts['chartBugsModulo'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: labels.map((_, i) => `rgba(249,115,22,${1 - (i / labels.length) * 0.5})`),
                borderRadius: 6, borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} bug${ctx.parsed.x !== 1 ? 's' : ''}` } },
                datalabels: { anchor: 'end', align: 'end', color: '#e2e8f0', font: { weight: 'bold', size: 11 }, formatter: v => v, clip: false }
            },
            scales: {
                x: { display: false, max: maxVal * 1.2 },
                y: {
                    grid: { display: false }, border: { display: false },
                    ticks: { color: '#e2e8f0', font: { size: 11 }, callback(v, i) { const l = this.getLabelForValue(i); return l.length > 24 ? l.substring(0, 24) + '…' : l; } }
                }
            },
            layout: { padding: { right: 32 } }
        }
    });
}

// Responsável horizontal bar
function createBugsResponsavelChart(respData) {
    destroyBugsChart('chartBugsResponsavel');
    const ctx = document.getElementById('chartBugsResponsavel');
    if (!ctx) return;

    const entries = Object.entries(respData).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!entries.length) return;

    const labels = entries.map(e => e[0]);
    const values = entries.map(e => e[1]);
    const maxVal = values[0] || 1;
    const palette = [bugsColors.info, bugsColors.teal, bugsColors.purple, bugsColors.cyan, bugsColors.success, bugsColors.warning, bugsColors.accent, bugsColors.danger];

    bugsCharts['chartBugsResponsavel'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: labels.map((_, i) => palette[i % palette.length] + 'aa'),
                borderColor: labels.map((_, i) => palette[i % palette.length]),
                borderWidth: 1,
                borderRadius: 6, borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} bug${ctx.parsed.x !== 1 ? 's' : ''}` } },
                datalabels: { anchor: 'end', align: 'end', color: '#e2e8f0', font: { weight: 'bold', size: 11 }, formatter: v => v, clip: false }
            },
            scales: {
                x: { display: false, max: maxVal * 1.2 },
                y: {
                    grid: { display: false }, border: { display: false },
                    ticks: { color: '#e2e8f0', font: { size: 11 }, callback(v, i) { const l = this.getLabelForValue(i); return l.length > 22 ? l.substring(0, 22) + '…' : l; } }
                }
            },
            layout: { padding: { right: 32 } }
        }
    });
}

// Top 10 Clientes
function createBugsTopClientesChart(clientesData) {
    destroyBugsChart('chartBugsClientes');
    const ctx = document.getElementById('chartBugsClientes');
    if (!ctx) return;

    const entries = Object.entries(clientesData).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!entries.length) return;

    const labels = entries.map(e => e[0]);
    const values = entries.map(e => e[1]);
    const maxVal = values[0] || 1;

    bugsCharts['chartBugsClientes'] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: labels.map((_, i) => `rgba(34,197,94,${1 - (i / labels.length) * 0.5})`),
                borderRadius: 6, borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} bug${ctx.parsed.x !== 1 ? 's' : ''}` } },
                datalabels: { anchor: 'end', align: 'end', color: '#e2e8f0', font: { weight: 'bold', size: 11 }, formatter: v => v, clip: false }
            },
            scales: {
                x: { display: false, max: maxVal * 1.2 },
                y: {
                    grid: { display: false }, border: { display: false },
                    ticks: { color: '#e2e8f0', font: { size: 11 }, callback(v, i) { const l = this.getLabelForValue(i); return l.length > 24 ? l.substring(0, 24) + '…' : l; } }
                }
            },
            layout: { padding: { right: 32 } }
        }
    });
}

// ===================================
// TABLE
// ===================================
function buildBugsTableFilters(data) {
    const buildSelect = (id, key) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value || '';
        const vals = [...new Set(data.map(r => r[key]).filter(Boolean))].sort();
        sel.innerHTML = '<option value="">Todos</option>';
        vals.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v; opt.textContent = v;
            if (v === cur) opt.selected = true;
            sel.appendChild(opt);
        });
    };
    buildSelect('bugsFilterStatus', '_status');
    buildSelect('bugsFilterPrioridade', '_prioridade');
    buildSelect('bugsFilterModulo', '_modulo');
    buildSelect('bugsFilterResponsavel', '_responsavel');
}

function applyBugsTableFilters() {
    let data = [...filteredBugsData];

    if (bugsFilters.status)      data = data.filter(r => r._status === bugsFilters.status);
    if (bugsFilters.prioridade)  data = data.filter(r => r._prioridade === bugsFilters.prioridade);
    if (bugsFilters.modulo)      data = data.filter(r => r._modulo === bugsFilters.modulo);
    if (bugsFilters.responsavel) data = data.filter(r => r._responsavel === bugsFilters.responsavel);
    if (bugsFilters.search) {
        const q = bugsFilters.search.toLowerCase();
        data = data.filter(r => r._searchText.includes(q));
    }

    // Sort
    if (bugsSortCol) {
        data.sort((a, b) => {
            const av = (a[bugsSortCol] || '').toLowerCase();
            const bv = (b[bugsSortCol] || '').toLowerCase();
            return bugsSortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });
    } else {
        // Default: most recent first
        data.sort((a, b) => {
            if (a._year !== b._year) return (b._year || 0) - (a._year || 0);
            if (a._month !== b._month) return (b._month || 0) - (a._month || 0);
            return (b._day || 0) - (a._day || 0);
        });
    }

    bugsTableData = data;
    renderBugsTable(data);
}

function handleBugsFilter(field, value) {
    bugsFilters[field] = value;
    applyBugsTableFilters();
}

function debounceBugsSearch() {
    clearTimeout(bugsSearchTimer);
    bugsSearchTimer = setTimeout(() => {
        bugsFilters.search = document.getElementById('bugsSearch').value.trim();
        applyBugsTableFilters();
    }, 250);
}

function clearBugsFilters() {
    bugsFilters = { status: '', prioridade: '', modulo: '', responsavel: '', search: '' };
    ['bugsFilterStatus', 'bugsFilterPrioridade', 'bugsFilterModulo', 'bugsFilterResponsavel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const s = document.getElementById('bugsSearch');
    if (s) s.value = '';
    applyBugsTableFilters();
}

function sortBugsTable(col) {
    if (bugsSortCol === col) {
        bugsSortDir = bugsSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        bugsSortCol = col;
        bugsSortDir = 'asc';
    }
    applyBugsTableFilters();
}

function renderBugsTable(data) {
    const tbody = document.getElementById('bugsTableBody');
    const countEl = document.getElementById('bugsTableCount');
    if (!tbody) return;

    if (countEl) countEl.textContent = `${data.length} bug${data.length !== 1 ? 's' : ''}`;

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Nenhum bug encontrado com os filtros aplicados.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(row => `
        <tr>
            <td class="td-chave">${escHtml(row._chave)}</td>
            <td class="td-resumo" title="${escHtml(row._resumo)}">${escHtml(row._resumo)}</td>
            <td>${statusBadge(row._status)}</td>
            <td>${prioridadeBadge(row._prioridade)}</td>
            <td>${escHtml(row._modulo)}</td>
            <td>${escHtml(row._responsavel)}</td>
            <td style="white-space:nowrap;color:#94a3b8;font-size:0.82em">${formatBugDate(row._criado)}</td>
            <td class="td-cliente" title="${escHtml(row._cliente)}">${escHtml(row._cliente)}</td>
        </tr>
    `).join('');
}

function statusBadge(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    let cls = 'badge-status-outro';
    if (s.includes('resolv') && !s.includes('solução') && !s.includes('solucao') && !s.includes('confirmad')) cls = 'badge-resolvido';
    else if (s.includes('solução') || s.includes('solucao') || s.includes('confirmad')) cls = 'badge-solucao';
    else if (s.includes('registr') || s.includes('aberto') || s.includes('open')) cls = 'badge-registrado';
    return `<span class="badge-status ${cls}">${escHtml(status)}</span>`;
}

function prioridadeBadge(prio) {
    if (!prio) return '';
    const p = prio.toLowerCase();
    let cls = 'badge-p-outro';
    if (p.startsWith('p0')) cls = 'badge-p0';
    else if (p.startsWith('p1')) cls = 'badge-p1';
    else if (p.startsWith('p2')) cls = 'badge-p2';
    else if (p.startsWith('p3')) cls = 'badge-p3';
    return `<span class="badge-prioridade ${cls}">${escHtml(prio)}</span>`;
}

function formatBugDate(criado) {
    if (!criado) return '-';
    const p = parseBugDate(criado);
    if (!p) return criado;
    return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year}`;
}

function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===================================
// HELPERS
// ===================================
function updateBugsSubtitle(text) {
    const el = document.getElementById('bugsHeaderSubtitle');
    if (el) el.textContent = text;
}
