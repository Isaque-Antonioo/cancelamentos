/* ===================================
   Bugs - Dashboard
   Firebase Realtime Database
   =================================== */

const BUGS_REFRESH = 5 * 60 * 1000;

// Paleta Hubstrom
const bugsColors = {
    accent:       '#FF7E20',  // Orange Light 600
    accentLight:  '#FABB8D',  // Orange Light 400
    danger:       '#E05D5D',  // Red Dark 500
    dangerLight:  '#F3A1A1',  // Red Dark 700
    warning:      '#E8BB34',  // Yellow Light 600
    warningLight: '#F0DC9A',  // Yellow Dark 800
    success:      '#35CCA3',  // Brand Green 600
    successLight: '#94DBC6',  // Green Dark 900
    info:         '#0DABCE',  // Blue Light 600
    infoLight:    '#8BDAEB',  // Blue Dark 800
    blue2:        '#196A84',  // Blue Dark 400
    green2:       '#41B798',  // Green Dark 600
    green3:       '#2FB490',  // Brand Green 700
    yellow2:      '#C19512',  // Yellow Light 800
    slate:        '#6B7485',  // Dark 400
    dark:         '#20242D',  // Dark 100
    dark2:        '#2B313C',  // Dark 200
    textPrimary:  '#E7E7E7',  // Dark 800
    textSecondary:'#8C95A3'   // Dark 500
};

// Paleta de séries para gráficos (ordem de preferência visual)
const bugsPalette = [
    '#35CCA3',  // Brand Green 600
    '#0DABCE',  // Blue 600
    '#FF7E20',  // Orange 600
    '#E8BB34',  // Yellow 600
    '#196A84',  // Blue Dark 400
    '#41B798',  // Green Dark 600
    '#1696B3',  // Blue Dark 600
    '#C19512',  // Yellow 800
    '#2FB490',  // Green 700
    '#5FD3EC',  // Blue Light 400
    '#FABB8D',  // Orange 400
    '#94DBC6',  // Green Dark 900
    '#8BDAEB',  // Blue Dark 800
    '#F0DC9A',  // Yellow Dark 800
    '#D1661C',  // Orange Dark 600
];

const PRIORITY_ORDER = { 'p0': 0, 'p1': 1, 'p2': 2, 'p3': 3 };

const PRIORITY_COLORS = {
    'P0 - Imediato': '#E05D5D',  // Red Dark 500
    'P1 - Crítico':  '#FF7E20',  // Orange 600
    'P2 - Alto':     '#E8BB34',  // Yellow 600
    'P3 - Médio':    '#0DABCE'   // Blue 600
};

// Mapeamento por palavra-chave normalizada (cobre variações da planilha)
const STATUS_COLOR_MAP = [
    { keys: ['solucao confirmada', 'solucao', 'confirmad', 'resolvido', 'solucionad', 'conclu', 'finaliz'], color: '#35CCA3' }, // Brand Green
    { keys: ['registrado', 'aberto', 'open', 'novo', 'new'],                                                  color: '#FF7E20' }, // Orange
    { keys: ['problemas no radar', 'problema', 'radar'],                                                       color: '#E8BB34' }, // Yellow
    { keys: ['reportado', 'report'],                                                                            color: '#0DABCE' }, // Blue
    { keys: ['em desenvolvimento', 'desenvolvimento', 'dev', 'andamento', 'progresso'],                        color: '#7C65C0' }, // Purple
    { keys: ['dispensado', 'dispens', 'descartado', 'cancel'],                                                 color: '#6B7485' }, // Slate
];

function getStatusColor(label) {
    const n = normStr(label);
    for (const entry of STATUS_COLOR_MAP) {
        if (entry.keys.some(k => n.includes(k))) return entry.color;
    }
    return null;
}

function getPriorityColor(label) {
    const n = normStr(label);
    if (n.startsWith('p0') || n.includes('imediato')) return '#E05D5D';
    if (n.startsWith('p1') || n.includes('critico'))  return '#FF7E20';
    if (n.startsWith('p2') || n.includes('alto'))     return '#E8BB34';
    if (n.startsWith('p3') || n.includes('medio'))    return '#0DABCE';
    return bugsColors.slate;
}

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
let bugsTablePage = 0;
const BUGS_PAGE_SIZE = 100;

