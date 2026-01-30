/* ===================================
   Hubstrom - Análise com IA (Claude)
   Integração com Anthropic API
   =================================== */

// Variáveis globais
let csvData = null;
let apiKey = localStorage.getItem('anthropic_api_key') || '';

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    // Configurar input de arquivo CSV
    const csvInput = document.getElementById('csvFileInput');
    if (csvInput) {
        csvInput.addEventListener('change', handleCSVUpload);
    }

    // Verificar se já tem API key salva
    if (apiKey) {
        updateApiStatus(true);
    }
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
        csvData = parseCSV(text);

        // Habilitar botão de gerar análise
        const btnGenerate = document.getElementById('btnGenerate');
        if (btnGenerate && apiKey) {
            btnGenerate.disabled = false;
        }

        console.log('CSV carregado:', csvData.length, 'registros');
    };
    reader.readAsText(file, 'UTF-8');
}

// Parser de CSV simples
function parseCSV(text) {
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === '') continue;

        // Parser mais robusto para lidar com vírgulas dentro de aspas
        const values = parseCSVLine(lines[i]);
        if (values.length >= 5) {
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            data.push(row);
        }
    }

    return data;
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
    if (!csvData || csvData.length === 0) {
        alert('Por favor, carregue um arquivo CSV primeiro.');
        return;
    }

    if (!apiKey) {
        openConfigModal();
        return;
    }

    // Mostrar loading
    showLoading(true);

    try {
        // Preparar resumo dos dados para o Claude
        const dataSummary = prepareDataSummary(csvData);

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
        const status = row['Status'] || row['status'] || '';
        if (status) {
            summary.status[status] = (summary.status[status] || 0) + 1;
        }

        // Contagem de motivos
        const motivo = row['Principal motivo'] || row['Principal motivo '] || row['Motivo'] || '';
        if (motivo) {
            summary.motivos[motivo] = (summary.motivos[motivo] || 0) + 1;
        }

        // Módulos envolvidos
        const modulo = row['Módulo Envolvido'] || row['Modulo Envolvido'] || '';
        if (modulo && modulo !== 'N/A') {
            summary.modulos[modulo] = (summary.modulos[modulo] || 0) + 1;
        }

        // Tempo de uso
        const tempo = parseFloat((row['Tempo de uso em meses'] || '0').replace(',', '.'));
        if (tempo <= 3) summary.tempoUso['0-3']++;
        else if (tempo <= 6) summary.tempoUso['3-6']++;
        else if (tempo <= 12) summary.tempoUso['6-12']++;
        else summary.tempoUso['+12']++;

        // Valores
        const valorSolicitado = parseMoneyValue(row['Valor / Solicitado'] || row['Valor'] || '0');
        const valorCanc = parseMoneyValue(row['Valor  cancelado'] || row['Valor cancelado'] || '0');
        const valorRev = parseMoneyValue(row['Valor revertido'] || '0');

        summary.valorTotal += valorSolicitado;
        summary.valorCancelado += valorCanc;
        summary.valorRevertido += valorRev;

        // Causas detalhadas (para análise qualitativa)
        const causa = row['Causa'] || row['Motivo  da solicitação (ABERTURA *Hubspot)'] || '';
        const tratativa = row['Tratativa (Resumo das ações realizadas)'] || '';
        if (causa || tratativa) {
            summary.causasDetalhadas.push({
                status: status,
                motivo: motivo,
                causa: causa.substring(0, 500),
                tratativa: tratativa.substring(0, 300)
            });
        }
    });

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

// Chamar API do Claude
async function callClaudeAPI(dataSummary) {
    const prompt = buildAnalysisPrompt(dataSummary);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
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
        if (input && apiKey) {
            input.value = apiKey;
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

    apiKey = newKey;
    localStorage.setItem('anthropic_api_key', apiKey);

    updateApiStatus(true);

    // Habilitar botão se CSV já foi carregado
    const btnGenerate = document.getElementById('btnGenerate');
    if (btnGenerate && csvData) {
        btnGenerate.disabled = false;
    }

    closeConfigModal();
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
