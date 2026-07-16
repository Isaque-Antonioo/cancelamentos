/**
 * =====================================================
 * HUBSTROM - Health Score Implantação → Firebase
 * =====================================================
 *
 * COMO INSTALAR:
 * 1. Abra a planilha "Health Score Implantação"
 * 2. Vá em Extensões → Apps Script
 * 3. Cole este código inteiro no editor
 * 4. Clique em Salvar
 * 5. No dropdown de funções, selecione "setupTrigger" e clique Executar
 * 6. Aceite todas as permissões
 * 7. Pronto! Os dados sincronizam automaticamente a cada edição.
 *
 * ESTRUTURA DA PLANILHA (3 blocos lado a lado):
 *   Bloco 1 → Cols A, B, C  (Implantador 1)
 *   Bloco 2 → Cols F, G, H  (Implantador 2)
 *   Bloco 3 → Cols K, L, M  (Implantador 3)
 *
 * Linha 1: Cabeçalhos (Data | Implantador | HealtScore)
 * Linha 2: Nome do implantador na coluna do meio de cada bloco
 * Linha 3+: Dados (data, empresa cliente, score)
 */

var FIREBASE_URL     = 'https://relatorio-geral-default-rtdb.firebaseio.com';
var IMPLANTACAO_PATH = '/implantacao_live.json';
var HISTORICO_BASE   = '/historico_implantacao';
var LOG_PATH         = '/sync_log.json';

// Índices (base 0) das colunas de cada bloco
var BLOCOS = [
  { colData: 0,  colEmpresa: 1,  colScore: 2  },  // Bloco 1: A, B, C
  { colData: 5,  colEmpresa: 6,  colScore: 7  },  // Bloco 2: F, G, H
  { colData: 10, colEmpresa: 11, colScore: 12 }   // Bloco 3: K, L, M
];

// =================== TRIGGER SETUP ===================

function setupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onEdit_Implantacao') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('onEdit_Implantacao').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onEdit_Implantacao').forSpreadsheet(ss).onChange().create();

  Logger.log('[Setup] ' + removed + ' trigger(s) antigos removidos. 2 novos criados.');

  var r = syncImplantacao();

  try {
    SpreadsheetApp.getUi().alert(
      'Hubstrom — Setup Completo\n\n' +
      '✓ Triggers instalados (onEdit + onChange)\n' +
      '✓ ' + r.total + ' registros sincronizados\n\n' +
      'Dashboard de Implantação atualizado!'
    );
  } catch (e) {
    Logger.log('[Setup] Concluído — ' + r.total + ' registros sincronizados.');
  }
}

// =================== TRIGGERS AUTOMÁTICOS ===================

function onEdit_Implantacao() {
  try {
    syncImplantacao();
  } catch (e) {
    logEntry('error', 'onEdit_Implantacao', e.message, e.stack || '');
    Logger.log('[Erro] ' + e.message);
  }
}

function manualSync() {
  var r = syncImplantacao();
  SpreadsheetApp.getUi().alert(r.total + ' registros de implantação sincronizados!');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Hubstrom Implantação')
    .addItem('Sincronizar agora', 'manualSync')
    .addItem('Configurar triggers', 'setupTrigger')
    .addToUi();
}

// =================== LEITURA + ENVIO ===================

function syncImplantacao() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.flush();
  Utilities.sleep(300);

  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getDisplayValues();

  if (data.length < 3) {
    Logger.log('[Implantacao] Dados insuficientes (menos de 3 linhas).');
    return { total: 0 };
  }

  // Linha 2 (índice 1): nomes dos implantadores na coluna do meio de cada bloco
  var nomes = [
    (data[1][BLOCOS[0].colEmpresa] || '').toString().trim() || 'Implantador 1',
    (data[1][BLOCOS[1].colEmpresa] || '').toString().trim() || 'Implantador 2',
    (data[1][BLOCOS[2].colEmpresa] || '').toString().trim() || 'Implantador 3'
  ];

  Logger.log('[Implantacao] Implantadores detectados: ' + nomes.join(', '));

  var rows = [];

  // Linha 3 em diante (índice 2+)
  for (var i = 2; i < data.length; i++) {
    var row = data[i];

    for (var b = 0; b < BLOCOS.length; b++) {
      var bloco    = BLOCOS[b];
      var dataVal  = row[bloco.colData]    ? row[bloco.colData].toString().trim()    : '';
      var empresa  = row[bloco.colEmpresa] ? row[bloco.colEmpresa].toString().trim() : '';
      var scoreRaw = row[bloco.colScore]   ? row[bloco.colScore].toString().trim()   : '';

      // Pular células vazias deste bloco
      if (!dataVal && !empresa) continue;

      rows.push([dataVal, empresa, nomes[b], scoreRaw]);
    }
  }

  var payload = {
    headers:    ['data', 'empresa', 'implantador', 'score'],
    rows:       rows,
    total:      rows.length,
    updatedAt:  Date.now(),
    updatedISO: new Date().toISOString(),
    source:     'apps_script_implantacao'
  };

  sendToFirebase(IMPLANTACAO_PATH, payload);
  saveHistoricoSnapshot(rows);
  logEntry('info', 'syncImplantacao', 'Sync OK — ' + rows.length + ' registros', '');
  Logger.log('[Sync] ' + rows.length + ' registros enviados: ' + new Date().toISOString());

  return { total: rows.length };
}

// =================== HISTÓRICO ===================

function saveHistoricoSnapshot(rows) {
  if (!rows || rows.length === 0) return;

  var now  = new Date();
  var yyyy = now.getFullYear();
  var mm   = (now.getMonth() + 1 < 10 ? '0' : '') + (now.getMonth() + 1);
  var dd   = (now.getDate()    < 10 ? '0' : '') + now.getDate();
  var dateKey = yyyy + '-' + mm + '-' + dd;

  var payload = {
    rows:       rows,
    total:      rows.length,
    updatedAt:  Date.now(),
    updatedISO: now.toISOString()
  };

  var url = FIREBASE_URL + HISTORICO_BASE + '/' + dateKey + '.json';
  var options = {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  for (var attempt = 1; attempt <= 3; attempt++) {
    var response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) {
      Logger.log('[Historico] Snapshot salvo: ' + dateKey + ' (' + rows.length + ' registros)');
      return;
    }
    if (attempt < 3) Utilities.sleep(500);
  }
  Logger.log('[Historico] Falha ao salvar snapshot para ' + dateKey);
}

// =================== FIREBASE ===================

function sendToFirebase(path, data) {
  var url = FIREBASE_URL + path;
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
      Logger.log('[Firebase] Enviado com sucesso (tentativa ' + attempt + ')');
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
        level: level, source: 'implantacao',
        fn: funcName, msg: msg, detail: detail || ''
      }),
      muteHttpExceptions: true
    });
  } catch (e) { /* silencioso */ }
}
