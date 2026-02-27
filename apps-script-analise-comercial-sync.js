/**
 * =====================================================
 * HUBSTROM - Análise de Desistentes → Firebase
 * =====================================================
 *
 * COMO INSTALAR (faça isso UMA VEZ):
 * 1. Abra a planilha "Análise de desistentes de todos os meses"
 * 2. Vá em Extensões → Apps Script
 * 3. APAGUE todo o código existente
 * 4. Cole ESTE código inteiro
 * 5. Salve (Ctrl+S)
 * 6. No dropdown de funções, selecione "setupTrigger" e clique Executar
 * 7. Aceite todas as permissões
 * 8. Pronto! O dashboard atualiza automaticamente a cada edição.
 */

// ===================== CONFIGURAÇÃO =====================

var FIREBASE_URL  = 'https://relatorio-geral-default-rtdb.firebaseio.com';
var FIREBASE_PATH = '/analise_comercial_live.json';
var LOG_PATH      = '/sync_log.json';

// Nome EXATO da aba na planilha (verifique maiúsculas/minúsculas)
var SHEET_NAME = 'Análise de desistentes de todos os meses';

// ===================== TRIGGER SETUP =====================

function setupTrigger() {
  // Remove triggers antigos para evitar duplicatas
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onEdit_Desistentes') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  ScriptApp.newTrigger('onEdit_Desistentes').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onEdit_Desistentes').forSpreadsheet(ss).onChange().create();

  // Sync inicial imediato
  var resultado = syncDesistentes();

  var msg = '✅ Triggers instalados!\n\n' +
    'Registros enviados: ' + resultado.total + '\n\n';

  if (resultado.total === 0) {
    msg += '⚠️  ATENÇÃO: Nenhum registro encontrado.\n' +
      'Execute "diagnostico" para verificar o problema.';
  } else {
    msg += 'O dashboard Análise Comercial já está atualizado!';
  }

  SpreadsheetApp.getUi().alert('Hubstrom — Setup', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ===================== TRIGGER AUTOMÁTICO =====================

function onEdit_Desistentes() {
  try {
    syncDesistentes();
  } catch (e) {
    logEntry('error', 'onEdit_Desistentes', e.message, e.stack || '');
    Logger.log('[Erro] ' + e.message);
  }
}

// ===================== LEITURA + ENVIO =====================

function syncDesistentes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  SpreadsheetApp.flush();
  Utilities.sleep(500);

  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    logEntry('error', 'syncDesistentes', 'Aba nao encontrada: ' + SHEET_NAME, '');
    Logger.log('[Erro] Aba "' + SHEET_NAME + '" não encontrada.');
    return { total: 0, registros: [] };
  }

  var data = sheet.getDataRange().getDisplayValues();
  if (data.length < 2) {
    Logger.log('[Aviso] Aba vazia ou sem dados.');
    return { total: 0, registros: [] };
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

  var colData      = findCol(['data']);
  var colCliente   = findCol(['cliente', 'razao social', 'razão social', 'empresa', 'contabilidade']);
  var colStatus    = findCol(['status']);
  var colMotivo    = findCol(['motivo', 'obs', 'observacao', 'observação', 'razão', 'razao']);
  var colCategoria = findCol(['categoria', 'category', 'cat']);

  Logger.log('[Colunas] data=' + colData + ' cliente=' + colCliente +
    ' status=' + colStatus + ' motivo=' + colMotivo);

  var registros = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    // Ignora linhas completamente vazias
    if (!row[0] && !row[1] && !row[2]) continue;

    var status = colStatus >= 0 ? row[colStatus].toString().trim() : '';
    if (!status) continue; // Ignora linhas sem status

    registros.push({
      data:      colData      >= 0 ? row[colData].toString().trim()      : '',
      cliente:   colCliente   >= 0 ? row[colCliente].toString().trim()   : '',
      status:    status,
      motivo:    colMotivo    >= 0 ? row[colMotivo].toString().trim()    : '',
      categoria: colCategoria >= 0 ? row[colCategoria].toString().trim() : ''
    });
  }

  var payload = {
    registros:   registros,
    // Mantém campo "negociacoes" para compatibilidade com o dashboard HTML
    negociacoes: registros.map(function(r) {
      return {
        data:      r.data,
        empresa:   r.cliente,
        status:    r.status,
        obs:       r.motivo,
        categoria: r.categoria,
        closer:    '',
        plano:     '',
        valor:     '',
        contato:   '',
        contrato:   '',
        fechamento: '',
        pagamento:  ''
      };
    }),
    total:      registros.length,
    updatedAt:  Date.now(),
    updatedISO: new Date().toISOString(),
    source:     'apps_script'
  };

  sendToFirebase(payload);

  logEntry('info', 'syncDesistentes', 'Sync OK — ' + registros.length + ' registros', '');
  Logger.log('[Sync] ' + registros.length + ' registros enviados.');

  return { total: registros.length, registros: registros };
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
    Logger.log('[Firebase] Tentativa ' + attempt + ' falhou: HTTP ' + code);
    if (attempt < 3) Utilities.sleep(1000);
  }
  throw new Error('Firebase indisponível após 3 tentativas');
}

