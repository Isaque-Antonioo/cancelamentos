
// ===================== CONFIGURAÇÃO =====================
var FIREBASE_URL = 'https://relatorio-geral-default-rtdb.firebaseio.com';
var FIREBASE_PATH = '/relacionamento_live.json';

// Nomes das abas na planilha
var SHEET_DADOS   = 'Dados tratados';
var SHEET_COLAB   = 'Colaborador';

// ===================== TRIGGER SETUP =====================

function setupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var h = triggers[i].getHandlerFunction();
    if (h === 'onSheetChange' || h === 'onSheetEdit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('onSheetChange')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onChange()
    .create();

  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  // Trigger periódico a cada hora para manter dados sempre frescos
  ScriptApp.newTrigger('syncAllData')
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log('Triggers criados com sucesso!');

  // Sincronizar imediatamente os dados atuais da planilha
  syncAllData();

  SpreadsheetApp.getUi().alert('Triggers instalados e dados enviados ao Firebase! O dashboard de Relacionamento está atualizado.');
}

function onSheetChange(e) { syncAllData(); }
function onSheetEdit(e)   { syncAllData(); }

// ===================== MAIN =====================

function syncAllData() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Ler dados tratados
    var dadosSheet = ss.getSheetByName(SHEET_DADOS);
    if (!dadosSheet) {
      Logger.log('Aba "' + SHEET_DADOS + '" não encontrada.');
      return;
    }

    var dadosResult = readSheetData(dadosSheet);
    if (!dadosResult) return;

    // 2. Ler colaboradores (para fotos)
    var colabSheet = ss.getSheetByName(SHEET_COLAB);
    var colaboradores = [];
    if (colabSheet) {
      colaboradores = readColaboradores(colabSheet);
    }

    // 3. Montar mapa de fotos por nome do especialista
    var fotoMap = {};
    for (var i = 0; i < colaboradores.length; i++) {
      var c = colaboradores[i];
      if (c.nome) fotoMap[c.nome.trim().toLowerCase()] = c.imagem || '';
    }

    // 4. Calcular estatísticas agregadas
    var stats = computeStats(dadosResult.headers, dadosResult.rows, fotoMap);

    // 5. Montar payload
    var payload = {
      headers:     dadosResult.headers,
      rows:        dadosResult.rows,
      totalRows:   dadosResult.rows.length,
      colaboradores: colaboradores,
      stats:       stats,
      checksum:    generateChecksum(dadosResult.rows),
      source:      'apps_script',
      dataVersion: 2,
      updatedAt:   Date.now(),
      updatedISO:  new Date().toISOString()
    };

    sendToFirebase(payload);
    Logger.log('Relacionamento sincronizado: ' + dadosResult.rows.length + ' registros');

  } catch (e) {
    Logger.log('Erro ao sincronizar Relacionamento: ' + e.message);
  }
}

// ===================== LEITURA DE DADOS =====================

function readSheetData(sheet) {
  var allValues = sheet.getDataRange().getValues();
  if (allValues.length < 2) return null;

  // Primeira linha = headers (ignorar linhas de cabeçalho repetidas)
  var headers = allValues[0].map(function(h) { return String(h).trim(); });
  // Remover colunas vazias no final
  while (headers.length > 0 && headers[headers.length - 1] === '') {
    headers.pop();
  }
  var colCount = headers.length;

  var rows = [];
  for (var r = 1; r < allValues.length; r++) {
    var rowValues = allValues[r];

    // Ignorar linhas completamente vazias
    var hasContent = false;
    for (var c = 0; c < colCount; c++) {
      if (rowValues[c] !== '' && rowValues[c] !== null && rowValues[c] !== undefined) {
        hasContent = true;
        break;
      }
    }
    if (!hasContent) continue;

    // Ignorar linhas de cabeçalho repetido (CNPJ na coluna 0 == "cnpj" literal)
    var firstCell = String(rowValues[0]).trim().toLowerCase();
    if (firstCell === 'cnpj' || firstCell === headers[0].toLowerCase()) continue;

    // Montar array de valores (tamanho fixo = número de colunas)
    var row = [];
    for (var c = 0; c < colCount; c++) {
      var val = rowValues[c];
      // Converter datas para string legível
      if (val instanceof Date) {
        val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'dd/MM/yyyy');
      } else {
        val = val === null || val === undefined ? '' : String(val);
      }
      row.push(val);
    }

    rows.push(row);
  }

  return { headers: headers, rows: rows };
}

function readColaboradores(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var result = [];
  for (var r = 1; r < values.length; r++) {
    var uid    = String(values[r][0] || '').trim();
    var nome   = String(values[r][1] || '').trim();
    var imagem = String(values[r][2] || '').trim();
    if (nome) {
      result.push({ uid: uid, nome: nome, imagem: imagem });
    }
  }
  return result;
}

// ===================== ESTATÍSTICAS =====================

