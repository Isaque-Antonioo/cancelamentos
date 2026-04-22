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

    // Gerar alerta dinâmico baseado nos dados reais
    generateDynamicAlert(summary);

    // Gerar grid de causas reais
    generateProblemGrid(window.csvData, summary);
}

// Gera o grid de causas reais lendo a coluna Causa do CSV (cache 24h)
async function generateProblemGrid(data, summary) {
    const grid = document.getElementById('problemGrid');
    const desc = document.getElementById('problemGridDesc');
    const fonte = document.getElementById('problemGridFonte');
    if (!grid) return;

    // Coletar textos reais da coluna Causa / Motivo da solicitação
    const causas = data
        .map(row => getColumn(row, 'Causa', 'Motivo  da solicitação (ABERTURA *Hubspot)', 'Motivo da solicitação'))
        .filter(c => c && c.trim().length > 5)
        .map(c => c.trim().substring(0, 300));

    if (causas.length === 0) {
        grid.innerHTML = '<p style="color:#64748b;font-style:italic;">Coluna "Causa" não encontrada nos dados.</p>';
        return;
    }

    const monthKey = typeof getCurrentMonth === 'function' ? getCurrentMonth() : new Date().toISOString().slice(0, 7);
    const cacheKey = `hubstrom_problem_grid_${monthKey}`;

    // Verificar cache 24h
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < 86400000) {
                renderProblemGrid(parsed.grupos, parsed.fonte, desc, grid, fonte);
                return;
            }
        }
    } catch (e) { /* ignora */ }

    // Mostrar loading
    grid.innerHTML = '<p style="color:#64748b;font-style:italic;">Analisando causas dos cancelamentos...</p>';

    let grupos, fonteTexto;

    if (hasApiKeyConfigured()) {
        try {
            grupos = await callClaudeForProblemGroups(causas, summary.total);
            fonteTexto = `Análise gerada por IA · ${new Date().toLocaleDateString('pt-BR')} · ${causas.length} causas analisadas`;
        } catch (e) {
            console.warn('Falha na IA para problem grid:', e.message);
            grupos = buildLocalProblemGroups(data, summary);
            fonteTexto = `Agrupamento automático · ${new Date().toLocaleDateString('pt-BR')} · ${causas.length} causas`;
        }
    } else {
        grupos = buildLocalProblemGroups(data, summary);
        fonteTexto = `Agrupamento automático · ${new Date().toLocaleDateString('pt-BR')} · Configure a API Key para análise com IA`;
    }

    // Salvar cache
    try {
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), grupos, fonte: fonteTexto }));
    } catch (e) { /* ignora */ }

    renderProblemGrid(grupos, fonteTexto, desc, grid, fonte);
}

// Chama Claude para agrupar causas em temas reais
async function callClaudeForProblemGroups(causas, total) {
    const amostra = causas.slice(0, 60).map((c, i) => `${i + 1}. ${c}`).join('\n');

    const prompt = `Você é analista de Customer Success. Analise as causas reais de cancelamento abaixo e agrupe em 4 a 6 temas recorrentes.

CAUSAS REAIS (${causas.length} de ${total} cancelamentos):
${amostra}

Regras:
- O nome de cada grupo deve refletir EXATAMENTE o que os clientes citam (ex: "Instabilidade no ConnectHub", "Preço acima do esperado", "Falta de integração com ERP")
- Cada grupo deve ter entre 3 e 6 bullets com reclamações específicas mencionadas
- Conte quantos registros se encaixam em cada grupo
- Ordene do maior para o menor número de casos

Responda APENAS com JSON:
[
  { "titulo": "Nome do Tema (N casos)", "casos": N, "itens": ["reclamação 1", "reclamação 2", ...] },
  ...
]`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': getApiKey(),
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1200,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!response.ok) throw new Error('API error ' + response.status);
    const result = await response.json();
    const text = result.content[0].text;
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error('JSON não encontrado na resposta');
}

