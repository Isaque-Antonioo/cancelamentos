/**
 * =====================================================
 * HUBSTROM - Apps Script: Análise Comercial → Firebase
 * =====================================================
 *
 * Script dedicado à sincronização das negociações para o
 * dashboard de Análise Comercial. Completamente separado
 * do script do comercial (comercial_live) para não interferir.
 *
 * COMO INSTALAR:
 * 1. Abra a planilha de Negociações no Google Sheets
 * 2. Vá em Extensões → Apps Script
 * 3. Cole este código inteiro no editor
 * 4. Clique em "Salvar" (ícone de disquete)
 * 5. Selecione "setupTrigger" no dropdown e clique em Executar UMA VEZ
 *    - Aceite todas as permissões solicitadas
 * 6. Pronto! Toda edição na planilha atualiza o dashboard em tempo real
 *
 * COMO FUNCIONA:
 * - Toda edição na planilha dispara o trigger
 * - Lê todos os registros da aba de Negociações
 * - Coluna K (Obs) = motivo de desistência (preenchida nos Desistentes)
 * - Envia para Firebase no path: analise_comercial_live/
 * - O dashboard Análise Comercial escuta esse path em tempo real
 *
 * CONFIGURAÇÃO:
 * - FIREBASE_URL: altere se o seu projeto Firebase for diferente
 * - SHEET_NAME: nome exato da aba com as negociações
 * - COL_OBS_INDEX: índice da coluna Obs (K = 10, base 0)
 */

// ===================== CONFIGURAÇÃO =====================
var FIREBASE_URL    = 'https://relatorio-geral-default-rtdb.firebaseio.com';
var FIREBASE_PATH   = '/analise_comercial_live.json';

// Nome da aba com as negociações (ajuste se necessário)
var SHEET_NAME = 'Negociações';

// Coluna Obs: índice 0-based. Coluna K = 10.
// Usada como fallback se o cabeçalho "Obs" não for encontrado.
var COL_OBS_INDEX = 10;

var LOG_PATH = '/sync_log.json';

function logEntry(level, funcName, msg, detail) {
  try {
    var entry = {
      t:      Date.now(),
      iso:    new Date().toISOString(),
      level:  level,
      source: 'analise_comercial',
      fn:     funcName,
      msg:    msg,
      detail: detail || ''
    };
    UrlFetchApp.fetch(FIREBASE_URL + LOG_PATH, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(entry),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('[Log] Falha: ' + e.message);
  }
}

// ===================== TRIGGER SETUP =====================

function setupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onNegEdit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('onNegEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onChange()
    .create();

  ScriptApp.newTrigger('onNegEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  Logger.log('Triggers criados com sucesso!');
  SpreadsheetApp.getUi().alert('Triggers instalados! O dashboard Análise Comercial vai atualizar em tempo real.');
}

// ===================== MAIN FUNCTION =====================

function onNegEdit() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    SpreadsheetApp.flush();
    Utilities.sleep(800);

    var negociacoes = readNegociacoes(ss);

    var payload = {
      negociacoes: negociacoes,
      total: negociacoes.length,
      updatedAt: Date.now(),
      updatedISO: new Date().toISOString(),
      source: 'apps_script'
    };

    sendToFirebase(payload);
    saveMonthlySnapshot(payload);

    logEntry('info', 'onNegEdit',
      'Sync OK — ' + negociacoes.length + ' negociacoes', '');
    Logger.log('Negociacoes sincronizadas: ' + negociacoes.length);
  } catch (error) {
    logEntry('error', 'onNegEdit', error.message, error.stack || '');
    Logger.log('Erro ao sincronizar: ' + error.message);
  }
}

// ===================== DATA READER =====================

/**
 * Lê todos os registros da aba de Negociações.
 * Detecta colunas pelos cabeçalhos automaticamente.
 * Coluna K (índice 10) = campo "Obs" — motivo de desistência.
 * Preenchido apenas nos registros com status Desistente.
 */
