/* ===================================
   Hubstrom - Análise com IA (Claude)
   Integração com Anthropic API
   =================================== */

// Variáveis globais (usando window para compartilhar entre scripts)
window.csvData = null;

// Função getter para API Key - SEMPRE lê do localStorage para evitar dessincronização
function getApiKey() {
    return localStorage.getItem('anthropic_api_key') || '';
}

// Função para verificar se API Key está configurada
function hasApiKeyConfigured() {
    const key = getApiKey();
    return key && key.length > 0 && key.startsWith('sk-ant-');
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded - Verificando API Key...');

    // Configurar input de arquivo CSV
    const csvInput = document.getElementById('csvFileInput');
    if (csvInput) {
        csvInput.addEventListener('change', handleCSVUpload);
    }

    // Verificar se já tem API key salva e atualizar status
    const hasKey = hasApiKeyConfigured();
    console.log('API Key configurada:', hasKey);
    updateApiStatus(hasKey);
});

// Upload e parse do CSV
function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Atualizar nome do arquivo no botão
    document.getElementById('csvFileName').textContent = file.name;

    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        window.csvData = parseCSV(text);

        console.log('CSV carregado:', window.csvData.length, 'registros');

        // Atualizar KPIs e gráficos automaticamente
        const summary = prepareDataSummary(window.csvData);
        updateKPIs(summary);
        updateCharts(summary);

        // Verificar API Key usando a função getter (sempre lê do localStorage)
        const hasApiKey = hasApiKeyConfigured();
        console.log('CSV carregado - API Key configurada:', hasApiKey);
        console.log('API Key value:', getApiKey() ? 'Existe (ocultada)' : 'Não existe');

        // Habilitar botão de gerar análise
        const btnGenerate = document.getElementById('btnGenerate');
        if (btnGenerate) {
            btnGenerate.disabled = !hasApiKey;
            console.log('Botão disabled:', btnGenerate.disabled);

            // Se não tem API key, mostrar aviso
            if (!hasApiKey) {
                console.warn('API Key não configurada. Configure clicando no botão de engrenagem.');
            }
        }

        // Atualizar status da API
        updateApiStatus(hasApiKey);

        // Mostrar notificação de sucesso
        if (hasApiKey) {
            showNotification(`CSV carregado com ${window.csvData.length} registros. Clique em "Gerar Análise" para insights!`);
        } else {
            showNotification(`CSV carregado! Configure a API Key (engrenagem) para gerar análises.`);
        }

        // Notificar o gerenciador de histórico que há novos dados
        if (typeof initMonthSelector === 'function') {
            // Não atualizar o seletor aqui para não mostrar checkmark antes de salvar
            console.log('CSV carregado - clique no botão salvar para guardar no histórico');
        }
    };
    reader.readAsText(file, 'UTF-8');
}

