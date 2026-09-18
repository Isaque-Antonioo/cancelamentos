/**
 * =====================================================
 * HUBSTROM - Comercial 2 (Ranking de Vendas) → Firebase
 * =====================================================
 *
 * ⚠️ Essa planilha provavelmente JÁ TEM um Apps Script instalado (é por
 * isso que o menu "Hubstrom Dashboard" já aparece nela). Por isso, TODOS
 * os nomes de função/variável aqui são únicos com sufixo "Comercial2" —
 * inclusive o menu não usa o gatilho simples `onOpen` (que colidiria com
 * o `onOpen` do script já existente), e sim um gatilho instalável.
 * Cole isso como um ARQUIVO NOVO dentro do MESMO projeto de Apps Script
 * (não sobrescreva o código que já existe).
 *
 * COMO INSTALAR:
 * 1. Abra a planilha "Cópia de Dashboard Comercial 2" no Google Sheets
 * 2. Vá em Extensões → Apps Script
 * 3. Clique em "+" ao lado de "Arquivos" → Script → nomeie "Comercial2Sync"
 * 4. Cole este código inteiro nesse arquivo NOVO (deixe o resto do projeto como está)
 * 5. Salve (Ctrl+S)
 * 6. No dropdown de funções (barra superior), selecione "setupTriggerComercial2"
 *    e clique em Executar
 * 7. Aceite as permissões
 * 8. Recarregue a planilha uma vez — o menu "Hubstrom Comercial 2" some a aparecer
 *
 * ABAS LIDAS:
 * - "Closer"        (A=Nome, B=Taxa de Conversão, C=Total de Vendas, D=Foto, E=Pendente)
 *                    → ranking por vendedor (pódio + lista) → /comercial2_live
 * - "última venda"  (A=Closer, B=Foto, C=Valor)
 *                    → banner de celebração da venda mais recente → /comercial2_ultima_venda
 *                    (lê a ÚLTIMA linha com dado na coluna A, não só a linha 2)
 * - "Dados"         (B=Gerados, D=Total, E=Dia, F=Meta, G=Pendentes, H=Desistentes,
 *                    I=Meta Diária, J=Contratos Assinados, K=Contratos Pendentes, L=Meta Semanal,
 *                    M=Taxa de Conversão do time)
 *                    → indicadores do time → /comercial2_dados
 *                    → usado no comercial-total.html (cards "Gerados/Conversão/Meta Semanal · C2"
 *                    e "Pagos/Pendentes/Vendas do mês · C2")
 *
 * Todas as abas: linha 1 = cabeçalho, dados a partir da linha 2.
 *
 * COMO FUNCIONA:
 * - Toda edição na planilha dispara o envio das 3 abas pro Firebase
 * - O dashboard (comercial2.html) escuta esses paths e atualiza em tempo real
 */

// ===================== CONFIGURAÇÃO =====================
var FIREBASE_URL_C2       = 'https://relatorio-geral-default-rtdb.firebaseio.com';
var PATH_CLOSER_C2        = '/comercial2_live.json';
var PATH_ULTIMA_VENDA_C2  = '/comercial2_ultima_venda.json';
var PATH_DADOS_C2         = '/comercial2_dados.json';
var SHEET_CLOSER_C2       = 'Closer';
var SHEET_ULTIMA_VENDA_C2 = 'última venda';
var SHEET_DADOS_C2        = 'Dados';

// ===================== TRIGGER SETUP =====================