function readNegociacoes(ss) {
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log('Aba "' + SHEET_NAME + '" não encontrada');
    return [];
  }

  var data = sheet.getDataRange().getDisplayValues();
  if (data.length < 2) return [];

  var headers = data[0];

  function findCol(names) {
    for (var n = 0; n < names.length; n++) {
      var needle = names[n].toLowerCase();
      for (var h = 0; h < headers.length; h++) {
        if (headers[h].toLowerCase().trim().indexOf(needle) >= 0) return h;
      }
    }
    return -1;
  }

  var colData      = findCol(['negociacao', 'negociação', 'data negoc']);
  var colEmpresa   = findCol(['razao social', 'razão social', 'contabilidade', 'empresa', 'cliente']);
  var colContato   = findCol(['responsavel', 'responsável', 'nome', 'contato']);
  var colCloser    = findCol(['closer', 'especialista', 'vendedor']);
  var colStatus    = findCol(['status']);
  var colPlano     = findCol(['plano']);
  var colValor     = findCol(['valor c/', 'valor com', 'valor final', 'valor']);
  var colContrato  = findCol(['contrato', 'tipo contrato']);
  var colFechamento = findCol(['data o fechamento', 'data fechamento', 'fechamento']);
  var colPagamento = findCol(['pagamento']);

  // Coluna Obs (motivo desistência): busca pelo header, senão usa coluna K
  var colObs = findCol(['obs', 'observacao', 'observação', 'motivo']);
  if (colObs < 0) colObs = COL_OBS_INDEX;

  var negociacoes = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[1]) continue; // linha vazia

    var status = colStatus >= 0 ? row[colStatus].toString().trim() : '';
    if (!status) continue;

    negociacoes.push({
      data:       colData >= 0       ? row[colData].toString().trim()       : '',
      empresa:    colEmpresa >= 0    ? row[colEmpresa].toString().trim()    : '',
      contato:    colContato >= 0    ? row[colContato].toString().trim()    : '',
      closer:     colCloser >= 0     ? row[colCloser].toString().trim()     : '',
      status:     status,
      plano:      colPlano >= 0      ? row[colPlano].toString().trim()      : '',
      valor:      colValor >= 0      ? row[colValor].toString().trim()      : '',
      obs:        colObs >= 0        ? row[colObs].toString().trim()        : '',
      contrato:   colContrato >= 0   ? row[colContrato].toString().trim()   : '',
      fechamento: colFechamento >= 0 ? row[colFechamento].toString().trim() : '',
      pagamento:  colPagamento >= 0  ? row[colPagamento].toString().trim()  : ''
    });
  }

  return negociacoes;
}

// ===================== FIREBASE =====================

function sendToFirebase(data) {
  var url = FIREBASE_URL + FIREBASE_PATH;
  var options = {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  };
  for (var attempt = 1; attempt <= 3; attempt++) {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    if (code === 200) return;
    var errMsg = 'HTTP ' + code + ': ' + response.getContentText().substring(0, 200);
    Logger.log('[Firebase] Tentativa ' + attempt + ' falhou: ' + errMsg);
    logEntry('warn', 'sendToFirebase',
      'Tentativa ' + attempt + ' falhou: HTTP ' + code, errMsg);
    if (attempt < 3) Utilities.sleep(1000);
  }
  var finalErr = 'Firebase indisponivel apos 3 tentativas';
  logEntry('error', 'sendToFirebase', finalErr, url);
  throw new Error(finalErr);
}

// ===================== SNAPSHOT MENSAL =====================

function saveMonthlySnapshot(data) {
  var now = new Date();
  var monthKey = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0');
  var url = FIREBASE_URL + '/analise_comercial_history/' + monthKey + '.json';

  var snapshot = {
    negociacoes: data.negociacoes,
    total: data.total,
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

function manualSync() {
  onNegEdit();
  SpreadsheetApp.getUi().alert('Negociações sincronizadas com o dashboard!');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Hubstrom - Análise Comercial')
    .addItem('Sincronizar agora', 'manualSync')
    .addItem('Configurar triggers', 'setupTrigger')
    .addToUi();
}
