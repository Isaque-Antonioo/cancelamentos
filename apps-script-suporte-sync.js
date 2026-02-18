/**
 * =====================================================
 * HUBSTROM - Apps Script Suporte → Firebase
 * =====================================================
 *
 * COMO INSTALAR:
 * 1. Abra a planilha de Suporte no Google Sheets
 * 2. Vá em Extensões → Apps Script
 * 3. Selecione todo o código existente (Ctrl+A) e delete
 * 4. Cole este código inteiro
 * 5. Salve (Ctrl+S)
 * 6. Selecione "setupTrigger" no dropdown e clique em Executar
 * 7. Aceite as permissões
 *
 * COMO FUNCIONA:
 * - Toda edição na planilha dispara o envio para Firebase
 * - Lê todos os registros válidos (ignora linhas vazias e cabeçalhos repetidos)
 * - Envia os dados para suporte_live.json
 * - O dashboard escuta esse path e atualiza em tempo real
 *
 * FORMATO DOS DADOS:
 * - headers: array com nomes originais das colunas
 * - rows: array de arrays (cada row é um array de valores)
 * - Isso evita problemas com caracteres especiais nas chaves do Firebase
 */

// ===================== CONFIGURAÇÃO =====================
var FIREBASE_URL = 'https://relatorio-geral-default-rtdb.firebaseio.com';

// Palavras que indicam linha de cabeçalho repetida (não é dado real)
var HEADER_WORDS = [
  'razão social', 'razao social', 'módulo', 'modulo',
  'processo', 'canal de atendimento', 'canal',
  'ligação', 'ligacao', 'status', 'dia/mês', 'dia/mes',
  'colaborador', 'atendente', 'cliente', 'empresa'
];

// ===================== TRIGGER SETUP =====================

function setupTrigger() {
  // Remover triggers antigos
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var handler = triggers[i].getHandlerFunction();
    if (handler === 'onSheetChange' || handler === 'onSheetEdit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // onChange detecta tudo (edições, fórmulas, importações)
  ScriptApp.newTrigger('onSheetChange')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onChange()
    .create();

  // onEdit para edições diretas do usuário
  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  Logger.log('Triggers criados com sucesso!');
  SpreadsheetApp.getUi().alert('Triggers instalados! O dashboard de suporte vai atualizar em tempo real.');
}

// ===================== MAIN FUNCTIONS =====================

function onSheetChange(e) {
  syncCurrentSheet();
}

function onSheetEdit(e) {
  syncCurrentSheet();
}

/**
 * Sincroniza a aba ativa com o Firebase.
 * Envia todos os registros válidos para suporte_live.json
 */
function syncCurrentSheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var activeSheet = ss.getActiveSheet();
    var sheetName = activeSheet.getName();

    Logger.log('Sincronizando aba: ' + sheetName);

    // Ler todos os dados da aba
    var data = readSheetData(activeSheet);

    if (data.rows.length === 0) {
      Logger.log('Nenhum dado válido encontrado na aba ' + sheetName);
      return;
    }

    var checksum = generateChecksum(data);

    // Montar payload
    var payload = {
      headers: data.headers,
      rows: data.rows,
      totalRows: data.rows.length,
      sheetName: sheetName,
      updatedAt: Date.now(),
      updatedISO: new Date().toISOString(),
      checksum: checksum,
      dataVersion: 2,
      source: 'apps_script'
    };

    // Enviar para Firebase live
    sendToFirebase('/suporte_live.json', payload);

    Logger.log('Dados enviados! ' + data.rows.length + ' registros de suporte');

  } catch (error) {
    Logger.log('Erro ao sincronizar: ' + error.message);
  }
}

// ===================== SYNC MANUAL =====================

/**
 * Sincroniza manualmente. Útil para primeira configuração.
 */
function syncAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var totalRows = 0;

  // Combinar dados de todas as abas
  var allHeaders = null;
  var allRows = [];

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var data = readSheetData(sheet);

    if (data.rows.length === 0) continue;

    // Usar headers da primeira aba com dados
    if (!allHeaders) {
      allHeaders = data.headers;
    }

    // Se os headers coincidem, adicionar os rows
    if (arraysEqual(data.headers, allHeaders)) {
      allRows = allRows.concat(data.rows);
    }

    Logger.log('Aba "' + sheet.getName() + '": ' + data.rows.length + ' registros');
  }

  if (allRows.length === 0) {
    SpreadsheetApp.getUi().alert('Nenhum dado encontrado nas abas.');
    return;
  }

  var combinedData = { headers: allHeaders, rows: allRows };
  var checksum = generateChecksum(combinedData);

  var payload = {
    headers: allHeaders,
    rows: allRows,
    totalRows: allRows.length,
    sheetName: 'all',
    updatedAt: Date.now(),
    updatedISO: new Date().toISOString(),
    checksum: checksum,
    dataVersion: 2,
    source: 'apps_script_bulk'
  };

  sendToFirebase('/suporte_live.json', payload);

  SpreadsheetApp.getUi().alert(allRows.length + ' registros sincronizados com o dashboard!');
}

// ===================== DATA READER =====================

/**
 * Lê dados de uma aba da planilha de suporte.
 *
 * ESTRUTURA DA PLANILHA:
 * - Linha 1: Headers (Razão Social, Módulo, Processo, Canal, Ligação, Status, Dia/Mês, Colaborador)
 * - Linha 2+: Dados dos chamados
 * - Linhas vazias ou com cabeçalhos repetidos são ignoradas
 * - Uma linha é válida se tem pelo menos 2 campos com conteúdo
 *
 * FORMATO DE SAÍDA:
 * - headers: array com nomes originais das colunas
 * - rows: array de arrays (valores na mesma ordem dos headers)
 */
function readSheetData(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    return { headers: [], rows: [] };
  }

  // Ler headers (linha 1) - manter nomes ORIGINAIS
  var allHeaders = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var headers = [];

  for (var h = 0; h < allHeaders.length; h++) {
    var headerVal = allHeaders[h].toString().trim();
    if (headerVal !== '') {
      headers.push(headerVal);
    }
  }

  if (headers.length === 0) {
    return { headers: [], rows: [] };
  }

  // Ler dados (linha 2 em diante)
  var dataRange = sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues();
  var rows = [];

  for (var i = 0; i < dataRange.length; i++) {
    var row = dataRange[i];

    // Contar campos preenchidos
    var filledCount = 0;
    var values = [];
    for (var j = 0; j < headers.length; j++) {
      var val = row[j] ? row[j].toString().trim() : '';
      values.push(val);
      if (val !== '') filledCount++;
    }

    // Ignorar linhas com menos de 2 campos preenchidos
    if (filledCount < 2) continue;

    // Ignorar linhas que são cabeçalhos repetidos
    if (isHeaderRow(values)) continue;

    rows.push(values);
  }

  Logger.log('Lidos ' + rows.length + ' registros válidos de ' + sheet.getName());

  return { headers: headers, rows: rows };
}

/**
 * Detecta se uma linha é um cabeçalho repetido.
 * Se 3+ campos coincidem com palavras de cabeçalho, é cabeçalho.
 */
function isHeaderRow(values) {
  var matches = 0;
  for (var i = 0; i < values.length; i++) {
    var val = values[i].toLowerCase().trim();
    if (val && HEADER_WORDS.indexOf(val) >= 0) {
      matches++;
    }
  }
  return matches >= 3;
}

// ===================== HELPERS =====================

function generateChecksum(data) {
  var str = data.headers.join('|');
  for (var i = 0; i < data.rows.length; i++) {
    str += '||' + data.rows[i].join('|');
  }
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    var char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function arraysEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sendToFirebase(path, data) {
  var url = FIREBASE_URL + path;

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

// ===================== MENU =====================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Hubstrom Dashboard')
    .addItem('Sincronizar aba atual', 'manualSync')
    .addItem('Sincronizar TODAS as abas', 'syncAllSheets')
    .addItem('Configurar triggers', 'setupTrigger')
    .addToUi();
}

function manualSync() {
  syncCurrentSheet();
  SpreadsheetApp.getUi().alert('Aba sincronizada com o dashboard de suporte!');
}
