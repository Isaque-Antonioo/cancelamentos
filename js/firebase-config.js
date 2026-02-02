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
        firebaseReady = true;
        console.log('Firebase inicializado com sucesso!');

        // Disparar evento customizado para notificar outros scripts
        window.dispatchEvent(new CustomEvent('firebaseReady'));

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

// Inicializar quando o DOM carregar
document.addEventListener('DOMContentLoaded', () => {
    // Aguardar um momento para garantir que os scripts do Firebase carregaram
    setTimeout(() => {
        if (typeof firebase !== 'undefined') {
            initFirebase();
        } else {
            console.warn('Firebase SDK não carregado. Usando apenas localStorage.');
        }
    }, 100);
});