function setupTriggerComercial2() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var handler = triggers[i].getHandlerFunction();
    if (handler === 'onEdit_Comercial2' || handler === 'onChange_Comercial2' || handler === 'onOpen_Comercial2') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('onEdit_Comercial2').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onChange_Comercial2').forSpreadsheet(ss).onChange().create();
  // Gatilho instalável (não o simples "onOpen") para não colidir com o script já existente
  ScriptApp.newTrigger('onOpen_Comercial2').forSpreadsheet(ss).onOpen().create();

  Logger.log('Triggers criados com sucesso!');

  // getUi() só funciona quando chamado por um clique de menu na planilha —
  // ao rodar pelo botão "Executar" do editor não existe esse contexto de UI,
  // então isso pode falhar aqui sem problema (os triggers já foram criados).
  try { buildMenuComercial2(); } catch (e) { Logger.log('[Comercial2] Sem UI para montar o menu agora (normal ao rodar pelo editor).'); }

  var r = syncAllComercial2();

  Logger.log(
    'Setup completo — ' + r.closer + ' vendedores (Closer), última venda: ' +
    (r.ultimaVenda ? 'OK' : 'sem dados') + ', Dados: ' + (r.dados ? 'OK' : 'sem dados')
  );

  try {
    SpreadsheetApp.getUi().alert(
      'Hubstrom Comercial 2 — Setup Completo\n\n' +
      '✓ Triggers instalados (onEdit + onChange + onOpen)\n' +
      '✓ ' + r.closer + ' vendedores (Closer)\n' +
      '✓ última venda: ' + (r.ultimaVenda ? 'OK' : 'sem dados') + '\n' +
      '✓ Dados (metas do time): ' + (r.dados ? 'OK' : 'sem dados') + '\n\n' +
      'O ranking já está atualizando em tempo real!'
    );
  } catch (e) {
    Logger.log('[Comercial2] Setup OK (sem UI pra mostrar o alerta — veja o Registro de execução acima).');
  }
}

// ===================== TRIGGERS AUTOMÁTICOS =====================

function onEdit_Comercial2() {
  syncAllComercial2();
}

function onChange_Comercial2() {
  syncAllComercial2();
}

function onOpen_Comercial2() {
  buildMenuComercial2();
}

function manualSyncComercial2() {
  var r = syncAllComercial2();
  var msg = r.closer + ' vendedores sincronizados!\n' +
    'última venda: ' + (r.ultimaVenda ? 'OK' : 'sem dados') + '\n' +
    'Dados (metas do time): ' + (r.dados ? 'OK' : 'sem dados');
  Logger.log('[Comercial2] ' + msg.replace(/\n/g, ' | '));
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* sem UI ao rodar pelo editor — ok */ }
}

function syncAllComercial2() {
  var closerTotal = 0, ultimaVendaOk = false, dadosOk = false;
  try { closerTotal = syncCloserComercial2(); } catch (e) { Logger.log('[Comercial2] Erro Closer: ' + e.message); }
  try { ultimaVendaOk = syncUltimaVendaComercial2(); } catch (e) { Logger.log('[Comercial2] Erro última venda: ' + e.message); }
  try { dadosOk = syncDadosComercial2(); } catch (e) { Logger.log('[Comercial2] Erro Dados: ' + e.message); }
  return { closer: closerTotal, ultimaVenda: ultimaVendaOk, dados: dadosOk };
}

// ===================== CLOSER (ranking) =====================

function syncCloserComercial2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CLOSER_C2);
  if (!sheet) {
    Logger.log('[Comercial2] Aba "' + SHEET_CLOSER_C2 + '" não encontrada.');
    return 0;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  // A=Nome, B=Taxa de Conversão, C=Total de Vendas, D=Foto, E=Pendente
  var data = sheet.getRange(2, 1, lastRow - 1, 5).getDisplayValues();
  var rows = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var nome = row[0] ? row[0].toString().trim() : '';
    if (!nome) continue;

    rows.push([
      nome,
      row[1] ? row[1].toString().trim() : '0%',   // taxaConversao
      row[2] ? row[2].toString().trim() : '0',     // totalVendas
      row[3] ? row[3].toString().trim() : '',      // foto (URL)
      row[4] ? row[4].toString().trim() : '0'      // pendente
    ]);
  }

  var payload = {
    headers:    ['nome', 'taxaConversao', 'totalVendas', 'foto', 'pendente'],
    rows:       rows,
    total:      rows.length,
    updatedAt:  Date.now(),
    updatedISO: new Date().toISOString(),
    source:     'apps_script'
  };

  sendToFirebaseComercial2(PATH_CLOSER_C2, payload);
  Logger.log('[Comercial2] Closer: ' + rows.length + ' vendedores enviados.');
  return rows.length;
}