function computeStats(headers, rows, fotoMap) {
  // Índices das colunas
  var iEspecialista = indexOfHeader(headers, ['especialista', 'responsavel', 'responsável']);
  var iPlano        = indexOfHeader(headers, ['plano']);
  var iHealth       = indexOfHeader(headers, ['healthscore', 'healtscore', 'healt', 'health', 'saude']);
  var iUltimoAcesso = indexOfHeader(headers, ['ultimo acesso', 'último acesso', 'ultimo_acesso']);
  var iErros        = indexOfHeader(headers, ['qtd verificando', 'erro', 'erros']);
  var iCNPJ         = indexOfHeader(headers, ['cnpj']);
  var iContratacao  = indexOfHeader(headers, ['contratacao', 'contratação', 'data da contratacao', 'data da contratação']);

  var stats = {
    total: rows.length,
    healthScore: {},
    planos: {},
    especialistas: {},
    comErros: 0,
    semAcessoRecente: 0,  // sem acesso nos últimos 30 dias
    clientesRisco: []     // clientes com Perigo ou Risco Iminente
  };

  var hoje = new Date();

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];

    var especialista = iEspecialista >= 0 ? String(row[iEspecialista] || '').trim() : '';
    var plano        = iPlano >= 0        ? String(row[iPlano]        || '').trim() : '';
    var health       = iHealth >= 0       ? String(row[iHealth]       || '').trim() : '';
    var ultimoAcesso = iUltimoAcesso >= 0 ? String(row[iUltimoAcesso] || '').trim() : '';
    var erros        = iErros >= 0        ? parseInt(row[iErros]) || 0 : 0;
    var cnpj         = iCNPJ >= 0         ? String(row[iCNPJ]         || '').trim() : '';

    // HealthScore
    if (health) {
      stats.healthScore[health] = (stats.healthScore[health] || 0) + 1;
    }

    // Planos
    if (plano) {
      stats.planos[plano] = (stats.planos[plano] || 0) + 1;
    }

    // Especialistas
    if (especialista) {
      if (!stats.especialistas[especialista]) {
        stats.especialistas[especialista] = {
          nome: especialista,
          total: 0,
          healthScore: {},
          comErros: 0,
          foto: fotoMap[especialista.toLowerCase()] || ''
        };
      }
      stats.especialistas[especialista].total++;
      if (health) {
        stats.especialistas[especialista].healthScore[health] =
          (stats.especialistas[especialista].healthScore[health] || 0) + 1;
      }
      if (erros > 0) stats.especialistas[especialista].comErros++;
    }

    // Com erros
    if (erros > 0) stats.comErros++;

    // Sem acesso recente (> 30 dias ou vazio)
    if (!ultimoAcesso || ultimoAcesso === '') {
      stats.semAcessoRecente++;
    } else {
      var parts = ultimoAcesso.split('/');
      if (parts.length === 3) {
        var d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        var diffDays = Math.floor((hoje - d) / (1000 * 60 * 60 * 24));
        if (diffDays > 30) stats.semAcessoRecente++;
      }
    }

    // Clientes em risco (Perigo ou Risco Iminente)
    var healthLower = health.toLowerCase();
    if (healthLower.includes('perigo') || healthLower.includes('risco')) {
      stats.clientesRisco.push({
        cnpj:         cnpj,
        especialista: especialista,
        plano:        plano,
        health:       health,
        ultimoAcesso: ultimoAcesso,
        erros:        erros
      });
    }
  }

  // Converter especialistas para array ordenado por total desc
  var espArray = [];
  for (var k in stats.especialistas) {
    espArray.push(stats.especialistas[k]);
  }
  espArray.sort(function(a, b) { return b.total - a.total; });
  stats.especialistasArray = espArray;
  delete stats.especialistas; // não precisamos do objeto agora

  // Ordenar clientes em risco: Risco Iminente primeiro, depois Perigo
  stats.clientesRisco.sort(function(a, b) {
    var scoreA = a.health.toLowerCase().includes('risco') ? 0 : 1;
    var scoreB = b.health.toLowerCase().includes('risco') ? 0 : 1;
    return scoreA - scoreB;
  });

  return stats;
}

function indexOfHeader(headers, candidates) {
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (var j = 0; j < candidates.length; j++) {
      var c = candidates[j].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (h.includes(c)) return i;
    }
  }
  return -1;
}

// ===================== CHECKSUM =====================

function generateChecksum(rows) {
  var str = '';
  for (var i = 0; i < rows.length; i++) {
    str += rows[i].join('|') + '\n';
  }
  var hash = 0;
  for (var c = 0; c < str.length; c++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(c);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36) + '_' + rows.length;
}

// ===================== FIREBASE =====================

function sendToFirebase(payload) {
  var url = FIREBASE_URL + FIREBASE_PATH;
  var options = {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    Logger.log('Erro Firebase HTTP ' + code + ': ' + response.getContentText());
  } else {
    Logger.log('Firebase OK (' + code + ') — ' + payload.totalRows + ' registros');
  }
}
