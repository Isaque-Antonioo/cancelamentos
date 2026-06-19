/**
 * =====================================================
 * HUBSTROM - Dashboard Operacional → Firebase Real-Time
 * =====================================================
 *
 * COMO INSTALAR:
 * 1. Abra a planilha "Dash Operacional DB"
 * 2. Vá em Extensões → Apps Script
 * 3. Cole este código inteiro no editor
 * 4. Clique em Salvar
 * 5. No dropdown de funções, selecione "setupTrigger" e clique Executar
 * 6. Aceite todas as permissões
 * 7. Pronto! Os dados sincronizam automaticamente a cada edição.
 *
 * COLUNAS LIDAS (posição fixa):
 * A: Empresa | B: Especialista | C: Plano | D: Score
 *
 * ⚠️  SHEET_NAME abaixo deve ser o nome EXATO da aba na planilha.
 *     Se não souber, abra a planilha e veja a aba na parte inferior.
 */

var FIREBASE_URL  = 'https://relatorio-geral-default-rtdb.firebaseio.com';
var FIREBASE_PATH = '/operacional_live.json';
var LOG_PATH      = '/sync_log.json';
var SHEET_NAME    = 'Relacionamento';

// =================== TRIGGER SETUP ===================

function setupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onEdit_Operacional') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('onEdit_Operacional').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onEdit_Operacional').forSpreadsheet(ss).onChange().create();

  Logger.log('[Setup] ' + removed + ' trigger(s) antigos removidos. 2 novos criados.');

  var resultado = syncOperacional();

  SpreadsheetApp.getUi().alert(
    'Hubstrom — Dashboard Operacional Setup\n\n' +
    '✓ Triggers instalados (onEdit + onChange)\n' +
    '✓ ' + resultado.total + ' registros sincronizados\n\n' +
    'O dashboard Operacional já está atualizado!'
  );
}

// =================== TRIGGERS AUTOMÁTICOS ===================

function onEdit_Operacional() {
  try {
    syncOperacional();
  } catch (e) {
    logEntry('error', 'onEdit_Operacional', e.message, e.stack || '');
    Logger.log('[Erro] ' + e.message);
  }
}

function manualSync() {
  var resultado = syncOperacional();
  SpreadsheetApp.getUi().alert(resultado.total + ' registros sincronizados com o dashboard!');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Hubstrom Operacional')
    .addItem('Sincronizar agora', 'manualSync')
    .addItem('Configurar triggers', 'setupTrigger')
    .addToUi();
}

// =================== LEITURA + ENVIO ===================

function syncOperacional() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.flush();
  Utilities.sleep(500);

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    // Fallback: usa a primeira aba se o nome não bater
    sheet = ss.getSheets()[0];
    logEntry('warn', 'syncOperacional', 'Aba "' + SHEET_NAME + '" não encontrada. Usando primeira aba: ' + sheet.getName(), '');
    Logger.log('[Aviso] Aba "' + SHEET_NAME + '" não encontrada. Usando: "' + sheet.getName() + '"');
  }

  var data = sheet.getDataRange().getDisplayValues();
  if (data.length < 1) {
    Logger.log('[Aviso] Aba vazia.');
    return { total: 0 };
  }

  // Detecta se a primeira linha é cabeçalho ou dado
  // (cabeçalho: primeira célula não parece nome de empresa — contém "empresa", "razão", etc.)
  var firstCell = data[0][0] ? data[0][0].toString().toLowerCase().trim() : '';
  var hasHeader = firstCell.indexOf('empresa') >= 0 ||
                  firstCell.indexOf('razao')   >= 0 ||
                  firstCell.indexOf('cliente') >= 0 ||
                  firstCell.indexOf('nome')    >= 0;

  var startRow = hasHeader ? 1 : 0;

  Logger.log('[Info] hasHeader=' + hasHeader + ' | startRow=' + startRow + ' | totalLinhas=' + data.length);

  var rows = [];

  for (var i = startRow; i < data.length; i++) {
    var row = data[i];

    // Pular linhas sem empresa
    var empresa = row[0] ? row[0].toString().trim() : '';
    if (!empresa) continue;

    var especialista = row[1] ? row[1].toString().trim() : '';
    var plano        = row[2] ? row[2].toString().trim() : '';
    var score        = row[3] ? row[3].toString().trim() : '';

    rows.push([empresa, especialista, plano, score]);
  }

  var payload = {
    headers:    ['empresa', 'especialista', 'plano', 'score'],
    rows:       rows,
    total:      rows.length,
    updatedAt:  Date.now(),
    updatedISO: new Date().toISOString(),
    source:     'apps_script'
  };

  sendToFirebase(payload);
  logEntry('info', 'syncOperacional', 'Sync OK — ' + rows.length + ' registros', '');
  Logger.log('[Sync] ' + rows.length + ' registros enviados: ' + new Date().toISOString());

  return { total: rows.length };
}

// =================== FIREBASE ===================

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
    if (code === 200) {
      Logger.log('[Firebase] Enviado (tentativa ' + attempt + ')');
      return;
    }
    var errMsg = 'HTTP ' + code + ': ' + response.getContentText().substring(0, 200);
    Logger.log('[Firebase] Tentativa ' + attempt + ' falhou: ' + errMsg);
    logEntry('warn', 'sendToFirebase', 'Tentativa ' + attempt + ': HTTP ' + code, errMsg);
    if (attempt < 3) Utilities.sleep(1000);
  }
  throw new Error('Firebase indisponível após 3 tentativas');
}

// =================== LOG ===================

function logEntry(level, funcName, msg, detail) {
  try {
    UrlFetchApp.fetch(FIREBASE_URL + LOG_PATH, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        t: Date.now(), iso: new Date().toISOString(),
        level: level, source: 'operacional',
        fn: funcName, msg: msg, detail: detail || ''
      }),
      muteHttpExceptions: true
    });
  } catch (e) { /* silencioso */ }
}
