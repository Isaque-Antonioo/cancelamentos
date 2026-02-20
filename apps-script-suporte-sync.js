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

// Aba fixa de onde os dados são lidos
var SOURCE_SHEET_NAME = 'Dados Atendimento';

// Colunas desejadas (na ordem de exibição) — busca por correspondência parcial, sem acento
var DESIRED_COLUMNS = [
  'Razão Social',
  'Módulo',
  'Processo',
  'Canal de Atendimento',
  'Ligação',
  'Status',
  'Dia/Mês',
  'Colaborador',
  'Planos'
];

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
 * Sincroniza a aba "Dados Atendimento" com o Firebase.
 */
function syncCurrentSheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SOURCE_SHEET_NAME);

    if (!sheet) {
      Logger.log('Aba "' + SOURCE_SHEET_NAME + '" nao encontrada.');
      return;
    }

    Logger.log('Sincronizando aba: ' + SOURCE_SHEET_NAME);

    var data = readSheetData(sheet);

    if (data.rows.length === 0) {
      Logger.log('Nenhum dado valido encontrado em "' + SOURCE_SHEET_NAME + '"');
      return;
    }

    var checksum = generateChecksum(data);

    var payload = {
      headers: data.headers,
      rows: data.rows,
      totalRows: data.rows.length,
      sheetName: SOURCE_SHEET_NAME,
      updatedAt: Date.now(),
      updatedISO: new Date().toISOString(),
      checksum: checksum,
      dataVersion: 2,
      source: 'apps_script'
    };

    sendToFirebase('/suporte_live.json', payload);

    Logger.log('Dados enviados! ' + data.rows.length + ' registros de suporte');

  } catch (error) {
    Logger.log('Erro ao sincronizar: ' + error.message);
  }
}

// ===================== SYNC MANUAL =====================

/**
 * Sincroniza manualmente a aba "Dados Atendimento".
 */
function syncAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SOURCE_SHEET_NAME);

  if (!sheet) {
    SpreadsheetApp.getUi().alert('Aba "' + SOURCE_SHEET_NAME + '" nao encontrada na planilha.');
    return;
  }

  var data = readSheetData(sheet);

  if (data.rows.length === 0) {
    SpreadsheetApp.getUi().alert('Nenhum dado encontrado em "' + SOURCE_SHEET_NAME + '".');
    return;
  }

  var checksum = generateChecksum(data);

  var payload = {
    headers: data.headers,
    rows: data.rows,
    totalRows: data.rows.length,
    sheetName: SOURCE_SHEET_NAME,
    updatedAt: Date.now(),
    updatedISO: new Date().toISOString(),
    checksum: checksum,
    dataVersion: 2,
    source: 'apps_script_bulk'
  };

  sendToFirebase('/suporte_live.json', payload);

  SpreadsheetApp.getUi().alert(data.rows.length + ' registros sincronizados com o dashboard!');
}

// ===================== DATA READER =====================

/**
 * Lê dados de uma aba da planilha de suporte.
 *
 * ESTRUTURA DA PLANILHA:
 * - Linha 1: Headers (Razão Social, Módulo, Processo, Canal, Ligação, Status, Dia/Mês, Colaborador, Planos)
 * - Linha 2+: Dados dos chamados
 * - Linhas vazias ou com cabeçalhos repetidos são ignoradas
 * - Uma linha é válida se tem pelo menos 2 campos com conteúdo
 * - Apenas as colunas em DESIRED_COLUMNS são incluídas na saída (por correspondência parcial sem acento)
 *
 * FORMATO DE SAÍDA:
 * - headers: array com nomes originais das colunas (apenas as desejadas, na ordem de DESIRED_COLUMNS)
 * - rows: array de arrays (valores na mesma ordem dos headers filtrados)
 */
function readSheetData(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    return { headers: [], rows: [] };
  }

  // Ler todos os headers da linha 1
  var allHeaders = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];

  // Mapear DESIRED_COLUMNS → índice da coluna na planilha (correspondência parcial sem acento)
  var colIndexes = [];   // índice real na planilha para cada coluna desejada encontrada
  var colHeaders = [];   // nome original da coluna (como está na planilha)

  for (var d = 0; d < DESIRED_COLUMNS.length; d++) {
    var desired = stripAccents(DESIRED_COLUMNS[d]).toLowerCase();
    var found = -1;
    for (var h = 0; h < allHeaders.length; h++) {
      var headerNorm = stripAccents(allHeaders[h].toString().trim()).toLowerCase();
      if (headerNorm === desired || headerNorm.indexOf(desired) >= 0 || desired.indexOf(headerNorm) >= 0) {
        found = h;
        break;
      }
    }
    if (found >= 0) {
      colIndexes.push(found);
      colHeaders.push(allHeaders[found].toString().trim());
    } else {
      // Coluna desejada não encontrada — inclui com nome canônico e valor vazio
      colIndexes.push(-1);
      colHeaders.push(DESIRED_COLUMNS[d]);
    }
  }

  if (colHeaders.length === 0) {
    return { headers: [], rows: [] };
  }

  // Ler todos os dados (linha 2 em diante)
  var dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
  var rows = [];

  for (var i = 0; i < dataRange.length; i++) {
    var row = dataRange[i];

    // Extrair apenas as colunas desejadas
    var filledCount = 0;
    var values = [];
    for (var c = 0; c < colIndexes.length; c++) {
      var idx = colIndexes[c];
      var val = (idx >= 0 && row[idx]) ? row[idx].toString().trim() : '';
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

  return { headers: colHeaders, rows: rows };
}

/**
 * Remove acentos de uma string para comparação normalizada.
 */
function stripAccents(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
