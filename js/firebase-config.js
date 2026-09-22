/* ===================================
   Hubstrom - Firebase Configuration
   Realtime Database Integration
   =================================== */

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDpDpeaz2py6ZQEPLR3p2Bd-DCcamRcV_A",
    authDomain: "relatorio-geral.firebaseapp.com",
    projectId: "relatorio-geral",
    storageBucket: "relatorio-geral.firebasestorage.app",
    messagingSenderId: "732659776339",
    appId: "1:732659776339:web:e3f66d92fc44587be8ffa6",
    measurementId: "G-GZYHBBE0MJ",
    databaseURL: "https://relatorio-geral-default-rtdb.firebaseio.com"
};

// Inicializar Firebase
let firebaseApp = null;
let database = null;
let firebaseReady = false;

// Inicializar quando os scripts do Firebase estiverem carregados
function initFirebase() {
    try {
        // Verificar se Firebase já foi inicializado
        if (!firebase.apps.length) {
            firebaseApp = firebase.initializeApp(firebaseConfig);
        } else {
            firebaseApp = firebase.app();
        }

        database = firebase.database();
        console.log('Firebase inicializado, aguardando estado de autenticação...');

        // onAuthStateChanged dispara com o usuário logado (sessão persistida) ou null.
        // Não fazemos mais login anônimo automático — o acesso real aos dados
        // é decidido pelas Realtime Database Rules com base em auth.uid.
        firebase.auth().onAuthStateChanged((user) => {
            if (firebaseReady) return; // já inicializado
            firebaseReady = true;

            console.log(user ? 'Firebase pronto (sessão autenticada).' : 'Firebase pronto (sem sessão).');

            window.dispatchEvent(new CustomEvent('firebaseReady'));

            if (user) {
                syncAppSettingsFromFirebase().then(() => listenToAppSettings());
            }
        });

        return true;
    } catch (error) {
        console.error('Erro ao inicializar Firebase:', error);
        firebaseReady = false;
        return false;
    }
}

// Verificar se Firebase está pronto
function isFirebaseReady() {
    return firebaseReady && database !== null;
}

// ==========================================
// FUNÇÕES DO REALTIME DATABASE
// ==========================================

