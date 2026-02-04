/* ===================================
   Hubstrom - Integração Google Sheets
   Sincronização automática de dados
   Suporte a múltiplas abas por mês
   =================================== */

// Configurações
const SHEETS_CONFIG_KEY = 'hubstrom_sheets_config';
let autoRefreshInterval = null;

// Mapeamento de meses para nomes em português (usado para identificar abas)
const MONTH_NAMES_PT = {
    '01': 'Janeiro',
    '02': 'Fevereiro',
    '03': 'Março',
    '04': 'Abril',
    '05': 'Maio',
    '06': 'Junho',
    '07': 'Julho',
    '08': 'Agosto',
    '09': 'Setembro',
    '10': 'Outubro',
    '11': 'Novembro',
    '12': 'Dezembro'
};

// Obter configuração salva
function getSheetsConfig() {
    const config = localStorage.getItem(SHEETS_CONFIG_KEY);
    if (!config) return null;

    try {
        return JSON.parse(config);
    } catch (e) {
        return null;
    }
}

// Salvar configuração (localStorage + Firebase)
async function saveSheetsConfig(config) {
    // Salvar no localStorage para acesso imediato
    localStorage.setItem(SHEETS_CONFIG_KEY, JSON.stringify(config));

    // Salvar no Firebase para compartilhar com todos os usuários
    if (typeof saveSheetsConfigToFirebase === 'function') {
        try {
            await saveSheetsConfigToFirebase(config);
            console.log('Configuração do Sheets também salva no Firebase');
        } catch (error) {
            console.warn('Não foi possível salvar config no Firebase:', error);
        }
    }
}

// Obter gid para um mês específico
function getGidForMonth(monthKey) {
    const config = getSheetsConfig();
    if (!config || !config.monthGids) return null;

    // monthKey formato: 2025-01
    const [year, month] = monthKey.split('-');
    const monthName = MONTH_NAMES_PT[month];

    // Procurar pelo nome do mês (case insensitive)
    for (const [name, gid] of Object.entries(config.monthGids)) {
        if (name.toLowerCase() === monthName.toLowerCase()) {
            return gid;
        }
    }

    return null;
}

// Converter URL do Google Sheets para URL de exportação CSV
function convertToExportUrl(url, customGid = null) {
    let spreadsheetId = null;
    let gid = customGid || '0';

    // Tentar extrair ID do formato publicado (pubhtml)
    const pubMatch = url.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (pubMatch) {
        spreadsheetId = pubMatch[1];
        const gidMatch = url.match(/gid=(\d+)/);
        if (gidMatch && !customGid) gid = gidMatch[1];
        return `https://docs.google.com/spreadsheets/d/e/${spreadsheetId}/pub?gid=${gid}&single=true&output=csv`;
    }

    // Tentar extrair ID do formato normal (edit)
    const editMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (editMatch) {
        spreadsheetId = editMatch[1];
        const gidMatch = url.match(/gid=(\d+)/);
        if (gidMatch && !customGid) gid = gidMatch[1];
        return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
    }

    return null;
}

// Buscar dados do Google Sheets
async function fetchFromGoogleSheets(url, customGid = null) {
    const exportUrl = convertToExportUrl(url, customGid);
    if (!exportUrl) {
        throw new Error('URL do Google Sheets inválida');
    }

    try {
        const response = await fetch(exportUrl);

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                throw new Error('Planilha não está pública. Publique na web: Arquivo > Compartilhar > Publicar na web');
            }
            throw new Error(`Erro ao acessar planilha: ${response.status}`);
        }

        const csvText = await response.text();
        return csvText;
    } catch (error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
            throw new Error('Erro de acesso. Verifique se a planilha está publicada na web.');
        }
        throw error;
    }
}