// Agrupamento local sem IA (por motivo principal)
function buildLocalProblemGroups(data, summary) {
    const grupos = [];
    Object.entries(summary.motivos)
        .sort((a, b) => b[1] - a[1])
        .forEach(([motivo, count]) => {
            // Coletar causas deste motivo
            const itens = new Set();
            data.forEach(row => {
                const m = getColumn(row, 'Principal motivo', 'Motivo').trim();
                if (m.toLowerCase() === motivo.toLowerCase()) {
                    const causa = getColumn(row, 'Causa', 'Motivo  da solicitação (ABERTURA *Hubspot)', 'Motivo da solicitação').trim();
                    if (causa.length > 5) itens.add(causa.substring(0, 120));
                }
            });
            grupos.push({
                titulo: `${motivo} (${count} ${count === 1 ? 'caso' : 'casos'})`,
                casos: count,
                itens: [...itens].slice(0, 5)
            });
        });
    return grupos;
}

// Renderiza os cards no DOM
function renderProblemGrid(grupos, fonteTexto, desc, grid, fonte) {
    if (!grupos || grupos.length === 0) {
        grid.innerHTML = '<p style="color:#64748b;font-style:italic;">Nenhum padrão identificado.</p>';
        return;
    }

    if (desc) desc.textContent = `Padrões identificados nas causas reais dos cancelamentos deste mês:`;

    grid.innerHTML = grupos.map(grupo => `
        <article class="problem-card">
            <h4>${grupo.titulo}</h4>
            <ul>
                ${grupo.itens.map(item => `<li>${item}</li>`).join('')}
            </ul>
        </article>
    `).join('');

    if (fonte) fonte.textContent = fonteTexto;
}

// Detecta o padrão mais crítico e gera alerta dinâmico com IA (cache 24h)
async function generateDynamicAlert(summary) {
    if (!summary || summary.total === 0) return;

    const motivos = summary.motivos;
    if (!motivos || Object.keys(motivos).length === 0) return;

    // Encontrar o motivo principal
    const topEntry = Object.entries(motivos).sort((a, b) => b[1] - a[1])[0];
    const topMotivo = topEntry[0];
    const topCount = topEntry[1];
    const topPerc = ((topCount / summary.total) * 100);

    // Determinar severidade
    let severidade, icone;
    if (topPerc >= 40) {
        severidade = 'ALERTA CRÍTICO';
        icone = '🚨';
    } else if (topPerc >= 25) {
        severidade = 'ALERTA';
        icone = '⚠️';
    } else {
        severidade = 'PADRÃO DETECTADO';
        icone = '📊';
    }

    const monthKey = typeof getCurrentMonth === 'function' ? getCurrentMonth() : new Date().toISOString().slice(0, 7);
    const cacheKey = `hubstrom_dynamic_alert_${monthKey}`;

    // Verificar cache (24h)
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            const age = Date.now() - parsed.timestamp;
            if (age < 86400000) { // 24 horas em ms
                renderAlert(parsed);
                return;
            }
        }
    } catch (e) { /* ignora erro de parse */ }

    // Gerar novo alerta
    let alertData;
    if (hasApiKeyConfigured()) {
        try {
            const aiText = await generateAIAlertText(summary, topMotivo, topPerc, summary.total);
            alertData = {
                timestamp: Date.now(),
                titulo: `${icone} ${severidade}: ${topMotivo.toUpperCase()}`,
                texto: aiText.linha1 || `${topPerc.toFixed(0)}% dos cancelamentos são por "${topMotivo}" (${topCount} de ${summary.total} casos).`,
                detalhe: aiText.linha2 || '',
                fonte: `Análise gerada por IA · ${new Date().toLocaleDateString('pt-BR')} · Dados: ${summary.total} registros`
            };
        } catch (e) {
            console.warn('Falha na IA, usando alerta local:', e.message);
            alertData = buildLocalAlert(icone, severidade, topMotivo, topCount, topPerc, summary);
        }
    } else {
        alertData = buildLocalAlert(icone, severidade, topMotivo, topCount, topPerc, summary);
    }

    // Salvar cache
    try {
        localStorage.setItem(cacheKey, JSON.stringify(alertData));
    } catch (e) { /* ignora erro de storage */ }

    renderAlert(alertData);
}