// ===================== LOG =====================

function logEntry(level, funcName, msg, detail) {
  try {
    UrlFetchApp.fetch(FIREBASE_URL + LOG_PATH, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        t: Date.now(), iso: new Date().toISOString(),
        level: level, source: 'analise_comercial',
        fn: funcName, msg: msg, detail: detail || ''
      }),
      muteHttpExceptions: true
    });
  } catch (e) { /* silencioso */ }
}

// ===================== MANUAL SYNC =====================

function manualSync() {
  try {
    var resultado = syncDesistentes();
    SpreadsheetApp.getUi().alert(
      'Hubstrom — Sync',
      '✅ Sincronizado!\n\nRegistros enviados: ' + resultado.total,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert('Erro', e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

// ===================== DIAGNÓSTICO =====================

function diagnostico() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = [];

  lines.push('=== DIAGNÓSTICO HUBSTROM ===\n');

  // Lista todas as abas
  var abas = ss.getSheets().map(function(s) { return '"' + s.getName() + '"'; });
  lines.push('Abas na planilha: ' + abas.join(', '));
  lines.push('');

  // Verifica aba alvo
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    lines.push('❌ Aba "' + SHEET_NAME + '" NÃO encontrada!');
    lines.push('   → Altere a variável SHEET_NAME no código para o nome correto.');
    ui.alert('Diagnóstico', lines.join('\n'), ui.ButtonSet.OK);
    return;
  }

  lines.push('✅ Aba "' + SHEET_NAME + '" encontrada.');

  var data = sheet.getDataRange().getDisplayValues();
  lines.push('Linhas na aba: ' + data.length + ' (incluindo cabeçalho)');

  if (data.length < 2) {
    lines.push('❌ Aba vazia!');
    ui.alert('Diagnóstico', lines.join('\n'), ui.ButtonSet.OK);
    return;
  }

  // Cabeçalhos
  var headers = data[0];
  lines.push('\nCabeçalhos: ' + headers.map(function(h, i) {
    return i + ':"' + h + '"';
  }).join(' | '));

  // Verifica Status
  var colStatus = -1;
  for (var h = 0; h < headers.length; h++) {
    if (headers[h].toLowerCase().indexOf('status') >= 0) { colStatus = h; break; }
  }

  if (colStatus < 0) {
    lines.push('\n❌ Coluna "Status" não encontrada!');
  } else {
    lines.push('\n✅ Coluna Status: posição ' + colStatus);
    // Conta por status
    var cont = {};
    var total = 0;
    for (var i = 1; i < data.length; i++) {
      var st = data[i][colStatus] ? data[i][colStatus].toString().trim() : '';
      if (st) { cont[st] = (cont[st] || 0) + 1; total++; }
    }
    lines.push('Registros com status preenchido: ' + total);
    for (var s in cont) lines.push('  "' + s + '": ' + cont[s]);
  }

  // Tenta sync
  lines.push('\n--- Executando sync ---');
  try {
    var res = syncDesistentes();
    lines.push('✅ Sync OK! ' + res.total + ' registros enviados para o Firebase.');
  } catch (e) {
    lines.push('❌ Erro no sync: ' + e.message);
  }

  ui.alert('Diagnóstico Hubstrom', lines.join('\n'), ui.ButtonSet.OK);
}

// ===================== MENU =====================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Hubstrom')
    .addItem('Sincronizar agora', 'manualSync')
    .addItem('Configurar triggers (primeira vez)', 'setupTrigger')
    .addItem('Diagnóstico', 'diagnostico')
    .addToUi();
}