// Parser de CSV simples
function parseCSV(text) {
    // Normalizar quebras de linha e juntar linhas que estão dentro de aspas
    const normalizedText = normalizeCSVText(text);
    const lines = normalizedText.split('\n');

    // Usar parser robusto para o cabeçalho
    const headers = parseCSVLine(lines[0]).map(h => h.trim().replace(/\s+/g, ' '));
    console.log('Headers encontrados:', headers.length, headers);

    // Encontrar a coluna AA (índice 26) que contém o total
    // A coluna AA na planilha = índice 26 (0-indexed: A=0, B=1, ..., Z=25, AA=26)
    const totalColumnIndex = 26; // Coluna AA

    // Buscar o total na linha 13 (índice 12 no array, pois linha 1 = índice 0 após o header)
    // Na planilha: linha 1 = header, linha 2 = primeira data, linha 13 = índice 12 nos dados
    let expectedTotal = 0;
    const totalRowIndex = 12; // Linha 13 da planilha (0-indexed após header)

    if (lines.length > totalRowIndex + 1) {
        const totalRowValues = parseCSVLine(lines[totalRowIndex + 1]); // +1 porque linha 0 é header
        if (totalRowValues[totalColumnIndex]) {
            const totalStr = totalRowValues[totalColumnIndex].trim();
            expectedTotal = parseInt(totalStr.replace(/[^\d]/g, '')) || 0;
            console.log(`Total encontrado na célula AA13: ${expectedTotal}`);
        }
    }

    const data = [];

    // Se encontrou o total, usar como referência para quantos registros válidos existem
    // Pegar apenas as linhas com dados reais (antes da linha de totais)
    const maxDataRows = expectedTotal > 0 ? Math.min(totalRowIndex, lines.length - 1) : lines.length - 1;

    console.log(`Processando até ${maxDataRows} linhas de dados (total esperado: ${expectedTotal})`);

    // Encontrar índice da coluna de Status para validação adicional
    const statusIndex = headers.findIndex(h => h.toLowerCase() === 'status');
    const valorIndex = headers.findIndex(h => {
        const lower = h.toLowerCase();
        return lower.includes('valor') && (lower.includes('solicitado') || lower.includes('/'));
    });

    // Status válidos
    const validStatuses = ['cancelado', 'revertido', 'desistência', 'desistencia', 'em negociação', 'em negociacao', 'em tratativa', 'pendente', 'finalizado'];

    for (let i = 1; i <= maxDataRows; i++) {
        const line = lines[i];
        if (!line || line.trim() === '') continue;

        const values = parseCSVLine(line);

        // Validação: Status válido OU tem valor preenchido
        let isValidRow = false;

        // Verificar status
        if (statusIndex >= 0) {
            const statusStr = values[statusIndex] ? values[statusIndex].trim().toLowerCase() : '';
            if (statusStr && statusStr !== 'true' && statusStr !== 'false' && statusStr !== '-' && statusStr !== 'n/a') {
                isValidRow = validStatuses.some(s => statusStr === s || statusStr.startsWith(s));
            }
        }

        // Se não tem status válido, verificar se tem valor (backup)
        if (!isValidRow && valorIndex >= 0) {
            const valorStr = values[valorIndex] ? values[valorIndex].trim() : '';
            // Valor válido: tem número diferente de zero
            if (valorStr && /[1-9]/.test(valorStr)) {
                isValidRow = true;
            }
        }

        if (isValidRow && values.length >= 3) {
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            data.push(row);
        }

        // Debug para primeiras linhas
        if (i <= 5) {
            const statusStr = statusIndex >= 0 ? (values[statusIndex] || '').trim() : 'N/A';
            console.log(`Linha ${i}: Status="${statusStr}" -> ${data.length > 0 && data[data.length-1] === data.find((_, idx) => idx === data.length-1) ? 'incluída' : 'verificando'}`);
        }
    }

    // Se o total esperado é maior que os dados encontrados, pode haver problema
    if (expectedTotal > 0 && data.length !== expectedTotal) {
        console.warn(`Atenção: Total esperado (${expectedTotal}) diferente do encontrado (${data.length})`);
    }

    console.log(`CSV parseado: ${data.length} registros (total da planilha: ${expectedTotal})`);

    console.log('CSV parseado:', data.length, 'registros válidos (com status) de', lines.length - 1, 'linhas totais');

    // Debug: mostrar primeira linha para verificar valores
    if (data.length > 0) {
        console.log('Primeira linha parseada:', Object.keys(data[0]).slice(0, 5).map(k => `${k}: "${data[0][k]}"`).join(' | '));
    } else {
        console.error('ERRO: Nenhuma linha válida encontrada!');
        console.log('Verifique se a coluna "Status" tem valores como: Cancelado, Revertido, Desistência, Em negociação');
    }

    return data;
}