// ===================================
// INIT
// ===================================
document.addEventListener('DOMContentLoaded', function () {
    setTimeout(() => document.getElementById('sidebar').classList.add('ready'), 50);
    startSuporteMiniDashListener();

    Chart.register(ChartDataLabels);
    Chart.defaults.font.family = "'Poppins', 'Segoe UI', -apple-system, sans-serif";
    Chart.defaults.color = bugsColors.textSecondary;
    Chart.defaults.plugins.tooltip.backgroundColor = bugsColors.dark;
    Chart.defaults.plugins.tooltip.titleColor = bugsColors.textPrimary;
    Chart.defaults.plugins.tooltip.bodyColor = bugsColors.textSecondary;
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,126,32,0.3)';
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

// normStr: remove acentos por charCode (sem regex que pode corromper)
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

// Resolve índice do header uma única vez para todo o batch
function resolveHeaderIndex(normHeaders, ...candidates) {
    for (const c of candidates) {
        const nc = normStr(c);
        for (let i = 0; i < normHeaders.length; i++) {
            const nh = normHeaders[i];
            if (nh === nc || nh.startsWith(nc) || nc.startsWith(nh)) return i;
        }
    }
    return -1;
}

function convertBugsData(data) {
    if (!data || !data.rows || !data.headers) return [];
    const { headers, rows } = data;

    // Normaliza headers UMA VEZ — O(headers) em vez de O(rows × fields × headers)
    const normHeaders = headers.map(normStr);

    const iChave  = resolveHeaderIndex(normHeaders, 'chave', 'key');
    const iResumo = resolveHeaderIndex(normHeaders, 'resumo', 'summary', 'titulo');
    const iStatus = resolveHeaderIndex(normHeaders, 'status 1', 'status');
    const iPrio   = resolveHeaderIndex(normHeaders, 'prioridade', 'priority');
    const iResp   = resolveHeaderIndex(normHeaders, 'responsavel', 'assignee');
    const iCriado = resolveHeaderIndex(normHeaders, 'criado', 'created', 'data');
    const iModulo = resolveHeaderIndex(normHeaders, 'modulos 1', 'modulo', 'module');
    const iFunc   = resolveHeaderIndex(normHeaders, 'funcionalidades', 'funcionalidade', 'feature');
    const iCliente= resolveHeaderIndex(normHeaders, 'razao social 2', 'razao social', 'cliente', 'empresa');
    const iRelator= resolveHeaderIndex(normHeaders, 'relator da situacao 3', 'relator', 'reporter');

    const get = (arr, idx) => idx >= 0 && arr[idx] != null ? String(arr[idx]).trim() : '';

    const result = [];
    for (let ri = 0; ri < rows.length; ri++) {
        const r = rows[ri];

        const _chave      = get(r, iChave);
        const _resumo     = get(r, iResumo);
        const _status     = get(r, iStatus);
        const _prioridade = get(r, iPrio);
        const _responsavel= get(r, iResp);
        const _criado     = get(r, iCriado);
        const _modulo     = get(r, iModulo);
        const _cliente    = get(r, iCliente);

        if (!_chave && !_resumo && !_status) continue;

        const parsed = parseBugDate(_criado);

        result.push({
            _chave, _resumo, _status, _prioridade, _responsavel, _criado, _modulo,
            _funcionalidade: get(r, iFunc),
            _cliente, _relator: get(r, iRelator),
            _year:   parsed ? parsed.year  : null,
            _month:  parsed ? parsed.month : null,
            _day:    parsed ? parsed.day   : null,
            _mesAno: parsed ? `${parsed.year}-${String(parsed.month).padStart(2,'0')}` : null,
            _isResolved: isResolvedStatus(_status),
            _isCritico:  isCriticoPriority(_prioridade),
            _searchText: `${_chave} ${_resumo} ${_status} ${_prioridade} ${_responsavel} ${_modulo} ${_cliente}`.toLowerCase()
        });
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
    filterAndRenderSuporte(val);
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
    const pctRes = summary.total > 0 ? ((summary.resolvidos / summary.total) * 100).toFixed(1) : 0;
    const pctAb  = summary.total > 0 ? ((summary.abertos   / summary.total) * 100).toFixed(1) : 0;
    const pctCri = summary.total > 0 ? ((summary.criticos  / summary.total) * 100).toFixed(1) : 0;

    setBugsKPI('kpiBugsTotal',     summary.total.toLocaleString('pt-BR'),      'Todos os registros');
    setBugsKPI('kpiBugsResolvidos',summary.resolvidos.toLocaleString('pt-BR'), `${pctRes}% do total`);
    setBugsKPI('kpiBugsAbertos',   summary.abertos.toLocaleString('pt-BR'),    `${pctAb}% em aberto`);
    setBugsKPI('kpiBugsCriticos',  summary.criticos.toLocaleString('pt-BR'),   `${pctCri}% sao criticos`);
    setBugsKPI('kpiBugsMes',       summary.estesMes.toLocaleString('pt-BR'),   'Mes corrente');
}

function setBugsKPI(id, value, descOverride) {
    const card = document.getElementById(id);
    if (!card) return;
    const v = card.querySelector('.kpi-value');
    const d = card.querySelector('.bugs-kpi-desc');
    if (v) v.textContent = value;
    if (descOverride && d) d.textContent = descOverride;
}

// ===================================
// CHARTS
// ===================================
function updateBugsCharts(summary) {
    requestAnimationFrame(() => {
        createBugsOverviewChart(summary.resolvidos, summary.abertos, summary.total);
        createBugsStatusChart(summary.status);
        requestAnimationFrame(() => {
            createBugsPrioridadeChart(summary.prioridades);
            createBugsTimelineChart(summary.timeline);
            requestAnimationFrame(() => {
                createBugsModuloChart(summary.modulos);
                createBugsResponsavelChart(summary.responsaveis);
                createBugsTopClientesChart(summary.clientes);
            });
        });
    });
}

function createBugsOverviewChart(resolvidos, abertos, total) {
    destroyBugsChart('chartBugsOverview');
    const ctx = document.getElementById('chartBugsOverview');
    if (!ctx) return;

    // Plugin de texto central
    const centerTextPlugin = {
        id: 'bugsCenterText',
        afterDraw(chart) {
            const { width, height, ctx: c } = chart;
            c.save();
            const cx = width / 2, cy = height / 2 + 8;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.font = `bold ${Math.round(width * 0.14)}px Segoe UI, sans-serif`;
            c.fillStyle = '#E7E7E7';
            c.fillText(total.toLocaleString('pt-BR'), cx, cy - 10);
            c.font = `${Math.round(width * 0.07)}px Segoe UI, sans-serif`;
            c.fillStyle = '#6B7485';
            c.fillText('total', cx, cy + 14);
            c.restore();
        }
    };

    bugsCharts['chartBugsOverview'] = new Chart(ctx, {
        type: 'doughnut',
        plugins: [centerTextPlugin],
        data: {
            labels: ['Resolvidos', 'Em Aberto'],
            datasets: [{
                data: [resolvidos, abertos],
                backgroundColor: ['#35CCA3', '#E05D5D'],
                borderWidth: 3,
                borderColor: '#151922',
                hoverOffset: 8,
                spacing: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString('pt-BR')} (${total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0}%)`
                    }
                },
                datalabels: { display: false }
            }
        }
    });
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
                backgroundColor: values.map((_, i) => i === values.length - 1 ? 'rgba(255,126,32,0.9)' : 'rgba(255,126,32,0.4)'),
                borderColor: '#FF7E20',
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
    const fallback = [bugsColors.success, bugsColors.accent, bugsColors.info, '#7C65C0', bugsColors.warning, bugsColors.slate];
    const colors = labels.map((l, i) => getStatusColor(l) || fallback[i % fallback.length]);

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
                            fontColor: '#E7E7E7',
                            color: '#E7E7E7',
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
    const colors = labels.map(l => getPriorityColor(l));

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
                            fontColor: '#E7E7E7',
                            color: '#E7E7E7',
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
                backgroundColor: labels.map((_, i) => bugsPalette[i % bugsPalette.length] + (i === 0 ? 'ff' : 'bb')),
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
    const palette = bugsPalette;

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
                backgroundColor: labels.map((_, i) => bugsPalette[(i + 2) % bugsPalette.length] + (i === 0 ? 'ff' : 'bb')),
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
    bugsTablePage = 0;
    renderBugsTable();
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

function renderBugsTable() {
    const tbody = document.getElementById('bugsTableBody');
    const countEl = document.getElementById('bugsTableCount');
    if (!tbody) return;

    const data = bugsTableData;
    const total = data.length;
    const start = bugsTablePage * BUGS_PAGE_SIZE;
    const end   = Math.min(start + BUGS_PAGE_SIZE, total);
    const page  = data.slice(start, end);

    if (countEl) {
        const showing = total > BUGS_PAGE_SIZE
            ? `Exibindo ${start + 1}–${end} de ${total} bugs`
            : `${total} bug${total !== 1 ? 's' : ''}`;
        countEl.textContent = showing;
    }

    if (!total) {
        tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Nenhum bug encontrado com os filtros aplicados.</td></tr>';
        renderBugsPagination(0, 0);
        return;
    }

    // Usar array + join é mais rápido que template literal com .map
    const parts = [];
    for (let i = 0; i < page.length; i++) {
        const row = page[i];
        parts.push(
            '<tr><td class="td-chave">', escHtml(row._chave),
            '</td><td class="td-resumo" title="', escHtml(row._resumo), '">', escHtml(row._resumo),
            '</td><td>', statusBadge(row._status),
            '</td><td>', prioridadeBadge(row._prioridade),
            '</td><td>', escHtml(row._modulo),
            '</td><td>', escHtml(row._responsavel),
            '</td><td style="white-space:nowrap;color:#8C95A3;font-size:0.82em">', formatBugDate(row._criado),
            '</td><td class="td-cliente" title="', escHtml(row._cliente), '">', escHtml(row._cliente),
            '</td></tr>'
        );
    }
    tbody.innerHTML = parts.join('');

    renderBugsPagination(bugsTablePage, Math.ceil(total / BUGS_PAGE_SIZE));
}

function renderBugsPagination(currentPage, totalPages) {
    let el = document.getElementById('bugsPagination');
    if (!el) {
        el = document.createElement('div');
        el.id = 'bugsPagination';
        el.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:16px 0 4px;';
        document.querySelector('.bugs-table-wrapper').after(el);
    }
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    const btnStyle = (active) =>
        `style="background:${active ? '#FF7E20' : '#2B313C'};color:${active ? '#fff' : '#8C95A3'};border:1px solid ${active ? '#FF7E20' : '#49536A'};border-radius:6px;padding:5px 11px;cursor:pointer;font-size:0.82em;transition:all 0.2s;"`;

    const pages = [];
    pages.push(`<button ${btnStyle(false)} onclick="bugsPaginate(${currentPage - 1})" ${currentPage === 0 ? 'disabled' : ''}>‹</button>`);

    for (let i = 0; i < totalPages; i++) {
        if (totalPages > 7 && Math.abs(i - currentPage) > 2 && i !== 0 && i !== totalPages - 1) {
            if (i === currentPage - 3 || i === currentPage + 3) pages.push('<span style="color:#49536A;padding:0 4px">…</span>');
            continue;
        }
        pages.push(`<button ${btnStyle(i === currentPage)} onclick="bugsPaginate(${i})">${i + 1}</button>`);
    }

    pages.push(`<button ${btnStyle(false)} onclick="bugsPaginate(${currentPage + 1})" ${currentPage === totalPages - 1 ? 'disabled' : ''}>›</button>`);
    el.innerHTML = pages.join('');
}

function bugsPaginate(page) {
    const totalPages = Math.ceil(bugsTableData.length / BUGS_PAGE_SIZE);
    if (page < 0 || page >= totalPages) return;
    bugsTablePage = page;
    renderBugsTable();
    document.querySelector('.bugs-table-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('active')) toggleSidebar();
    }
});

// ===================================
// SUPORTE MINI-DASH
// ===================================
let allSuporteRows = [];

function startSuporteMiniDashListener() {
    const init = () => {
        if (typeof database === 'undefined' || !database) { setTimeout(init, 200); return; }

        database.ref('suporte_live').on('value', snapshot => {
            const data = snapshot.val();
            if (!data || !data.rows || !data.headers) return;
            allSuporteRows = convertSuporteRows(data);
            filterAndRenderSuporte(currentBugsMonth);
        });
    };

    if (typeof firebaseReady !== 'undefined' && firebaseReady) {
        init();
    } else {
        window.addEventListener('firebaseReady', init);
    }
}

function convertSuporteRows(data) {
    const { headers, rows } = data;
    const normH = headers.map(normStr);

    const iRazao    = resolveHeaderIndex(normH, 'razao social', 'cliente', 'empresa');
    const iProcesso = resolveHeaderIndex(normH, 'processo', 'process');
    const iModulo   = resolveHeaderIndex(normH, 'modulo', 'module');
    const iStatus   = resolveHeaderIndex(normH, 'status');
    const iDiaMes   = resolveHeaderIndex(normH, 'dia/mes', 'dia mes', 'data', 'date');

    const get = (arr, idx) => idx >= 0 && arr[idx] != null ? String(arr[idx]).trim() : '';

    return rows
        .filter(row => row && row.length > 0)
        .map(row => {
            const diaMes = get(row, iDiaMes);
            let mesAno = null;
            if (diaMes) {
                const p = diaMes.split('/');
                if (p.length >= 2) {
                    const day = parseInt(p[0]), month = parseInt(p[1]);
                    let year = p[2] ? parseInt(p[2]) : new Date().getFullYear();
                    if (year < 100) year += 2000;
                    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
                        mesAno = `${year}-${String(month).padStart(2, '0')}`;
                    }
                }
            }
            return {
                _razao:    get(row, iRazao),
                _processo: get(row, iProcesso),
                _modulo:   get(row, iModulo),
                _status:   get(row, iStatus),
                _mesAno:   mesAno
            };
        })
        .filter(r => r._razao || r._processo || r._modulo || r._status);
}

function filterAndRenderSuporte(month) {
    if (!allSuporteRows.length) return;
    const filtered = month === 'todos'
        ? allSuporteRows
        : allSuporteRows.filter(r => r._mesAno === month);
    renderSuporteMiniDash(buildSuporteSummary(filtered));
}

function buildSuporteSummary(rows) {
    let total = 0, resolvidos = 0;
    const clientes = new Set();
    const processos = {}, modulos = {};

    for (const r of rows) {
        total++;
        if (r._razao)    clientes.add(r._razao.toLowerCase().trim());
        if (r._processo) processos[r._processo] = (processos[r._processo] || 0) + 1;
        if (r._modulo)   modulos[r._modulo]     = (modulos[r._modulo]     || 0) + 1;
        if (isResolvedStatus(r._status)) resolvidos++;
    }

    const topProcesso = Object.entries(processos).sort((a, b) => b[1] - a[1])[0] || ['N/A', 0];
    const topModulo   = Object.entries(modulos).sort((a, b) => b[1] - a[1])[0]   || ['N/A', 0];

    return {
        total,
        clientesAtendidos: clientes.size,
        resolvidos,
        abertos: total - resolvidos,
        topProcesso: topProcesso[0], topProcessoQtd: topProcesso[1],
        topModulo:   topModulo[0],   topModuloQtd:   topModulo[1]
    };
}

function renderSuporteMiniDash(s) {
    setSuporteKPI('kpiSupportTotal',    s.total.toLocaleString('pt-BR'),             'Total de chamados');
    setSuporteKPI('kpiSupportClientes', s.clientesAtendidos.toLocaleString('pt-BR'), 'Contabilidades unicas');

    const motivo = s.topProcesso.length > 30 ? s.topProcesso.substring(0, 30) + '...' : s.topProcesso;
    setSuporteKPI('kpiSupportMotivo', s.topProcessoQtd.toLocaleString('pt-BR'), motivo);

    const modulo = s.topModulo.length > 30 ? s.topModulo.substring(0, 30) + '...' : s.topModulo;
    setSuporteKPI('kpiSupportModulo', s.topModuloQtd.toLocaleString('pt-BR'), modulo);

    createSupportOverviewChart(s.resolvidos, s.abertos, s.total);
}

function setSuporteKPI(id, value, desc) {
    const el = document.getElementById(id);
    if (!el) return;
    const v = el.querySelector('.kpi-value');
    const d = el.querySelector('.bugs-kpi-desc');
    if (v) v.textContent = value;
    if (d && desc) d.textContent = desc;
}

function createSupportOverviewChart(resolvidos, abertos, total) {
    destroyBugsChart('chartSupportOverview');
    const ctx = document.getElementById('chartSupportOverview');
    if (!ctx) return;

    const centerPlugin = {
        id: 'supportCenter',
        afterDraw(chart) {
            const { width, height, ctx: c } = chart;
            c.save();
            const cx = width / 2, cy = height / 2;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.font = `bold ${Math.round(width * 0.14)}px Segoe UI, sans-serif`;
            c.fillStyle = '#E7E7E7';
            c.fillText(total.toLocaleString('pt-BR'), cx, cy - 10);
            c.font = `${Math.round(width * 0.07)}px Segoe UI, sans-serif`;
            c.fillStyle = '#6B7485';
            c.fillText('total', cx, cy + 14);
            c.restore();
        }
    };

    bugsCharts['chartSupportOverview'] = new Chart(ctx, {
        type: 'doughnut',
        plugins: [centerPlugin],
        data: {
            labels: ['Resolvidos', 'Em Aberto'],
            datasets: [{
                data: [resolvidos, abertos],
                backgroundColor: ['#35CCA3', '#FF7E20'],
                borderWidth: 3,
                borderColor: '#151922',
                hoverOffset: 8,
                spacing: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString('pt-BR')} (${total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0}%)`
                    }
                },
                datalabels: { display: false }
            }
        }
    });
}
