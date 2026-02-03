/* ===================================
   Hubstrom - Integração Google Sheets
   Sincronização automática de dados
   =================================== */

// Configurações
const SHEETS_CONFIG_KEY = 'hubstrom_sheets_config';
let autoRefreshInterval = null;

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

// Salvar configuração
function saveSheetsConfig(config) {
    localStorage.setItem(SHEETS_CONFIG_KEY, JSON.stringify(config));
}

// Converter URL do Google Sheets para URL de exportação CSV
function convertToExportUrl(url, customGid = null) {
    // Formatos possíveis:
    // 1. https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0
    // 2. https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit?usp=sharing
    // 3. https://docs.google.com/spreadsheets/d/e/PUBLISHED_ID/pubhtml?gid=123&single=true (publicado)

    let spreadsheetId = null;
    let gid = customGid || '0';

    // Tentar extrair ID do formato publicado (pubhtml)
    const pubMatch = url.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (pubMatch) {
        spreadsheetId = pubMatch[1];
        // Para URLs publicadas, usar formato diferente
        const gidMatch = url.match(/gid=(\d+)/);
        if (gidMatch && !customGid) gid = gidMatch[1];

        // URL de exportação para planilhas publicadas
        return `https://docs.google.com/spreadsheets/d/e/${spreadsheetId}/pub?gid=${gid}&single=true&output=csv`;
    }

    // Tentar extrair ID do formato normal (edit)
    const editMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (editMatch) {
        spreadsheetId = editMatch[1];
        const gidMatch = url.match(/gid=(\d+)/);
        if (gidMatch && !customGid) gid = gidMatch[1];

        // URL de exportação para planilhas normais
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

// Sincronizar dados da planilha
async function syncFromSheets() {
    const config = getSheetsConfig();
    if (!config || !config.url) {
        showNotification('Configure a URL da planilha primeiro.', 'warning');
        return false;
    }

    // Mostrar indicador de loading
    const syncBtn = document.getElementById('btnSyncSheets');
    if (syncBtn) {
        syncBtn.classList.add('syncing');
        syncBtn.disabled = true;
    }

    try {
        showNotification('Sincronizando dados...', 'info');

        // Usar gid personalizado se configurado
        const customGid = config.gid && config.gid.trim() !== '' ? config.gid.trim() : null;
        const csvText = await fetchFromGoogleSheets(config.url, customGid);

        // Usar o parser existente
        window.csvData = parseCSV(csvText);

        if (window.csvData.length === 0) {
            throw new Error('Nenhum dado válido encontrado na planilha');
        }

        console.log('Dados sincronizados:', window.csvData.length, 'registros');

        // Atualizar dashboard
        const summary = prepareDataSummary(window.csvData);
        updateKPIs(summary);
        updateCharts(summary);

        // Atualizar nome do arquivo
        const csvFileName = document.getElementById('csvFileName');
        if (csvFileName) {
            csvFileName.textContent = `Planilha (${window.csvData.length} registros)`;
        }

        // Habilitar botão de análise
        const btnGenerate = document.getElementById('btnGenerate');
        if (btnGenerate && hasApiKeyConfigured()) {
            btnGenerate.disabled = false;
        }

        // Salvar última sincronização
        config.lastSync = new Date().toISOString();
        saveSheetsConfig(config);

        updateSyncStatus();

        // === AUTO-SAVE NO FIREBASE COM HISTÓRICO ===
        // Salvar automaticamente no Firebase após sincronizar (com backup no histórico)
        const currentMonth = getCurrentMonth();
        if (typeof saveCurrentDataWithHistory === 'function') {
            try {
                await saveCurrentDataWithHistory(currentMonth);
                console.log(`Dados salvos automaticamente no Firebase para ${currentMonth}`);
                showNotification(`Sincronizado e salvo! ${window.csvData.length} registros em ${formatMonthDisplay(currentMonth)}. Versão anterior salva no histórico.`, 'success');
            } catch (firebaseError) {
                console.error('Erro ao salvar no Firebase:', firebaseError);
                showNotification(`Sincronizado! ${window.csvData.length} registros (erro ao salvar no Firebase).`, 'warning');
            }
        } else if (typeof saveCurrentData === 'function') {
            // Fallback para função antiga
            try {
                await saveCurrentData(currentMonth);
                showNotification(`Sincronizado e salvo! ${window.csvData.length} registros em ${formatMonthDisplay(currentMonth)}.`, 'success');
            } catch (firebaseError) {
                console.error('Erro ao salvar no Firebase:', firebaseError);
                showNotification(`Sincronizado! ${window.csvData.length} registros (erro ao salvar no Firebase).`, 'warning');
            }
        } else {
            showNotification(`Sincronizado! ${window.csvData.length} registros carregados.`, 'success');
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
        console.log('Auto-refresh parado');
    }
}

// Atualizar status de sincronização na UI
function updateSyncStatus() {
    const config = getSheetsConfig();
    const statusEl = document.getElementById('syncStatus');

    if (!statusEl) return;

    if (config && config.lastSync) {
        const lastSync = new Date(config.lastSync);
        const now = new Date();
        const diffMinutes = Math.round((now - lastSync) / 60000);

        if (diffMinutes < 1) {
            statusEl.textContent = 'Sincronizado agora';
        } else if (diffMinutes < 60) {
            statusEl.textContent = `Sincronizado há ${diffMinutes} min`;
        } else {
            const diffHours = Math.round(diffMinutes / 60);
            statusEl.textContent = `Sincronizado há ${diffHours}h`;
        }
        statusEl.classList.add('synced');
    } else {
        statusEl.textContent = 'Não sincronizado';
        statusEl.classList.remove('synced');
    }
}

// Abrir modal de configuração do Google Sheets
function openSheetsConfigModal() {
    const modal = document.getElementById('sheetsConfigModal');
    if (!modal) return;

    const config = getSheetsConfig() || {};

    // Preencher campos
    const urlInput = document.getElementById('sheetsUrlInput');
    const gidInput = document.getElementById('sheetsGidInput');
    const intervalSelect = document.getElementById('refreshIntervalSelect');

    if (urlInput && config.url) {
        urlInput.value = config.url;
    }

    if (gidInput && config.gid) {
        gidInput.value = config.gid;
    }

    if (intervalSelect && config.refreshInterval !== undefined) {
        intervalSelect.value = config.refreshInterval;
    }

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
    const gidInput = document.getElementById('sheetsGidInput');
    const intervalSelect = document.getElementById('refreshIntervalSelect');

    const url = urlInput ? urlInput.value.trim() : '';
    const gid = gidInput ? gidInput.value.trim() : '';
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

    // Testar conexão
    const exportUrl = convertToExportUrl(url, gid || null);
    if (!exportUrl) {
        showNotification('Não foi possível processar a URL', 'error');
        return;
    }

    // Salvar configuração
    const config = {
        url: url,
        gid: gid,
        refreshInterval: refreshInterval,
        lastSync: null
    };

    saveSheetsConfig(config);

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
function removeSheetsConfiguration() {
    if (confirm('Deseja remover a configuração da planilha?')) {
        localStorage.removeItem(SHEETS_CONFIG_KEY);
        stopAutoRefresh();

        const urlInput = document.getElementById('sheetsUrlInput');
        const gidInput = document.getElementById('sheetsGidInput');
        if (urlInput) urlInput.value = '';
        if (gidInput) gidInput.value = '';

        updateSyncStatus();
        closeSheetsConfigModal();
        showNotification('Configuração removida', 'info');
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se há configuração salva
    const config = getSheetsConfig();

    if (config && config.url) {
        // Iniciar auto-refresh se configurado
        if (config.refreshInterval > 0) {
            startAutoRefresh(config.refreshInterval);
        }

        // Sincronizar ao carregar a página
        setTimeout(async () => {
            await syncFromSheets();
        }, 500);
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