// Normaliza o texto CSV juntando linhas que estão dentro de aspas
function normalizeCSVText(text) {
    const result = [];
    let currentLine = '';
    let inQuotes = false;

    const lines = text.split('\n');

    for (const line of lines) {
        // Contar aspas na linha atual
        const quoteCount = (line.match(/"/g) || []).length;

        if (inQuotes) {
            // Continuação de campo com aspas
            currentLine += ' ' + line;
            if (quoteCount % 2 === 1) {
                inQuotes = false;
                result.push(currentLine);
                currentLine = '';
            }
        } else {
            if (quoteCount % 2 === 1) {
                // Início de campo com aspas que continua na próxima linha
                currentLine = line;
                inQuotes = true;
            } else {
                result.push(line);
            }
        }
    }

    if (currentLine) {
        result.push(currentLine);
    }

    return result.join('\n');
}

// Parser de linha CSV que respeita aspas
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim().replace(/"/g, ''));
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim().replace(/"/g, ''));

    return result;
}

// Gerar análise com Claude
async function generateAIAnalysis() {
    if (!window.csvData || window.csvData.length === 0) {
        alert('Por favor, carregue um arquivo CSV primeiro.');
        return;
    }

    if (!hasApiKeyConfigured()) {
        openConfigModal();
        return;
    }

    // Mostrar loading
    showLoading(true);

    try {
        // Preparar resumo dos dados para o Claude
        const dataSummary = prepareDataSummary(window.csvData);

        // Chamar API do Claude
        const analysis = await callClaudeAPI(dataSummary);

        // Atualizar interface com os resultados
        updateInsights(analysis.insights);
        updateRecommendations(analysis.recommendations);

        // Scroll suave para os insights
        document.getElementById('insightsSection').scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('Erro na análise:', error);
        alert('Erro ao gerar análise: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Função auxiliar para buscar valor em colunas com variações de nome
function getColumn(row, ...possibleNames) {
    const keys = Object.keys(row);

    for (const name of possibleNames) {
        // 1. Buscar nome exato
        if (row[name] !== undefined && row[name] !== '') return row[name];

        // 2. Buscar com espaço extra no final
        if (row[name + ' '] !== undefined && row[name + ' '] !== '') return row[name + ' '];

        // 3. Buscar ignorando espaços extras (trim) - comparação exata
        for (const key of keys) {
            if (key.trim().toLowerCase() === name.toLowerCase()) {
                if (row[key] !== undefined && row[key] !== '') return row[key];
            }
        }
    }
    return '';
}

// Função específica para buscar colunas de VALOR (mais restritiva)
function getValueColumn(row, exactName) {
    const keys = Object.keys(row);

    // Buscar pelo nome exato ou com variações de espaço
    for (const key of keys) {
        const keyNormalized = key.trim().replace(/\s+/g, ' ');
        if (keyNormalized === exactName || keyNormalized === exactName + ' ') {
            return row[key] || '';
        }
    }
    return '';
}

// Normalizar nome do módulo para formato padrão
function normalizeModuleName(name) {
    if (!name) return '';

    // Remover espaços extras e converter para lowercase para comparação
    const normalized = name.trim().toLowerCase();

    // Mapeamento de variações para nomes padrão
    const moduleMap = {
        'connecthub': 'ConnectHub',
        'connect hub': 'ConnectHub',
        'connect': 'ConnectHub',
        'taskhub': 'TaskHub',
        'task hub': 'TaskHub',
        'task': 'TaskHub',
        'xmlhub': 'XMLHub',
        'xml hub': 'XMLHub',
        'xml': 'XMLHub',
        'monitorhub': 'MonitorHub',
        'monitor hub': 'MonitorHub',
        'monitor': 'MonitorHub',
        'notahub': 'NotaHub',
        'nota hub': 'NotaHub',
        'nota': 'NotaHub',
        'financehub': 'FinanceHub',
        'finance hub': 'FinanceHub',
        'finance': 'FinanceHub',
        'reporthub': 'ReportHub',
        'report hub': 'ReportHub',
        'report': 'ReportHub',
        'dashboardhub': 'DashboardHub',
        'dashboard hub': 'DashboardHub',
        'dashboard': 'DashboardHub',
        'apihub': 'APIHub',
        'api hub': 'APIHub',
        'api': 'APIHub',
        'integrahub': 'IntegraHub',
        'integra hub': 'IntegraHub',
        'integra': 'IntegraHub'
    };

    // Verificar se existe no mapeamento
    if (moduleMap[normalized]) {
        return moduleMap[normalized];
    }

    // Se não encontrou, retorna o nome original com primeira letra maiúscula
    return name.charAt(0).toUpperCase() + name.slice(1);
}

// Preparar resumo dos dados
function prepareDataSummary(data) {
    const summary = {
        total: data.length,
        status: {},
        motivos: {},
        modulos: {},
        tempoUso: { '0-3': 0, '3-6': 0, '6-12': 0, '+12': 0 },
        concorrentes: {},
        valorTotal: 0,
        valorCancelado: 0,
        valorRevertido: 0,
        causasDetalhadas: []
    };

    data.forEach(row => {
        // Contagem de status
        const status = getColumn(row, 'Status', 'status').trim();
        if (status) {
            summary.status[status] = (summary.status[status] || 0) + 1;
        }

        // Contagem de motivos
        const motivo = getColumn(row, 'Principal motivo', 'Motivo').trim();
        if (motivo) {
            summary.motivos[motivo] = (summary.motivos[motivo] || 0) + 1;
        }

        // Módulos envolvidos (várias variações de nome de coluna)
        const moduloRaw = getColumn(row,
            'Módulo Envolvido',
            'Modulo Envolvido',
            'Módulo envolvido',
            'Modulo envolvido',
            'Modulo',
            'Módulo',
            'Módulos Envolvidos',
            'Modulos Envolvidos',
            'Módulos envolvidos',
            'Modulos envolvidos'
        ).trim();

        if (moduloRaw && moduloRaw !== 'N/A' && moduloRaw !== '-' && moduloRaw !== '') {
            // Separadores: vírgula, ponto e vírgula, barra, " e ", " + "
            const modulosList = moduloRaw
                .split(/[,;\/]|\s+e\s+|\s+\+\s+/i)
                .map(m => normalizeModuleName(m.trim()))
                .filter(m => m && m !== 'N/A' && m !== '-');

            modulosList.forEach(m => {
                summary.modulos[m] = (summary.modulos[m] || 0) + 1;
            });
        }

        // Tempo de uso
        const tempoStr = getColumn(row, 'Tempo de uso em meses', 'Tempo de uso');
        const tempo = parseFloat((tempoStr || '0').replace(',', '.'));
        if (tempo <= 3) summary.tempoUso['0-3']++;
        else if (tempo <= 6) summary.tempoUso['3-6']++;
        else if (tempo <= 12) summary.tempoUso['6-12']++;
        else summary.tempoUso['+12']++;

        // Valores - usar busca específica para evitar pegar colunas de resumo
        const valorSolicitadoStr = getValueColumn(row, 'Valor / Solicitado');
        const valorCancStr = getValueColumn(row, 'Valor  cancelado') || getValueColumn(row, 'Valor cancelado');
        const valorRevStr = getValueColumn(row, 'Valor revertido');

        const valorSolicitado = parseMoneyValue(valorSolicitadoStr);
        const valorCanc = parseMoneyValue(valorCancStr);
        const valorRev = parseMoneyValue(valorRevStr);

        summary.valorTotal += valorSolicitado;
        summary.valorCancelado += valorCanc;
        summary.valorRevertido += valorRev;

        // Causas detalhadas (para análise qualitativa)
        const causa = getColumn(row, 'Causa', 'Motivo  da solicitação (ABERTURA *Hubspot)');
        const tratativa = getColumn(row, 'Tratativa (Resumo das ações realizadas)', 'Tratativa');
        if (causa || tratativa) {
            summary.causasDetalhadas.push({
                status: status,
                motivo: motivo,
                causa: (causa || '').substring(0, 500),
                tratativa: (tratativa || '').substring(0, 300)
            });
        }
    });

    // Ordenar módulos por quantidade (decrescente)
    const modulosOrdenados = {};
    Object.entries(summary.modulos)
        .sort((a, b) => b[1] - a[1])
        .forEach(([key, value]) => {
            modulosOrdenados[key] = value;
        });
    summary.modulos = modulosOrdenados;

    // Log dos valores calculados
    console.log('=== RESUMO DOS VALORES ===');
    console.log('Total de registros:', summary.total);
    console.log('Valor Total Solicitado:', summary.valorTotal.toFixed(2));
    console.log('Valor Cancelado:', summary.valorCancelado.toFixed(2));
    console.log('Valor Revertido:', summary.valorRevertido.toFixed(2));
    console.log('Status:', summary.status);
    console.log('Motivos:', summary.motivos);
    console.log('Módulos:', summary.modulos);

    // Debug: mostrar colunas disponíveis se módulos estiver vazio
    if (Object.keys(summary.modulos).length === 0 && data.length > 0) {
        console.warn('ATENÇÃO: Nenhum módulo encontrado! Colunas disponíveis:', Object.keys(data[0]));
    }

    return summary;
}

// Parser de valor monetário
function parseMoneyValue(value) {
    if (!value) return 0;
    return parseFloat(
        value.replace('R$', '')
             .replace(/\./g, '')
             .replace(',', '.')
             .trim()
    ) || 0;
}

// Formatar valor monetário
function formatMoney(value) {
    return 'R$ ' + value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Atualizar KPIs na interface
function updateKPIs(summary) {
    const total = summary.total;
    const cancelados = (summary.status['Cancelado'] || 0) + (summary.status['Desistência'] || 0);
    const revertidos = summary.status['Revertido'] || 0;
    const emTratativa = summary.status['Em negociação'] || 0;

    const percCancelados = ((cancelados / total) * 100).toFixed(1);
    const percRevertidos = ((revertidos / total) * 100).toFixed(1);
    const percTratativa = ((emTratativa / total) * 100).toFixed(1);

    // Atualizar cards de KPI
    const kpiCards = document.querySelectorAll('.kpi-card');
    if (kpiCards.length >= 8) {
        // Linha 1: Quantidades
        kpiCards[0].querySelector('.kpi-value').textContent = total;
        kpiCards[1].querySelector('.kpi-value').textContent = cancelados;
        kpiCards[1].querySelector('.kpi-label').textContent = `Cancelados (${percCancelados}%)`;
        kpiCards[2].querySelector('.kpi-value').textContent = revertidos;
        kpiCards[2].querySelector('.kpi-label').textContent = `Revertidos (${percRevertidos}%)`;
        kpiCards[3].querySelector('.kpi-value').textContent = emTratativa;
        kpiCards[3].querySelector('.kpi-label').textContent = `Em Tratativa (${percTratativa}%)`;

        // Linha 2: Valores
        kpiCards[4].querySelector('.kpi-value').textContent = formatMoney(summary.valorTotal);
        kpiCards[5].querySelector('.kpi-value').textContent = formatMoney(summary.valorCancelado);
        kpiCards[6].querySelector('.kpi-value').textContent = formatMoney(summary.valorRevertido);
        kpiCards[7].querySelector('.kpi-value').textContent = percRevertidos + '%';
    }

    // Atualizar alerta crítico
    const highlightBox = document.querySelector('.highlight-box p strong');
    if (highlightBox) {
        const motivoUsabilidade = summary.motivos['Usabilidade'] || 0;
        const percUsabilidade = ((motivoUsabilidade / total) * 100).toFixed(0);
        highlightBox.textContent = `${percUsabilidade}% dos cancelamentos`;

        const highlightText = document.querySelector('.highlight-box p');
        if (highlightText) {
            highlightText.innerHTML = `<strong>${percUsabilidade}% dos cancelamentos</strong> (${motivoUsabilidade} de ${total}) são por problemas de USABILIDADE.`;
        }
    }
}

// Atualizar gráficos
function updateCharts(summary) {
    // Inicializar objeto global se não existir
    window.hubstromCharts = window.hubstromCharts || {};

    // Destruir gráficos existentes e recriar
    const chartInstances = Chart.instances;
    Object.values(chartInstances).forEach(chart => chart.destroy());

    // Dados para gráfico de motivos
    const motivoLabels = Object.keys(summary.motivos);
    const motivoData = Object.values(summary.motivos);
    const total = summary.total;

    // Recriar gráfico de motivos
    const motivoCtx = document.getElementById('motivoChart');
    if (motivoCtx) {
        window.hubstromCharts.motivoChart = new Chart(motivoCtx, {
            type: 'doughnut',
            data: {
                labels: motivoLabels.map((label, i) => `${label} (${((motivoData[i] / total) * 100).toFixed(0)}%)`),
                datasets: [{
                    data: motivoData,
                    backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#35cca3'],
                    borderWidth: 0,
                    spacing: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '60%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 12, usePointStyle: true } }
                }
            }
        });
    }

    // Recriar gráfico de status
    const statusCtx = document.getElementById('statusChart');
    if (statusCtx) {
        const statusLabels = ['Cancelado', 'Revertido', 'Desistência', 'Em negociação'];
        const statusData = statusLabels.map(s => summary.status[s] || 0);

        window.hubstromCharts.statusChart = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: statusLabels,
                datasets: [{
                    data: statusData,
                    backgroundColor: ['#ef4444', '#35cca3', '#3b82f6', '#f59e0b'],
                    borderWidth: 0,
                    spacing: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '60%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 12, usePointStyle: true } }
                }
            }
        });
    }

    // Recriar gráfico de tempo
    const tempoCtx = document.getElementById('tempoChart');
    if (tempoCtx) {
        // Calcular cancelados e revertidos por tempo
        const canceladosPorTempo = { '0-3': 0, '3-6': 0, '6-12': 0, '+12': 0 };
        const revertidosPorTempo = { '0-3': 0, '3-6': 0, '6-12': 0, '+12': 0 };

        window.csvData.forEach(row => {
            const tempoStr = getColumn(row, 'Tempo de uso em meses', 'Tempo de uso');
            const tempo = parseFloat((tempoStr || '0').replace(',', '.'));
            const status = getColumn(row, 'Status', 'status').trim();
            let faixa = '+12';
            if (tempo <= 3) faixa = '0-3';
            else if (tempo <= 6) faixa = '3-6';
            else if (tempo <= 12) faixa = '6-12';

            if (status === 'Cancelado' || status === 'Desistência') {
                canceladosPorTempo[faixa]++;
            } else if (status === 'Revertido') {
                revertidosPorTempo[faixa]++;
            }
        });

        window.hubstromCharts.tempoChart = new Chart(tempoCtx, {
            type: 'bar',
            data: {
                labels: ['0-3 meses', '3-6 meses', '6-12 meses', '+12 meses'],
                datasets: [
                    {
                        label: 'Cancelados',
                        data: [canceladosPorTempo['0-3'], canceladosPorTempo['3-6'], canceladosPorTempo['6-12'], canceladosPorTempo['+12']],
                        backgroundColor: '#ef4444',
                        borderRadius: 8
                    },
                    {
                        label: 'Revertidos',
                        data: [revertidosPorTempo['0-3'], revertidosPorTempo['3-6'], revertidosPorTempo['6-12'], revertidosPorTempo['+12']],
                        backgroundColor: '#35cca3',
                        borderRadius: 8
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { labels: { color: '#94a3b8' } } },
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
                    x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
                }
            }
        });
    }

    // Recriar gráfico de módulos
    const moduloCtx = document.getElementById('moduloChart');
    if (moduloCtx) {
        // Destruir gráfico existente
        if (window.hubstromCharts && window.hubstromCharts.moduloChart) {
            window.hubstromCharts.moduloChart.destroy();
        }

        const moduloLabels = Object.keys(summary.modulos).slice(0, 5);
        const moduloData = moduloLabels.map(m => summary.modulos[m]);

        // Se não tiver módulos, mostrar gráfico vazio
        if (moduloLabels.length === 0) {
            window.hubstromCharts.moduloChart = new Chart(moduloCtx, {
                type: 'bar',
                data: {
                    labels: ['Sem dados de módulos'],
                    datasets: [{
                        label: 'Reclamações',
                        data: [0],
                        backgroundColor: ['rgba(100, 116, 139, 0.3)'],
                        borderRadius: 6,
                        barThickness: 24
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
                        y: { ticks: { color: '#94a3b8' }, grid: { display: false } }
                    }
                }
            });
            return;
        }

        // Gráfico com dados reais
        window.hubstromCharts.moduloChart = new Chart(moduloCtx, {
            type: 'bar',
            data: {
                labels: moduloLabels,
                datasets: [{
                    label: 'Reclamações',
                    data: moduloData,
                    backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#35cca3', '#8b5cf6'],
                    borderRadius: 6,
                    barThickness: 24
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
                    y: { ticks: { color: '#94a3b8' }, grid: { display: false } }
                }
            }
        });
    }

    // Atualizar concorrentes
    updateCompetitors(summary);
}

// Atualizar lista de concorrentes (extraindo do CSV)
function updateCompetitors(summary) {
    // Buscar concorrentes mencionados nos dados
    const competitors = {};

    window.csvData.forEach(row => {
        const causa = getColumn(row, 'Causa', 'Motivo  da solicitação (ABERTURA *Hubspot)');
        const tratativa = getColumn(row, 'Tratativa (Resumo das ações realizadas)', 'Tratativa');
        const textoCompleto = (causa || '') + ' ' + (tratativa || '');
        const concorrentes = ['SIEG', 'VERI', 'ACESSÓRIAS', 'Acessorias', 'CALIMA', 'Calima', 'GOB', 'NIBO', 'Nibo', 'DIGILIZA', 'Digiliza', 'QUESTOR', 'Questor', 'TRON', 'Tron', 'Domínio', 'Dominio', 'Makro', 'MAKRO', 'ÍRIS', 'Iris'];

        concorrentes.forEach(c => {
            if (textoCompleto.toLowerCase().includes(c.toLowerCase())) {
                const normalized = c.toUpperCase()
                    .replace('ACESSORIAS', 'ACESSÓRIAS')
                    .replace('DOMINIO', 'DOMÍNIO')
                    .replace('ÍRIS', 'ÍRIS')
                    .replace('IRIS', 'ÍRIS');
                competitors[normalized] = (competitors[normalized] || 0) + 1;
            }
        });
    });

    // Atualizar HTML dos concorrentes se encontrou algum
    const competitorSection = document.querySelector('.section h2');
    if (competitorSection && Object.keys(competitors).length > 0) {
        const sections = document.querySelectorAll('.section');
        sections.forEach(section => {
            const h2 = section.querySelector('h2');
            if (h2 && h2.textContent.includes('Concorrentes')) {
                const container = section.querySelector('div:last-of-type');
                if (container && container.classList.length === 0) {
                    container.innerHTML = Object.entries(competitors)
                        .sort((a, b) => b[1] - a[1])
                        .map(([name, count]) => `<span class="competitor-tag">${name} (${count} ${count === 1 ? 'menção' : 'menções'})</span>`)
                        .join('');
                }
            }
        });
    }
}

// Mostrar notificação
function showNotification(message) {
    // Remover notificação existente
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);

    // Animar entrada
    setTimeout(() => notification.classList.add('show'), 10);

    // Remover após 4 segundos
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Chamar API do Claude
async function callClaudeAPI(dataSummary) {
    const prompt = buildAnalysisPrompt(dataSummary);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': getApiKey(),
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 2000,
            messages: [{
                role: 'user',
                content: prompt
            }]
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Erro na API');
    }

    const result = await response.json();
    const content = result.content[0].text;

    // Parsear resposta JSON do Claude
    return parseClaudeResponse(content);
}

// Construir prompt para o Claude
function buildAnalysisPrompt(summary) {
    return `Você é um analista de Customer Success especializado em análise de cancelamentos (churn) de SaaS.

Analise os seguintes dados de cancelamentos e gere insights e recomendações ÚNICOS e ESPECÍFICOS baseados nos padrões encontrados.

## DADOS DO PERÍODO:

### Totais:
- Total de solicitações: ${summary.total}
- Valor total solicitado: R$ ${summary.valorTotal.toFixed(2)}
- Valor cancelado: R$ ${summary.valorCancelado.toFixed(2)}
- Valor revertido: R$ ${summary.valorRevertido.toFixed(2)}

### Status das solicitações:
${Object.entries(summary.status).map(([k, v]) => `- ${k}: ${v} (${((v/summary.total)*100).toFixed(1)}%)`).join('\n')}

### Motivos principais:
${Object.entries(summary.motivos).map(([k, v]) => `- ${k}: ${v} (${((v/summary.total)*100).toFixed(1)}%)`).join('\n')}

### Módulos envolvidos:
${Object.entries(summary.modulos).map(([k, v]) => `- ${k}: ${v}`).join('\n') || 'Não especificado'}

### Distribuição por tempo de uso:
- 0-3 meses: ${summary.tempoUso['0-3']}
- 3-6 meses: ${summary.tempoUso['3-6']}
- 6-12 meses: ${summary.tempoUso['6-12']}
- +12 meses: ${summary.tempoUso['+12']}

### Amostra de causas detalhadas (${Math.min(10, summary.causasDetalhadas.length)} de ${summary.causasDetalhadas.length}):
${summary.causasDetalhadas.slice(0, 10).map((c, i) => `
${i+1}. Status: ${c.status} | Motivo: ${c.motivo}
   Causa: ${c.causa}
   Tratativa: ${c.tratativa}
`).join('\n')}

## INSTRUÇÕES:

Gere uma análise em formato JSON com a seguinte estrutura:

{
  "insights": [
    {
      "tipo": "critico|alerta|positivo",
      "titulo": "Título curto e impactante",
      "descricao": "Descrição detalhada do insight baseado nos dados"
    }
  ],
  "recommendations": [
    {
      "prioridade": 1,
      "titulo": "Título da recomendação",
      "descricao": "Descrição da ação recomendada",
      "impacto": "Impacto esperado da ação"
    }
  ]
}

IMPORTANTE:
- Gere 4-6 insights diferentes
- Gere 4-5 recomendações ordenadas por prioridade
- Baseie-se APENAS nos dados fornecidos
- Seja específico com números e porcentagens
- Foque em padrões incomuns ou preocupantes
- Sugira ações práticas e mensuráveis

Responda APENAS com o JSON, sem texto adicional.`;
}

// Parsear resposta do Claude
function parseClaudeResponse(content) {
    try {
        // Tentar encontrar JSON na resposta
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error('JSON não encontrado na resposta');
    } catch (e) {
        console.error('Erro ao parsear resposta:', e);
        // Retornar estrutura padrão em caso de erro
        return {
            insights: [{
                tipo: 'alerta',
                titulo: 'Erro no processamento',
                descricao: 'Não foi possível processar a análise. Tente novamente.'
            }],
            recommendations: [{
                prioridade: 1,
                titulo: 'Verificar dados',
                descricao: 'Verifique se o CSV está no formato correto.',
                impacto: 'N/A'
            }]
        };
    }
}

// Atualizar seção de Insights
function updateInsights(insights) {
    const container = document.getElementById('insightsList');
    if (!container) return;

    const icons = {
        'critico': '🔴',
        'alerta': '🟡',
        'positivo': '🟢'
    };

    container.innerHTML = insights.map(insight => `
        <li>
            <strong>${icons[insight.tipo] || '🔵'} ${insight.titulo}:</strong> ${insight.descricao}
        </li>
    `).join('');
}

// Atualizar seção de Recomendações
function updateRecommendations(recommendations) {
    const container = document.getElementById('recommendationsList');
    if (!container) return;

    container.innerHTML = recommendations.map((rec, index) => `
        <article class="recommendation-card">
            <h4>${index + 1}. ${rec.titulo}</h4>
            <p>${rec.descricao}</p>
            ${rec.impacto ? `<p style="color: #35cca3; font-size: 0.9em; margin-top: 10px;"><strong>Impacto esperado:</strong> ${rec.impacto}</p>` : ''}
        </article>
    `).join('');
}

// Mostrar/esconder loading
function showLoading(show) {
    const loading = document.getElementById('aiLoadingIndicator');
    const btnGenerate = document.getElementById('btnGenerate');

    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
    }
    if (btnGenerate) {
        btnGenerate.disabled = show;
    }
}

// Modal de configuração
function openConfigModal() {
    const modal = document.getElementById('configModal');
    const input = document.getElementById('apiKeyInput');

    if (modal) {
        modal.style.display = 'flex';
        const currentKey = getApiKey();
        if (input && currentKey) {
            input.value = currentKey;
        }
    }
}

function closeConfigModal() {
    const modal = document.getElementById('configModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function saveApiKey() {
    const input = document.getElementById('apiKeyInput');
    if (!input) return;

    const newKey = input.value.trim();

    if (!newKey.startsWith('sk-ant-')) {
        alert('Chave inválida. A chave deve começar com "sk-ant-"');
        return;
    }

    // Salvar diretamente no localStorage (a função getter vai ler de lá)
    localStorage.setItem('anthropic_api_key', newKey);
    console.log('API Key salva no localStorage');

    updateApiStatus(true);

    // Habilitar botão se CSV já foi carregado
    const btnGenerate = document.getElementById('btnGenerate');
    if (btnGenerate && window.csvData) {
        btnGenerate.disabled = false;
    }

    closeConfigModal();

    // Mostrar notificação de sucesso
    showNotification('API Key configurada com sucesso!');
}

function updateApiStatus(configured) {
    const status = document.getElementById('apiStatus');
    if (status) {
        status.innerHTML = configured
            ? '<span style="color: #35cca3;">✓ API Key configurada</span>'
            : '<span style="color: #f59e0b;">⚠ API Key não configurada</span>';
    }
}

// Fechar modal clicando fora
document.addEventListener('click', (e) => {
    const modal = document.getElementById('configModal');
    if (e.target === modal) {
        closeConfigModal();
    }
});