// Sincronizar dados da planilha para o mês selecionado
async function syncFromSheets() {
    const config = getSheetsConfig();
    if (!config || !config.url) {
        showNotification('Configure a URL da planilha primeiro.', 'warning');
        openSheetsConfigModal();
        return false;
    }

    // Obter mês atual selecionado
    const currentMonth = getCurrentMonth();
    const [year, month] = currentMonth.split('-');
    const monthName = MONTH_NAMES_PT[month];

    // Obter gid para o mês selecionado
    const monthGid = getGidForMonth(currentMonth);

    if (!monthGid && config.monthGids && Object.keys(config.monthGids).length > 0) {
        showNotification(`Aba "${monthName}" não configurada. Configure o gid nas configurações.`, 'warning');
        openSheetsConfigModal();
        return false;
    }

    // Mostrar indicador de loading
    const syncBtn = document.getElementById('btnSyncSheets');
    if (syncBtn) {
        syncBtn.classList.add('syncing');
        syncBtn.disabled = true;
    }

    try {
        showNotification(`Sincronizando ${monthName}...`, 'info');

        // Usar gid do mês ou gid padrão
        const gidToUse = monthGid || config.gid || null;
        console.log(`Sincronizando ${monthName} com gid: ${gidToUse}`);

        const csvText = await fetchFromGoogleSheets(config.url, gidToUse);
        console.log(`CSV recebido: ${csvText.length} caracteres`);
        console.log(`Primeiras 500 chars:`, csvText.substring(0, 500));

        // Usar o parser existente
        window.csvData = parseCSV(csvText);
        console.log(`Dados parseados: ${window.csvData.length} registros`);

        if (window.csvData.length === 0) {
            console.error('Nenhum dado encontrado. CSV raw:', csvText.substring(0, 1000));
            throw new Error(`Nenhum dado válido encontrado na aba ${monthName}. Verifique se a planilha tem dados.`);
        }

        console.log(`Dados sincronizados de ${monthName}:`, window.csvData.length, 'registros');

        // Atualizar dashboard
        const summary = prepareDataSummary(window.csvData);
        updateKPIs(summary);
        updateCharts(summary);

        // Habilitar botão de análise
        const btnGenerate = document.getElementById('btnGenerate');
        if (btnGenerate && hasApiKeyConfigured()) {
            btnGenerate.disabled = false;
        }

        // Salvar última sincronização
        config.lastSync = new Date().toISOString();
        config.lastSyncMonth = currentMonth;
        await saveSheetsConfig(config);

        updateSyncStatus();

        // === AUTO-SAVE NO FIREBASE COM HISTÓRICO ===
        if (typeof saveCurrentDataWithHistory === 'function') {
            try {
                await saveCurrentDataWithHistory(currentMonth);
                console.log(`Dados salvos automaticamente no Firebase para ${currentMonth}`);
                showNotification(`${monthName}: ${window.csvData.length} registros sincronizados e salvos!`, 'success');
            } catch (firebaseError) {
                console.error('Erro ao salvar no Firebase:', firebaseError);
                showNotification(`${monthName}: Sincronizado! (erro ao salvar no Firebase)`, 'warning');
            }
        } else if (typeof saveCurrentData === 'function') {
            try {
                await saveCurrentData(currentMonth);
                showNotification(`${monthName}: ${window.csvData.length} registros sincronizados e salvos!`, 'success');
            } catch (firebaseError) {
                console.error('Erro ao salvar no Firebase:', firebaseError);
                showNotification(`${monthName}: Sincronizado! (erro ao salvar no Firebase)`, 'warning');
            }
        } else {
            showNotification(`${monthName}: ${window.csvData.length} registros carregados.`, 'success');
        }

        // Atualizar seletor de meses
        if (typeof initMonthSelector === 'function') {
            await initMonthSelector();
        }

        return true;
    } catch (error) {
        console.error('Erro ao sincronizar:', error);
        showNotification(error.message, 'error');
        return false;
    } finally {
        if (syncBtn) {
            syncBtn.classList.remove('syncing');
            syncBtn.disabled = false;
        }
    }
}

// Iniciar auto-refresh
function startAutoRefresh(intervalMinutes) {
    stopAutoRefresh();
    if (intervalMinutes <= 0) return;

    const intervalMs = intervalMinutes * 60 * 1000;
    autoRefreshInterval = setInterval(async () => {
        console.log('Auto-refresh: sincronizando...');
        await syncFromSheets();
    }, intervalMs);

    console.log(`Auto-refresh iniciado: a cada ${intervalMinutes} minutos`);
}

// Parar auto-refresh
function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Atualizar status de sincronização na UI
function updateSyncStatus() {
    const config = getSheetsConfig();
    const statusEl = document.getElementById('syncStatus');

    if (!statusEl) return;

    if (config && config.url) {
        if (config.lastSync) {
            const lastSync = new Date(config.lastSync);
            const now = new Date();
            const diffMinutes = Math.round((now - lastSync) / 60000);

            if (diffMinutes < 1) {
                statusEl.textContent = 'Sincronizado agora';
            } else if (diffMinutes < 60) {
                statusEl.textContent = `Há ${diffMinutes} min`;
            } else {
                const diffHours = Math.round(diffMinutes / 60);
                statusEl.textContent = `Há ${diffHours}h`;
            }
            statusEl.classList.add('synced');
        } else {
            statusEl.textContent = 'Configurado';
            statusEl.classList.remove('synced');
        }
    } else {
        statusEl.textContent = 'Não configurado';
        statusEl.classList.remove('synced');
    }
}