// Chama a API Claude para gerar texto do alerta (haiku, ~150 tokens)
async function generateAIAlertText(summary, topMotivo, topPerc, total) {
    const segundoEntry = Object.entries(summary.motivos).sort((a, b) => b[1] - a[1])[1];
    const segundoInfo = segundoEntry ? ` O segundo motivo é "${segundoEntry[0]}" (${((segundoEntry[1]/total)*100).toFixed(0)}%).` : '';

    const prompt = `Você é analista de Customer Success. Em 2 frases curtas e diretas em português:
1ª frase: descreva o impacto do motivo de cancelamento dominante com os números exatos.
2ª frase: dê UMA ação preventiva prioritária concreta.

Dados: ${total} cancelamentos. Motivo principal: "${topMotivo}" = ${topPerc.toFixed(0)}% dos casos (${summary.motivos[topMotivo]} registros).${segundoInfo}

Responda APENAS com JSON: {"linha1": "...", "linha2": "..."}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': getApiKey(),
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!response.ok) throw new Error('API error ' + response.status);
    const result = await response.json();
    const text = result.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { linha1: text, linha2: '' };
}

// Gera alerta baseado em regras (sem IA)
function buildLocalAlert(icone, severidade, topMotivo, topCount, topPerc, summary) {
    const segundoEntry = Object.entries(summary.motivos).sort((a, b) => b[1] - a[1])[1];
    const detalhe = segundoEntry
        ? `Segundo motivo mais frequente: "${segundoEntry[0]}" com ${((segundoEntry[1]/summary.total)*100).toFixed(0)}% dos casos. Atenção recomendada para ações corretivas imediatas.`
        : `Concentração elevada em um único motivo indica problema sistêmico que requer ação corretiva prioritária.`;

    return {
        timestamp: Date.now(),
        titulo: `${icone} ${severidade}: ${topMotivo.toUpperCase()}`,
        texto: `${topPerc.toFixed(0)}% dos cancelamentos (${topCount} de ${summary.total} registros) têm "${topMotivo}" como motivo principal.`,
        detalhe,
        fonte: `Análise automática · ${new Date().toLocaleDateString('pt-BR')} · Configure a API Key para insights com IA`
    };
}

// Atualiza o DOM com os dados do alerta
function renderAlert(alertData) {
    const box = document.getElementById('alertaBox');
    if (!box) return;

    const titulo = document.getElementById('alertaTitulo');
    const texto = document.getElementById('alertaTexto');
    const detalhe = document.getElementById('alertaDetalhe');
    const fonte = document.getElementById('alertaFonte');

    if (titulo) titulo.textContent = alertData.titulo;
    if (texto) texto.textContent = alertData.texto;
    if (detalhe) detalhe.textContent = alertData.detalhe;
    if (fonte) fonte.textContent = alertData.fonte;

    box.style.display = '';
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

    // Ordenar motivos do menor para o maior
    const motivoEntries = Object.entries(summary.motivos).sort((a, b) => b[1] - a[1]);
    const motivoLabelsSorted = motivoEntries.map(e => e[0]);
    const motivoDataSorted = motivoEntries.map(e => e[1]);
    const colors = ['#3b82f6', '#35cca3', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    // Recriar gráfico de motivos como barras verticais (menor ao maior)
    const motivoCtx = document.getElementById('motivoChart');
    if (motivoCtx) {
        window.hubstromCharts.motivoChart = new Chart(motivoCtx, {
            type: 'bar',
            data: {
                labels: motivoLabelsSorted,
                datasets: [{
                    data: motivoDataSorted,
                    backgroundColor: motivoLabelsSorted.map((_, i) => colors[i % colors.length]),
                    borderRadius: 6,
                    barThickness: 32
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        display: true,
                        color: '#ffffff',
                        anchor: 'center',
                        align: 'center',
                        font: { weight: 'bold', size: 14 },
                        formatter: (value) => {
                            const pct = ((value / total) * 100).toFixed(0);
                            return value > 0 ? `${value}\n(${pct}%)` : '';
                        },
                        textAlign: 'center'
                    }
                },
                scales: {
                    x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
                    y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } }
                }
            }
        });
    }

    // Recriar gráfico de status com datalabels
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
                cutout: '55%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 12, usePointStyle: true } },
                    datalabels: {
                        display: (context) => context.dataset.data[context.dataIndex] > 0,
                        color: (context) => {
                            const bgColor = context.dataset.backgroundColor[context.dataIndex];
                            const lightColors = ['#f59e0b', '#fbbf24', '#fcd34d'];
                            return lightColors.includes(bgColor) ? '#1a1a2e' : '#ffffff';
                        },
                        font: { weight: 'bold', size: 13 },
                        formatter: (value) => value > 0 ? value : '',
                        textAlign: 'center'
                    }
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
                plugins: {
                    legend: { labels: { color: '#94a3b8' } },
                    datalabels: {
                        display: (context) => context.dataset.data[context.dataIndex] > 0,
                        color: (context) => {
                            const bgColor = context.dataset.backgroundColor;
                            const lightColors = ['#f59e0b', '#fbbf24', '#fcd34d'];
                            return lightColors.includes(bgColor) ? '#1a1a2e' : '#ffffff';
                        },
                        anchor: 'center',
                        align: 'center',
                        font: { weight: 'bold', size: 11 },
                        formatter: (value) => value > 0 ? value : ''
                    }
                },
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
                    plugins: {
                        legend: { display: false },
                        datalabels: { display: false }
                    },
                    scales: {
                        x: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
                        y: { ticks: { color: '#94a3b8' }, grid: { display: false } }
                    }
                }
            });
            return;
        }

        // Gráfico com dados reais e datalabels
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
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        display: true,
                        color: (context) => {
                            const bgColors = context.dataset.backgroundColor;
                            const bgColor = Array.isArray(bgColors) ? bgColors[context.dataIndex] : bgColors;
                            const lightColors = ['#f59e0b', '#fbbf24', '#fcd34d'];
                            return lightColors.includes(bgColor) ? '#1a1a2e' : '#ffffff';
                        },
                        anchor: 'center',
                        align: 'center',
                        font: { weight: 'bold', size: 12 },
                        formatter: (value) => value > 0 ? value : ''
                    }
                },
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

async function saveApiKey() {
    const input = document.getElementById('apiKeyInput');
    if (!input) return;

    const newKey = input.value.trim();

    if (!newKey.startsWith('sk-ant-')) {
        alert('Chave inválida. A chave deve começar com "sk-ant-"');
        return;
    }

    // Salvar no localStorage para acesso imediato
    localStorage.setItem('anthropic_api_key', newKey);
    console.log('API Key salva no localStorage');

    // Salvar no Firebase para compartilhar com todos os usuários
    if (typeof saveApiKeyToFirebase === 'function') {
        try {
            await saveApiKeyToFirebase(newKey);
            console.log('API Key também salva no Firebase');
        } catch (error) {
            console.warn('Não foi possível salvar no Firebase:', error);
        }
    }

    updateApiStatus(true);

    // Habilitar botão se CSV já foi carregado
    const btnGenerate = document.getElementById('btnGenerate');
    if (btnGenerate && window.csvData) {
        btnGenerate.disabled = false;
    }

    closeConfigModal();

    // Mostrar notificação de sucesso
    showNotification('API Key configurada com sucesso! (salva para todos os usuários)');
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
