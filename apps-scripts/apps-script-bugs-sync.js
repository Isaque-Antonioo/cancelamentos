/**
 * =====================================================
 * HUBSTROM - Bugs → Firebase Real-Time
 * =====================================================
 *
 * COMO INSTALAR:
 * 1. Abra a planilha que contém a aba "Bugs"
 * 2. Vá em Extensões → Apps Script
 * 3. Cole este código inteiro no editor
 * 4. Clique em Salvar
 * 5. No dropdown de funções, selecione "setupTrigger" e clique Executar
 * 6. Aceite todas as permissões
 * 7. Pronto! O dashboard de Bugs atualiza automaticamente.
 *
 * COLUNAS ESPERADAS NA ABA "Bugs":
 * A: Tipo | B: Chave | C: Resumo | D: Status 1 | E: Prioridade
 * F: Responsável | G: Criado | H: Módulos 1 | I: Funcionalidades
 * J: Razão Social 2 | K: Relator da Situação 3
 */

var FIREBASE_URL  = 'https://relatorio-geral-default-rtdb.firebaseio.com';
var FIREBASE_PATH = '/bugs_live.json';
var LOG_PATH      = '/sync_log.json';
var SHEET_NAME    = 'Bugs'; // Nome EXATO da aba na planilha

// =================== TRIGGER SETUP ===================

function setupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onEdit_Bugs') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('onEdit_Bugs').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onEdit_Bugs').forSpreadsheet(ss).onChange().create();

  Logger.log('[Setup] ' + removed + ' trigger(s) antigos removidos. 2 novos criados.');

  var resultado = syncBugs();

  SpreadsheetApp.getUi().alert(
    'Hubstrom — Bugs Setup\n\n' +
    '✓ Triggers instalados (onEdit + onChange)\n' +
    '✓ ' + resultado.total + ' bugs sincronizados\n\n' +
    'O dashboard de Bugs já está atualizado!'
  );
}

// =================== TRIGGER AUTOMÁTICO ===================

function onEdit_Bugs() {
  try {
    syncBugs();
  } catch (e) {
    logEntry('error', 'onEdit_Bugs', e.message, e.stack || '');
    Logger.log('[Erro] ' + e.message);
  }
}

function manualSync() {
  syncBugs();
  SpreadsheetApp.getUi().alert('Bugs sincronizados com o dashboard!');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Hubstrom Bugs')
    .addItem('Sincronizar agora', 'manualSync')
    .addItem('Configurar triggers', 'setupTrigger')
    .addToUi();
}

// =================== LEITURA + ENVIO ===================

function syncBugs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.flush();
  Utilities.sleep(500);

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    logEntry('error', 'syncBugs', 'Aba não encontrada: ' + SHEET_NAME, '');
    Logger.log('[Erro] Aba "' + SHEET_NAME + '" não encontrada.');
    return { total: 0 };
  }

  var data = sheet.getDataRange().getDisplayValues();
  if (data.length < 2) {
    Logger.log('[Aviso] Aba vazia ou sem dados.');
    return { total: 0 };
  }

  var headers = data[0];

  // Detecta colunas pelos cabeçalhos automaticamente
  function findCol(candidates) {
    for (var n = 0; n < candidates.length; n++) {
      var needle = candidates[n].toLowerCase();
      for (var h = 0; h < headers.length; h++) {
        if (headers[h].toLowerCase().trim().indexOf(needle) >= 0) return h;
      }
    }
    return -1;
  }

  var colTipo           = findCol(['tipo', 'type']);
  var colChave          = findCol(['chave', 'key']);
  var colResumo         = findCol(['resumo', 'summary', 'título', 'titulo', 'descri']);
  var colStatus         = findCol(['status']);
  var colPrioridade     = findCol(['prioridade', 'priority']);
  var colResponsavel    = findCol(['responsável', 'responsavel', 'assignee']);
  var colCriado         = findCol(['criado', 'created', 'data criação', 'data criacao']);
  var colModulo         = findCol(['módulos', 'modulos', 'módulo', 'modulo', 'module']);
  var colFuncionalidade = findCol(['funcionalidades', 'funcionalidade', 'feature']);
  var colCliente        = findCol(['razão social 2', 'razao social 2', 'razão social', 'razao social', 'cliente', 'empresa']);
  var colRelator        = findCol(['relator', 'reporter']);

  Logger.log('[Colunas] chave=' + colChave + ' status=' + colStatus +
    ' prioridade=' + colPrioridade + ' criado=' + colCriado +
    ' modulo=' + colModulo + ' cliente=' + colCliente);

  var rows = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    var hasData = false;
    for (var c = 0; c < Math.min(row.length, 5); c++) {
      if (row[c] && row[c].toString().trim()) { hasData = true; break; }
    }
    if (!hasData) continue;

    rows.push([
      colTipo           >= 0 ? row[colTipo].toString().trim()           : 'Bug',
      colChave          >= 0 ? row[colChave].toString().trim()          : '',
      colResumo         >= 0 ? row[colResumo].toString().trim()         : '',
      colStatus         >= 0 ? row[colStatus].toString().trim()         : '',
      colPrioridade     >= 0 ? row[colPrioridade].toString().trim()     : '',
      colResponsavel    >= 0 ? row[colResponsavel].toString().trim()    : '',
      colCriado         >= 0 ? row[colCriado].toString().trim()         : '',
      colModulo         >= 0 ? row[colModulo].toString().trim()         : '',
      colFuncionalidade >= 0 ? row[colFuncionalidade].toString().trim() : '',
      colCliente        >= 0 ? row[colCliente].toString().trim()        : '',
      colRelator        >= 0 ? row[colRelator].toString().trim()        : ''
    ]);
  }

  var standardHeaders = [
    'tipo', 'chave', 'resumo', 'status', 'prioridade',
    'responsavel', 'criado', 'modulo', 'funcionalidade',
    'cliente', 'relator'
  ];

  var payload = {
    headers:     standardHeaders,
    rows:        rows,
    dataVersion: 2,
    total:       rows.length,
    updatedAt:   Date.now(),
    updatedISO:  new Date().toISOString(),
    source:      'apps_script'
  };

  sendToFirebase(payload);
  logEntry('info', 'syncBugs', 'Sync OK — ' + rows.length + ' bugs', '');
  Logger.log('[Sync] ' + rows.length + ' bugs enviados: ' + new Date().toISOString());

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
        level: level, source: 'bugs',
        fn: funcName, msg: msg, detail: detail || ''
      }),
      muteHttpExceptions: true
    });
  } catch (e) { /* silencioso */ }
}
