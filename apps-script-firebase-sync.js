/**
 * =====================================================
 * HUBSTROM - Google Apps Script para Firebase Real-Time
 * =====================================================
 *
 * COMO INSTALAR:
 * 1. Abra a planilha do Comercial no Google Sheets
 * 2. Vá em Extensões → Apps Script
 * 3. Cole este código inteiro no editor
 * 4. Clique em "Salvar" (ícone de disquete)
 * 5. Clique em "Executar" na função setupTrigger() UMA VEZ
 *    - Vai pedir permissão para acessar a planilha e fazer requisições externas
 *    - Aceite todas as permissões
 * 6. Pronto! Agora toda edição na planilha vai atualizar o dashboard em tempo real
 *
 * COMO FUNCIONA:
 * - Toda vez que alguém editar a planilha, o trigger onEdit dispara
 * - O script lê os dados das 3 abas (Dados, Closer, Última Venda)
 * - Envia para o Firebase Realtime Database no path comercial_live/
 * - O dashboard escuta esse path e atualiza instantaneamente
 *
 * CONFIGURAÇÃO:
 * - Altere FIREBASE_URL se o seu projeto Firebase for diferente
 * - Altere os nomes das abas se forem diferentes na sua planilha
 */

// ===================== CONFIGURAÇÃO =====================
var FIREBASE_URL = 'https://relatorio-geral-default-rtdb.firebaseio.com';
var FIREBASE_PATH = '/comercial_live.json';

// Nomes das abas na planilha (ajuste conforme necessário)
var SHEET_DADOS = 'Dados';        // Aba com KPIs (primeira aba, gid=0)
var SHEET_CLOSER = 'Closer';      // Aba com ranking dos closers
var SHEET_ULTIMA_VENDA = 'última venda'; // Aba com última venda

// ===================== TRIGGER SETUP =====================

/**
 * Executar UMA VEZ para criar o trigger automático.
 * Vai em Executar → setupTrigger
 */
function setupTrigger() {
  // Remover triggers antigos para evitar duplicatas
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onSheetEdit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Criar novo trigger onChange (detecta edições, inclusive de fórmulas)
  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onChange()
    .create();

  // Criar trigger onEdit para edições diretas do usuário
  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  Logger.log('Triggers criados com sucesso!');
  SpreadsheetApp.getUi().alert('Triggers instalados com sucesso! O dashboard vai atualizar em tempo real.');
}

// ===================== MAIN FUNCTION =====================

/**
 * Disparada automaticamente quando a planilha é editada.
 * Lê todos os dados e envia para o Firebase.
 */
function onSheetEdit(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Ler dados da aba Dados (KPIs)
    var kpis = readKPIs(ss);

    // Ler dados da aba Closer (ranking)
    var closers = readClosers(ss);

    // Ler dados da aba Última Venda
    var ultimaVenda = readUltimaVenda(ss);

    // Montar payload
    var payload = {
      kpis: kpis,
      closers: closers,
      ultimaVenda: ultimaVenda,
      updatedAt: Date.now(),
      updatedISO: new Date().toISOString(),
      source: 'apps_script'
    };

    // Enviar para Firebase (real-time)
    sendToFirebase(payload);

    // Salvar snapshot mensal (histórico)
    saveMonthlySnapshot(payload);

    Logger.log('Dados enviados para Firebase com sucesso!');
  } catch (error) {
    Logger.log('Erro ao sincronizar: ' + error.message);
  }
}

// ===================== DATA READERS =====================

/**
 * Lê os KPIs da aba Dados.
 * Espera headers na linha 1 e valores na linha 2.
 */
function readKPIs(ss) {
  var sheet = ss.getSheetByName(SHEET_DADOS);
  if (!sheet) {
    Logger.log('Aba "' + SHEET_DADOS + '" não encontrada');
    return {};
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var values = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];

  var kpis = {};
  for (var i = 0; i < headers.length; i++) {
    if (headers[i]) {
      kpis[headers[i].toString().trim()] = values[i] ? values[i].toString().trim() : '';
    }
  }

  return kpis;
}

/**
 * Lê os closers da aba Closer.
 * Espera: Nome | Taxa Conversão | Total Vendas | Foto URL | Pendente
 */
function readClosers(ss) {
  var sheet = ss.getSheetByName(SHEET_CLOSER);
  if (!sheet) {
    Logger.log('Aba "' + SHEET_CLOSER + '" não encontrada');
    return [];
  }

  var data = sheet.getDataRange().getDisplayValues();
  var closers = [];

  // Pular header (linha 1), começar da linha 2
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) { // Se tem nome
      closers.push({
        nome: data[i][0].toString().trim(),
        taxaConversao: data[i][1] ? data[i][1].toString().trim() : '0%',
        totalVendas: data[i][2] ? data[i][2].toString().trim() : 'R$ 0,00',
        foto: data[i][3] ? data[i][3].toString().trim() : '',
        pendente: data[i][4] ? data[i][4].toString().trim() : ''
      });
    }
  }

  return closers;
}

/**
 * Lê a última venda da aba Última Venda.
 * Espera: Closer | Foto URL | Valor
 */
function readUltimaVenda(ss) {
  var sheet = ss.getSheetByName(SHEET_ULTIMA_VENDA);
  if (!sheet) {
    Logger.log('Aba "' + SHEET_ULTIMA_VENDA + '" não encontrada');
    return null;
  }

  var data = sheet.getDataRange().getDisplayValues();
  if (data.length < 2) return null;

  return {
    closer: data[1][0] ? data[1][0].toString().trim() : '',
    foto: data[1][1] ? data[1][1].toString().trim() : '',
    valor: data[1][2] ? data[1][2].toString().trim() : ''
  };
}

// ===================== FIREBASE SENDER =====================

/**
 * Envia dados para o Firebase Realtime Database via REST API.
 */
function sendToFirebase(data) {
  var url = FIREBASE_URL + FIREBASE_PATH;

  var options = {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();

  if (code !== 200) {
    Logger.log('Erro Firebase HTTP ' + code + ': ' + response.getContentText());
    throw new Error('Firebase retornou HTTP ' + code);
  }
}

// ===================== MONTHLY SNAPSHOT =====================

/**
 * Salva snapshot mensal no Firebase para histórico.
 * Path: comercial_history/{YYYY-MM}
 */
function saveMonthlySnapshot(data) {
  var now = new Date();
  var year = now.getFullYear();
  var month = (now.getMonth() + 1).toString().padStart(2, '0');
  var monthKey = year + '-' + month;

  var url = FIREBASE_URL + '/comercial_history/' + monthKey + '.json';

  var snapshot = {
    kpis: data.kpis,
    closers: data.closers,
    ultimaVenda: data.ultimaVenda,
    savedAt: Date.now(),
    savedISO: now.toISOString()
  };

  var options = {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(snapshot),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() === 200) {
    Logger.log('Snapshot mensal salvo: ' + monthKey);
  }
}

// ===================== MANUAL SYNC =====================

/**
 * Função para sincronização manual.
 * Pode ser executada direto do Apps Script ou via menu customizado.
 */
function manualSync() {
  onSheetEdit(null);
  SpreadsheetApp.getUi().alert('Dados sincronizados com o dashboard!');
}

/**
 * Cria um menu customizado na planilha.
 * Executar UMA VEZ ou será criado automaticamente ao abrir a planilha.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Hubstrom Dashboard')
    .addItem('Sincronizar agora', 'manualSync')
    .addItem('Configurar triggers', 'setupTrigger')
    .addToUi();
}