// Salvar dados de um mês no Firebase
async function saveMonthDataToFirebase(monthKey, data) {
    if (!isFirebaseReady()) {
        console.warn('Firebase não está pronto. Salvando localmente...');
        return false;
    }

    try {
        // Sanitizar a chave do mês para ser válida no Firebase (não pode ter . # $ [ ] /)
        const safeKey = monthKey.replace(/[.#$[\]/]/g, '_');

        // Preparar dados para salvar (remover dados muito grandes se necessário)
        const dataToSave = {
            savedAt: new Date().toISOString(),
            summary: data.summary || null,
            kpis: data.kpis || null,
            sections: data.sections || null,
            chartsData: data.chartsData || null,
            // csvData pode ser grande, vamos comprimir ou limitar
            csvDataCount: data.csvData ? data.csvData.length : 0,
            csvData: data.csvData || null
        };

        await database.ref(`cancelamentos/${safeKey}`).set(dataToSave);
        console.log('Dados salvos no Firebase:', monthKey);
        return true;
    } catch (error) {
        console.error('Erro ao salvar no Firebase:', error);
        return false;
    }
}

// Buscar dados de um mês do Firebase
async function getMonthDataFromFirebase(monthKey) {
    if (!isFirebaseReady()) {
        console.warn('Firebase não está pronto.');
        return null;
    }

    try {
        const safeKey = monthKey.replace(/[.#$[\]/]/g, '_');
        const snapshot = await database.ref(`cancelamentos/${safeKey}`).once('value');

        if (snapshot.exists()) {
            console.log('Dados carregados do Firebase:', monthKey);
            return snapshot.val();
        }
        return null;
    } catch (error) {
        console.error('Erro ao buscar do Firebase:', error);
        return null;
    }
}

// Listar todos os meses com dados no Firebase
async function getHistoryMonthsFromFirebase() {
    if (!isFirebaseReady()) {
        console.warn('Firebase não está pronto.');
        return [];
    }

    try {
        const snapshot = await database.ref('cancelamentos').once('value');

        if (snapshot.exists()) {
            const data = snapshot.val();
            // Converter chaves de volta para formato original e ordenar
            const months = Object.keys(data)
                .map(key => key.replace(/_/g, '-'))
                .sort()
                .reverse();
            console.log('Meses encontrados no Firebase:', months);
            return months;
        }
        return [];
    } catch (error) {
        console.error('Erro ao listar meses do Firebase:', error);
        return [];
    }
}

// Deletar dados de um mês do Firebase
async function deleteMonthDataFromFirebase(monthKey) {
    if (!isFirebaseReady()) {
        console.warn('Firebase não está pronto.');
        return false;
    }

    try {
        const safeKey = monthKey.replace(/[.#$[\]/]/g, '_');
        await database.ref(`cancelamentos/${safeKey}`).remove();
        console.log('Dados deletados do Firebase:', monthKey);
        return true;
    } catch (error) {
        console.error('Erro ao deletar do Firebase:', error);
        return false;
    }
}

// Verificar se há dados para um mês específico
async function hasDataForMonthInFirebase(monthKey) {
    if (!isFirebaseReady()) {
        return false;
    }

    try {
        const safeKey = monthKey.replace(/[.#$[\]/]/g, '_');
        const snapshot = await database.ref(`cancelamentos/${safeKey}`).once('value');
        return snapshot.exists();
    } catch (error) {
        console.error('Erro ao verificar dados:', error);
        return false;
    }
}

// ==========================================
// FUNÇÕES DE HISTÓRICO DE VERSÕES
// ==========================================

// Salvar versão atual no histórico antes de atualizar
async function saveToHistory(monthKey) {
    if (!isFirebaseReady()) {
        console.warn('Firebase não está pronto para salvar histórico.');
        return false;
    }

    try {
        const safeKey = monthKey.replace(/[.#$[\]/]/g, '_');

        // Buscar dados atuais
        const snapshot = await database.ref(`cancelamentos/${safeKey}`).once('value');

        if (!snapshot.exists()) {
            console.log('Nenhum dado existente para salvar no histórico');
            return true; // Não é erro, apenas não há dados para backup
        }

        const currentData = snapshot.val();

        // Criar timestamp único para a versão
        const timestamp = Date.now();
        const versionKey = `v_${timestamp}`;

        // Preparar dados do histórico
        const historyEntry = {
            ...currentData,
            versionTimestamp: timestamp,
            versionDate: new Date().toISOString(),
            restoredFrom: null
        };

        // Salvar no histórico
        await database.ref(`cancelamentos_history/${safeKey}/${versionKey}`).set(historyEntry);

        console.log(`Versão salva no histórico: ${monthKey} - ${versionKey}`);
        return true;
    } catch (error) {
        console.error('Erro ao salvar no histórico:', error);
        return false;
    }
}

// Buscar lista de versões do histórico para um mês
async function getHistoryVersions(monthKey) {
    if (!isFirebaseReady()) {
        console.warn('Firebase não está pronto.');
        return [];
    }

    try {
        const safeKey = monthKey.replace(/[.#$[\]/]/g, '_');
        const snapshot = await database.ref(`cancelamentos_history/${safeKey}`)
            .orderByChild('versionTimestamp')
            .once('value');

        if (!snapshot.exists()) {
            return [];
        }

        const versions = [];
        snapshot.forEach((childSnapshot) => {
            const data = childSnapshot.val();
            versions.push({
                key: childSnapshot.key,
                timestamp: data.versionTimestamp,
                date: data.versionDate || data.savedAt,
                kpis: data.kpis,
                summary: data.summary
            });
        });

        // Ordenar do mais recente para o mais antigo
        versions.sort((a, b) => b.timestamp - a.timestamp);

        console.log(`${versions.length} versões encontradas para ${monthKey}`);
        return versions;
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        return [];
    }
}

// Buscar dados de uma versão específica do histórico
async function getHistoryVersion(monthKey, versionKey) {
    if (!isFirebaseReady()) {
        console.warn('Firebase não está pronto.');
        return null;
    }

    try {
        const safeKey = monthKey.replace(/[.#$[\]/]/g, '_');
        const snapshot = await database.ref(`cancelamentos_history/${safeKey}/${versionKey}`).once('value');

        if (snapshot.exists()) {
            return snapshot.val();
        }
        return null;
    } catch (error) {
        console.error('Erro ao buscar versão do histórico:', error);
        return null;
    }
}

// Restaurar uma versão do histórico (substitui dados atuais)
async function restoreFromHistory(monthKey, versionKey) {
    if (!isFirebaseReady()) {
        console.warn('Firebase não está pronto.');
        return false;
    }

    try {
        // Primeiro, salvar versão atual no histórico
        await saveToHistory(monthKey);

        // Buscar dados da versão a restaurar
        const versionData = await getHistoryVersion(monthKey, versionKey);

        if (!versionData) {
            console.error('Versão não encontrada:', versionKey);
            return false;
        }

        const safeKey = monthKey.replace(/[.#$[\]/]/g, '_');

        // Atualizar dados atuais com a versão restaurada
        const restoredData = {
            ...versionData,
            savedAt: new Date().toISOString(),
            restoredFrom: versionKey,
            restoredAt: new Date().toISOString()
        };

        await database.ref(`cancelamentos/${safeKey}`).set(restoredData);

        console.log(`Versão ${versionKey} restaurada com sucesso para ${monthKey}`);
        return true;
    } catch (error) {
        console.error('Erro ao restaurar versão:', error);
        return false;
    }
}

// Deletar uma versão específica do histórico
async function deleteHistoryVersion(monthKey, versionKey) {
    if (!isFirebaseReady()) {
        return false;
    }

    try {
        const safeKey = monthKey.replace(/[.#$[\]/]/g, '_');
        await database.ref(`cancelamentos_history/${safeKey}/${versionKey}`).remove();
        console.log(`Versão ${versionKey} deletada do histórico`);
        return true;
    } catch (error) {
        console.error('Erro ao deletar versão:', error);
        return false;
    }
}

// Limpar histórico antigo (manter apenas últimas N versões)
async function cleanOldHistory(monthKey, keepCount = 10) {
    if (!isFirebaseReady()) {
        return false;
    }

    try {
        const versions = await getHistoryVersions(monthKey);

        if (versions.length <= keepCount) {
            return true; // Nada para limpar
        }

        // Deletar versões mais antigas
        const toDelete = versions.slice(keepCount);
        const safeKey = monthKey.replace(/[.#$[\]/]/g, '_');

        for (const version of toDelete) {
            await database.ref(`cancelamentos_history/${safeKey}/${version.key}`).remove();
        }

        console.log(`${toDelete.length} versões antigas removidas de ${monthKey}`);
        return true;
    } catch (error) {
        console.error('Erro ao limpar histórico:', error);
        return false;
    }
}

// Sincronizar dados locais para o Firebase (migração)
async function syncLocalToFirebase() {
    const localHistory = localStorage.getItem('hubstrom_cancelamentos_history');
    if (!localHistory) {
        console.log('Nenhum dado local para sincronizar.');
        return;
    }

    try {
        const history = JSON.parse(localHistory);
        const months = Object.keys(history);

        console.log(`Sincronizando ${months.length} meses para o Firebase...`);

        for (const month of months) {
            await saveMonthDataToFirebase(month, history[month]);
        }

        console.log('Sincronização concluída!');
        showNotification(`${months.length} meses sincronizados com o Firebase!`, 'success');
    } catch (error) {
        console.error('Erro na sincronização:', error);
    }
}

// Escutar mudanças em tempo real (opcional)
function listenToChanges(callback) {
    if (!isFirebaseReady()) {
        return null;
    }

    return database.ref('cancelamentos').on('value', (snapshot) => {
        if (callback && typeof callback === 'function') {
            callback(snapshot.val());
        }
    });
}

// Parar de escutar mudanças
function stopListening() {
    if (isFirebaseReady()) {
        database.ref('cancelamentos').off();
    }
}

// ==========================================
// FUNÇÕES DE CONFIGURAÇÕES DO APP
// Salva configurações no Firebase para que
// todos os usuários possam acessar
// ==========================================

// Salvar configuração do Google Sheets no Firebase
async function saveSheetsConfigToFirebase(config) {
    if (!isFirebaseReady()) {
        console.warn('Firebase não está pronto. Salvando config apenas localmente...');
        return false;
    }

    try {
        await database.ref('app_settings/sheets_config').set({
            ...config,
            updatedAt: new Date().toISOString()
        });
        console.log('Configuração do Sheets salva no Firebase');
        return true;
    } catch (error) {
        console.error('Erro ao salvar config do Sheets no Firebase:', error);
        return false;
    }
}

// Buscar configuração do Google Sheets do Firebase
async function getSheetsConfigFromFirebase() {
    if (!isFirebaseReady()) {
        console.warn('Firebase não está pronto.');
        return null;
    }

    try {
        const snapshot = await database.ref('app_settings/sheets_config').once('value');
        if (snapshot.exists()) {
            console.log('Configuração do Sheets carregada do Firebase');
            return snapshot.val();
        }
        return null;
    } catch (error) {
        console.error('Erro ao buscar config do Sheets do Firebase:', error);
        return null;
    }
}

// Carregar todas as configurações do Firebase para localStorage (sincronização inicial)
async function syncAppSettingsFromFirebase() {
    if (!isFirebaseReady()) {
        console.log('Firebase não pronto para sincronizar configurações');
        return;
    }

    try {
        // Sincronizar configuração do Sheets
        const sheetsConfig = await getSheetsConfigFromFirebase();
        if (sheetsConfig) {
            localStorage.setItem('hubstrom_sheets_config', JSON.stringify(sheetsConfig));
            console.log('Config do Sheets sincronizada do Firebase para localStorage');
            // Atualizar status na UI se a função existir
            if (typeof updateSyncStatus === 'function') {
                updateSyncStatus();
            }
        }

        // Sincronizar GID do Comercial
        const comercialGid = await getComercialGidFromFirebase();
        if (comercialGid) {
            localStorage.setItem('comercial_gid', comercialGid);
            console.log('GID Comercial sincronizado do Firebase para localStorage');
        }

        console.log('Configurações do app sincronizadas do Firebase');
    } catch (error) {
        console.error('Erro ao sincronizar configurações:', error);
    }
}

// Salvar GID do Comercial no Firebase
async function saveComercialGidToFirebase(gid) {
    if (!isFirebaseReady()) {
        console.warn('Firebase não pronto para salvar GID Comercial');
        return false;
    }
    try {
        await database.ref('app_settings/comercial_gid').set({ gid: gid, updatedAt: new Date().toISOString() });
        localStorage.setItem('comercial_gid', gid);
        console.log('GID Comercial salvo no Firebase:', gid);
        return true;
    } catch (error) {
        console.error('Erro ao salvar GID Comercial no Firebase:', error);
        return false;
    }
}

// Buscar GID do Comercial do Firebase
async function getComercialGidFromFirebase() {
    if (!isFirebaseReady()) return null;
    try {
        const snapshot = await database.ref('app_settings/comercial_gid').once('value');
        if (snapshot.exists()) {
            const data = snapshot.val();
            return data.gid || null;
        }
        return null;
    } catch (error) {
        console.error('Erro ao buscar GID Comercial do Firebase:', error);
        return null;
    }
}

// Escutar mudanças nas configurações em tempo real
function listenToAppSettings() {
    if (!isFirebaseReady()) {
        return;
    }

    // Escutar mudanças na config do Sheets
    database.ref('app_settings/sheets_config').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            localStorage.setItem('hubstrom_sheets_config', JSON.stringify(data));
            console.log('Config do Sheets atualizada em tempo real do Firebase');
            if (typeof updateSyncStatus === 'function') {
                updateSyncStatus();
            }
        }
    });

    // Escutar mudanças no GID do Comercial
    database.ref('app_settings/comercial_gid').on('value', (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            if (data.gid) {
                const currentGid = localStorage.getItem('comercial_gid');
                if (currentGid !== data.gid) {
                    localStorage.setItem('comercial_gid', data.gid);
                    console.log('GID Comercial atualizado em tempo real do Firebase');
                    const gidInput = document.getElementById('comercialGidInput');
                    if (gidInput) gidInput.value = data.gid;
                }
            }
        }
    });

    console.log('Escutando mudanças nas configurações do app');
}

// ==========================================
// GERENCIAMENTO DE USUÁRIOS
// ==========================================

// Buscar o perfil (role/allowedPages/displayName) de um usuário pelo UID do Firebase Auth.
// Protegido pelas Database Rules: o próprio usuário só lê o seu, admin lê qualquer um.
async function getUserProfile(uid) {
    if (!isFirebaseReady()) return null;
    try {
        const snapshot = await database.ref('users/' + uid).once('value');
        return snapshot.exists() ? { id: uid, ...snapshot.val() } : null;
    } catch (error) {
        console.error('[Users] Erro ao buscar perfil:', error);
        return null;
    }
}

// Cria a conta de autenticação (Firebase Auth) via REST, sem afetar a sessão
// atual do navegador (diferente do SDK signUp, que trocaria o usuário logado).
async function createAuthAccount(email, password) {
    const resp = await fetch(
        'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + firebaseConfig.apiKey,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password, returnSecureToken: false })
        }
    );
    const data = await resp.json();
    if (!resp.ok) {
        const code = data.error && data.error.message || '';
        if (code === 'EMAIL_EXISTS') throw new Error('Já existe uma conta com esse e-mail.');
        if (code.indexOf('WEAK_PASSWORD') === 0) throw new Error('A senha deve ter pelo menos 6 caracteres.');
        if (code === 'INVALID_EMAIL') throw new Error('E-mail inválido.');
        throw new Error(code || 'Erro ao criar conta de autenticação.');
    }
    return data.localId;
}

// Buscar todos os usuários
async function getAllUsers() {
    if (!isFirebaseReady()) return [];

    try {
        const snapshot = await database.ref('users').once('value');
        if (!snapshot.exists()) return [];

        const users = [];
        snapshot.forEach(child => {
            users.push({ id: child.key, ...child.val() });
        });

        return users;
    } catch (error) {
        console.error('[Users] Erro ao listar usuários:', error);
        return [];
    }
}

// Criar novo usuário: cria a conta real no Firebase Auth (email+senha) e o perfil em /users/{uid}
async function createUser(userData) {
    if (!isFirebaseReady()) {
        console.error('[Users] createUser: Firebase não está pronto');
        throw new Error('Firebase não está pronto. Recarregue a página e tente novamente.');
    }

    try {
        const uid = await createAuthAccount(userData.email, userData.password);

        const profile = {
            email: userData.email,
            displayName: userData.displayName,
            role: userData.role,
            allowedPages: userData.allowedPages,
            active: true,
            createdAt: new Date().toISOString(),
            createdBy: userData.createdBy || 'unknown',
            lastLogin: null
        };

        await database.ref('users/' + uid).set(profile);

        console.log('[Users] Usuário criado:', uid);
        return uid;
    } catch (error) {
        console.error('[Users] Erro ao criar usuário:', error);
        throw error;
    }
}

// Atualizar usuário existente
async function updateUser(userId, updates) {
    if (!isFirebaseReady()) return false;

    try {
        await database.ref(`users/${userId}`).update({
            ...updates,
            updatedAt: new Date().toISOString()
        });

        console.log('[Users] Usuário atualizado:', userId);
        return true;
    } catch (error) {
        console.error('[Users] Erro ao atualizar usuário:', error);
        return false;
    }
}

// Excluir usuário permanentemente
async function deleteUser(userId) {
    if (!isFirebaseReady()) return false;

    try {
        await database.ref(`users/${userId}`).remove();

        console.log('[Users] Usuário excluído:', userId);
        return true;
    } catch (error) {
        console.error('[Users] Erro ao excluir usuário:', error);
        return false;
    }
}

// Atualizar último login
async function updateLastLogin(userId) {
    if (!isFirebaseReady()) return;

    try {
        await database.ref(`users/${userId}`).update({
            lastLogin: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Users] Erro ao atualizar lastLogin:', error);
    }
}

// ==========================================
// AUDITORIA - LOG DE ATIVIDADES
// ==========================================

// Registrar evento de auditoria
async function logAuditEvent(action, details = {}) {
    if (!isFirebaseReady()) return;

    try {
        // Buscar usuário da sessão
        const session = localStorage.getItem('hubstrom_auth_session');
        let userId = 'unknown';
        let displayName = 'Desconhecido';

        if (session) {
            try {
                const sessionData = JSON.parse(session);
                userId = sessionData.userId || 'unknown';
                displayName = sessionData.displayName || 'Desconhecido';
            } catch (e) { /* ignorar */ }
        }

        const logEntry = {
            timestamp: Date.now(),
            isoDate: new Date().toISOString(),
            userId: userId,
            displayName: displayName,
            action: action,
            details: details,
            userAgent: navigator.userAgent || ''
        };

        await database.ref('audit_log').push(logEntry);
    } catch (error) {
        console.error('[Audit] Erro ao registrar evento:', error);
    }
}

// Buscar logs de auditoria com filtros
async function getAuditLogs(filters = {}) {
    if (!isFirebaseReady()) return [];

    try {
        let ref = database.ref('audit_log').orderByChild('timestamp');

        const snapshot = await ref.limitToLast(filters.limit || 200).once('value');
        if (!snapshot.exists()) return [];

        const logs = [];
        snapshot.forEach(child => {
            const log = { id: child.key, ...child.val() };

            // Aplicar filtros client-side
            if (filters.userId && log.userId !== filters.userId) return;
            if (filters.action && log.action !== filters.action) return;
            if (filters.startDate && log.timestamp < filters.startDate) return;
            if (filters.endDate && log.timestamp > filters.endDate) return;

            logs.push(log);
        });

        // Ordenar do mais recente para o mais antigo
        logs.sort((a, b) => b.timestamp - a.timestamp);

        return logs;
    } catch (error) {
        console.error('[Audit] Erro ao buscar logs:', error);
        return [];
    }
}

// Chama a API da Anthropic através do proxy server-side (/api/claude), autenticado
// com o ID token do Firebase Auth do usuário atual. A chave real nunca passa pelo navegador.
async function callClaudeProxy(payload) {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Você precisa estar logado para usar a IA.');

    const idToken = await user.getIdToken();

    const response = await fetch('/api/claude', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + idToken
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error((data && data.error && (data.error.message || data.error)) || 'Erro na API');
    }
    return data;
}
window.callClaudeProxy = callClaudeProxy;

// Helper global para instrumentação fácil
window.hubstromLog = function(action, details) {
    if (isFirebaseReady()) {
        logAuditEvent(action, details);
    }
};

// Inicializar quando o DOM carregar
document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase !== 'undefined') {
        initFirebase();
    } else {
        console.warn('Firebase SDK não carregado. Usando apenas localStorage.');
    }
});
