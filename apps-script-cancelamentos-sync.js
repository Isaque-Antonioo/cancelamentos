
// ===================== CONFIGURAÇÃO =====================
var FIREBASE_URL = 'https://relatorio-geral-default-rtdb.firebaseio.com';

// Mapeamento de nomes de abas para número do mês
// Ajuste conforme os nomes das abas na sua planilha
var MONTH_MAP = {
  'janeiro': '01',
  'fevereiro': '02',
  'março': '03',
  'marco': '03',
  'abril': '04',
  'maio': '05',
  'junho': '06',
  'julho': '07',
  'agosto': '08',
  'setembro': '09',
  'outubro': '10',
  'novembro': '11',
  'dezembro': '12'
};

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
  SpreadsheetApp.getUi().alert('Triggers instalados! O dashboard de cancelamentos vai atualizar em tempo real.');
}

// ===================== MAIN FUNCTIONS =====================

function onSheetChange(e) {
  syncCurrentSheet();
}

function onSheetEdit(e) {
  syncCurrentSheet();
}

function syncCurrentSheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var activeSheet = ss.getActiveSheet();
    var sheetName = activeSheet.getName().toLowerCase().trim();

    // Detectar mês pela aba
    var monthNumber = detectMonth(sheetName);

    if (!monthNumber) {
      Logger.log('Aba "' + sheetName + '" não é um mês reconhecido. Ignorando.');
      return;
    }

    var year = detectYear(sheetName);
    var monthKey = year + '-' + monthNumber;

    Logger.log('Sincronizando aba: ' + sheetName + ' → ' + monthKey);

    // Ler todos os dados da aba
    var data = readSheetData(activeSheet);

    if (data.rows.length === 0) {
      Logger.log('Nenhum dado encontrado na aba ' + sheetName);
      return;
    }

    // Gerar checksum simples para detecção de mudanças
    var checksum = generateChecksum(data);

    // Montar payload
    var payload = {
      headers: data.headers,
      rows: data.rows,
      totalRows: data.rows.length,
      sheetName: activeSheet.getName(),
      monthKey: monthKey,
      updatedAt: Date.now(),
      updatedISO: new Date().toISOString(),
      checksum: checksum,
      dataVersion: 2,
      source: 'apps_script'
    };

    // Enviar para Firebase live
    sendToFirebase('/cancelamentos_live/' + monthKey + '.json', payload);

    Logger.log('Dados enviados! ' + data.rows.length + ' registros para ' + monthKey);

  } catch (error) {
    Logger.log('Erro ao sincronizar: ' + error.message);
  }
}

// ===================== SYNC ALL SHEETS =====================

/**
 * Sincroniza TODAS as abas de meses de uma vez.
 * Útil para primeira configuração.
 */
function syncAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var synced = 0;

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var sheetName = sheet.getName().toLowerCase().trim();
    var monthNumber = detectMonth(sheetName);

    if (!monthNumber) continue;

    var year = detectYear(sheetName);
    var monthKey = year + '-' + monthNumber;

    var data = readSheetData(sheet);
    if (data.rows.length === 0) continue;

    var checksum = generateChecksum(data);

    var payload = {
      headers: data.headers,
      rows: data.rows,
      totalRows: data.rows.length,
      sheetName: sheet.getName(),
      monthKey: monthKey,
      updatedAt: Date.now(),
      updatedISO: new Date().toISOString(),
      checksum: checksum,
      dataVersion: 2,
      source: 'apps_script_bulk'
    };

    sendToFirebase('/cancelamentos_live/' + monthKey + '.json', payload);
    synced++;

    Logger.log('Sincronizado: ' + sheet.getName() + ' → ' + monthKey + ' (' + data.rows.length + ' registros)');
  }

  SpreadsheetApp.getUi().alert(synced + ' abas sincronizadas com o dashboard!');
}

// ===================== DATA READER =====================

/**
 * Lê dados de uma aba da planilha.
 *
 * ESTRUTURA DA PLANILHA:
 * - Linha 1: Headers (nomes das colunas)
 * - Linha 2+: Dados das solicitações
 * - Coluna A: Número sequencial da solicitação (1, 2, 3...)
 *   → Só tem número se tem solicitação real
 *   → Se coluna A está vazia ou não é número, a linha é ignorada
 *   → O último número da coluna A = total de solicitações do mês
 *
 * FORMATO DE SAÍDA:
 * - headers: array com nomes originais das colunas
 * - rows: array de arrays (valores na mesma ordem dos headers)
 * - Headers são enviados como valores (não como chaves do Firebase)
 *   para evitar problemas com caracteres especiais (/ . $ # [ ])
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

  // Coletar headers válidos (não vazios)
  for (var h = 0; h < allHeaders.length; h++) {
    var headerVal = allHeaders[h].toString().trim();
    if (headerVal !== '') {
      headers.push(headerVal);
    }
  }

  if (headers.length === 0) {
    return { headers: [], rows: [] };
  }

  // Ler dados (linha 2 em diante) - usar headerCount para limitar colunas
  var dataRange = sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues();
  var rows = [];

  for (var i = 0; i < dataRange.length; i++) {
    var row = dataRange[i];
    var colA = row[0] ? row[0].toString().trim() : '';

    // Coluna A deve ter um número sequencial para ser uma solicitação válida
    // Se coluna A está vazia ou não é numérica, ignorar a linha
    if (colA === '') continue;

    // Verificar se coluna A é um número (sequência de solicitações)
    var seqNum = parseInt(colA, 10);
    if (isNaN(seqNum) || seqNum <= 0) continue;

    // Armazenar como ARRAY de valores (não objeto)
    var rowArray = [];
    for (var j = 0; j < headers.length; j++) {
      rowArray.push(row[j] ? row[j].toString().trim() : '');
    }

    rows.push(rowArray);
  }

  Logger.log('Lidos ' + rows.length + ' registros válidos (último seq: ' + (rows.length > 0 ? rows[rows.length - 1][0] : 'N/A') + ')');

  return { headers: headers, rows: rows };
}

// ===================== HELPERS =====================

/**
 * Gera um checksum simples baseado no conteúdo real dos dados.
 * Usado para detectar mudanças de forma confiável.
 */
function generateChecksum(data) {
  var str = data.headers.join('|');
  for (var i = 0; i < data.rows.length; i++) {
    str += '||' + data.rows[i].join('|');
  }
  // Simple hash
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    var char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

function detectMonth(sheetName) {
  var name = sheetName.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[0-9]/g, '')
    .trim();

  // Tentar match direto
  if (MONTH_MAP[name]) return MONTH_MAP[name];

  // Tentar match parcial
  for (var key in MONTH_MAP) {
    if (name.indexOf(key) >= 0 || key.indexOf(name) >= 0) {
      return MONTH_MAP[key];
    }
  }

  return null;
}

function detectYear(sheetName) {
  var yearMatch = sheetName.match(/20\d{2}/);
  if (yearMatch) return yearMatch[0];
  return new Date().getFullYear().toString();
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
  SpreadsheetApp.getUi().alert('Aba sincronizada com o dashboard!');
}