// Abrir modal de configuração do Google Sheets
function openSheetsConfigModal() {
    const modal = document.getElementById('sheetsConfigModal');
    if (!modal) return;

    const config = getSheetsConfig() || {};

    // Preencher URL
    const urlInput = document.getElementById('sheetsUrlInput');
    if (urlInput && config.url) {
        urlInput.value = config.url;
    }

    // Preencher intervalo de atualização
    const intervalSelect = document.getElementById('refreshIntervalSelect');
    if (intervalSelect && config.refreshInterval !== undefined) {
        intervalSelect.value = config.refreshInterval;
    }

    // Preencher gids dos meses
    const monthGids = config.monthGids || {};
    Object.keys(MONTH_NAMES_PT).forEach(monthNum => {
        const monthName = MONTH_NAMES_PT[monthNum];
        const input = document.getElementById(`gid_${monthName}`);
        if (input && monthGids[monthName]) {
            input.value = monthGids[monthName];
        }
    });

    modal.style.display = 'flex';
}

// Fechar modal de configuração
function closeSheetsConfigModal() {
    const modal = document.getElementById('sheetsConfigModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Salvar configuração do Google Sheets
async function saveSheetsConfiguration() {
    const urlInput = document.getElementById('sheetsUrlInput');
    const intervalSelect = document.getElementById('refreshIntervalSelect');

    const url = urlInput ? urlInput.value.trim() : '';
    const refreshInterval = intervalSelect ? parseInt(intervalSelect.value) : 0;

    if (!url) {
        showNotification('Informe a URL da planilha', 'warning');
        return;
    }

    // Validar URL
    if (!url.includes('docs.google.com/spreadsheets')) {
        showNotification('URL inválida. Use o link do Google Sheets.', 'error');
        return;
    }

    // Coletar gids dos meses
    const monthGids = {};
    Object.keys(MONTH_NAMES_PT).forEach(monthNum => {
        const monthName = MONTH_NAMES_PT[monthNum];
        const input = document.getElementById(`gid_${monthName}`);
        if (input && input.value.trim()) {
            monthGids[monthName] = input.value.trim();
        }
    });

    // Verificar se pelo menos um mês foi configurado
    if (Object.keys(monthGids).length === 0) {
        showNotification('Configure pelo menos um mês com seu gid', 'warning');
        return;
    }

    // Salvar configuração
    const config = {
        url: url,
        monthGids: monthGids,
        refreshInterval: refreshInterval,
        lastSync: null
    };

    await saveSheetsConfig(config);

    // Configurar auto-refresh
    if (refreshInterval > 0) {
        startAutoRefresh(refreshInterval);
    } else {
        stopAutoRefresh();
    }

    closeSheetsConfigModal();

    // Sincronizar imediatamente
    showNotification('Configuração salva! Sincronizando...', 'success');
    await syncFromSheets();
}

// Remover configuração do Google Sheets
async function removeSheetsConfiguration() {
    if (confirm('Deseja remover a configuração da planilha?')) {
        localStorage.removeItem(SHEETS_CONFIG_KEY);
        stopAutoRefresh();

        // Remover do Firebase também
        if (typeof database !== 'undefined' && database) {
            try {
                await database.ref('app_settings/sheets_config').remove();
                console.log('Configuração do Sheets removida do Firebase');
            } catch (error) {
                console.warn('Erro ao remover config do Firebase:', error);
            }
        }

        // Limpar campos
        const urlInput = document.getElementById('sheetsUrlInput');
        if (urlInput) urlInput.value = '';

        Object.keys(MONTH_NAMES_PT).forEach(monthNum => {
            const monthName = MONTH_NAMES_PT[monthNum];
            const input = document.getElementById(`gid_${monthName}`);
            if (input) input.value = '';
        });

        updateSyncStatus();
        closeSheetsConfigModal();
        showNotification('Configuração removida', 'info');
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    const config = getSheetsConfig();

    if (config && config.url) {
        // Iniciar auto-refresh se configurado
        if (config.refreshInterval > 0) {
            startAutoRefresh(config.refreshInterval);
        }
    }

    updateSyncStatus();

    // Atualizar status a cada minuto
    setInterval(updateSyncStatus, 60000);
});

// Fechar modal clicando fora
document.addEventListener('click', (e) => {
    const modal = document.getElementById('sheetsConfigModal');
    if (e.target === modal) {
        closeSheetsConfigModal();
    }
});