// ===================== ÚLTIMA VENDA (banner) =====================

function syncUltimaVendaComercial2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_ULTIMA_VENDA_C2);
  if (!sheet) {
    Logger.log('[Comercial2] Aba "' + SHEET_ULTIMA_VENDA_C2 + '" não encontrada.');
    return false;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  // Lê a ÚLTIMA linha com valor na coluna A (funciona tanto se a aba
  // for sempre sobrescrita numa única linha, quanto se virar um log que cresce)
  var data = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
  var ultima = null;
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] && data[i][0].toString().trim()) { ultima = data[i]; break; }
  }
  if (!ultima) return false;

  var payload = {
    closer:     ultima[0].toString().trim(),
    foto:       ultima[1] ? ultima[1].toString().trim() : '',
    valor:      ultima[2] ? ultima[2].toString().trim() : '0',
    updatedAt:  Date.now(),
    updatedISO: new Date().toISOString(),
    source:     'apps_script'
  };

  sendToFirebaseComercial2(PATH_ULTIMA_VENDA_C2, payload);
  Logger.log('[Comercial2] Última venda: ' + payload.closer + ' — ' + payload.valor);
  return true;
}

// ===================== DADOS (meta do time) =====================
// Sincronizado desde já para o front-end poder ligar a exibição sem
// precisar mexer no Apps Script depois. Hoje o comercial2.html ainda
// não mostra isso (bloco comentado no HTML).

function syncDadosComercial2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_DADOS_C2);
  if (!sheet) {
    Logger.log('[Comercial2] Aba "' + SHEET_DADOS_C2 + '" não encontrada.');
    return false;
  }

  if (sheet.getLastRow() < 2) return false;

  // B=Gerados, C=(não usada), D=Total, E=Dia, F=Meta, G=Pendentes, H=Desistentes,
  // I=Meta Diária, J=Contratos Assinados, K=Contratos Pendentes, L=Meta Semanal, M=Taxa de Conversão
  var row = sheet.getRange(2, 2, 1, 12).getDisplayValues()[0];

  var payload = {
    gerados:            row[0]  || '0',
    total:              row[2]  || '0',
    dia:                row[3]  || '0',
    meta:               row[4]  || '0',
    pendentes:          row[5]  || '0',
    desistentes:        row[6]  || '0',
    metaDiaria:         row[7]  || '0',
    contratosAssinados: row[8]  || '0',
    contratosPendentes: row[9]  || '0',
    metaSemanal:        row[10] || '0',
    taxaConversao:      row[11] || '0%',
    updatedAt:          Date.now(),
    updatedISO:         new Date().toISOString(),
    source:             'apps_script'
  };

  sendToFirebaseComercial2(PATH_DADOS_C2, payload);
  Logger.log('[Comercial2] Dados do time sincronizados.');
  return true;
}

// ===================== FIREBASE =====================

function sendToFirebaseComercial2(path, data) {
  var url = FIREBASE_URL_C2 + path;
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
    Logger.log('[Firebase] ' + path + ' — tentativa ' + attempt + ' falhou: HTTP ' + code + ' — ' + response.getContentText().substring(0, 200));
    if (attempt < 3) Utilities.sleep(1000);
  }
  throw new Error('Firebase indisponível após 3 tentativas (' + path + ')');
}

// ===================== MENU =====================
// Não usa a função mágica "onOpen" (colidiria com o script já existente
// nessa planilha) — o menu é criado por onOpen_Comercial2, instalado como
// gatilho instalável em setupTriggerComercial2().

function buildMenuComercial2() {
  SpreadsheetApp.getUi()
    .createMenu('Hubstrom Comercial 2')
    .addItem('Sincronizar agora', 'manualSyncComercial2')
    .addItem('Configurar triggers', 'setupTriggerComercial2')
    .addToUi();
}
