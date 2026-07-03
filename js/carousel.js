/**
 * Hubstrom — Modo TV (Carrossel entre dashboards)
 *
 * Uso: incluir este script em cada página que participa do carrossel.
 * A página deve definir window.CAROUSEL_PAGE com seu próprio nome de arquivo.
 *
 * Ex: <script>window.CAROUSEL_PAGE = 'operacional.html';</script>
 *     <script src="js/carousel.js"></script>
 */

(function () {
  var STORAGE_KEY = 'hubstrom_carousel';
  var PAGES = ['operacional.html', 'suporte-massivas.html'];

  /* ---- Helpers ---- */
  function getState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function setState(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }

  /* ---- Lógica de troca ---- */
  var _timer = null;

  function scheduleSwitch(secondsRemaining) {
    clearTimeout(_timer);
    _timer = setTimeout(function () {
      var state = getState();
      if (!state.active) return;
      var current = PAGES.indexOf(window.CAROUSEL_PAGE);
      var next = PAGES[(current + 1) % PAGES.length];
      state.lastSwitch = Date.now();
      setState(state);
      window.location.href = next;
    }, secondsRemaining * 1000);
  }

  function startCarousel() {
    var state = getState();
    if (!state.active) return;

    var intervalMs = (state.intervalMin || 2) * 60 * 1000;
    var elapsed = Date.now() - (state.lastSwitch || 0);
    var remaining = Math.max(1, (intervalMs - elapsed) / 1000);

    scheduleSwitch(remaining);
    startCountdown(remaining);
  }

  /* ---- Countdown no badge ---- */
  var _countInterval = null;

  function startCountdown(seconds) {
    clearInterval(_countInterval);
    var remaining = Math.ceil(seconds);
    updateBadge(remaining);

    _countInterval = setInterval(function () {
      remaining--;
      if (remaining <= 0) {
        clearInterval(_countInterval);
        remaining = 0;
      }
      updateBadge(remaining);
    }, 1000);
  }

  function updateBadge(seconds) {
    var el = document.getElementById('carouselCountdown');
    if (!el) return;
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    el.textContent = (m > 0 ? m + 'm ' : '') + s + 's';
  }

  /* ---- UI ---- */
  function buildUI() {
    var state = getState();
    var isActive = !!state.active;
    var intervalMin = state.intervalMin || 2;

    var options = [1, 2, 3, 5, 10, 15, 30].map(function (v) {
      return '<option value="' + v + '"' + (intervalMin === v ? ' selected' : '') + '>' +
        (v === 1 ? '1 minuto' : v + ' minutos') + '</option>';
    }).join('');

    var panel = document.createElement('div');
    panel.id = 'carouselPanel';
    panel.style.cssText = [
      'position:fixed;bottom:20px;right:20px;z-index:9999',
      'background:#0f1419',
      'border:1px solid rgba(255,255,255,.12)',
      'border-radius:14px;padding:14px 18px;min-width:220px',
      'box-shadow:0 8px 32px rgba(0,0,0,.5)',
      'font-family:inherit;font-size:13px'
    ].join(';');

    panel.innerHTML = [
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">',
        '<span style="font-weight:700;color:#e2e8f0">📺 Modo TV</span>',
        '<button onclick="carouselToggleConfig()" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:18px;padding:0;line-height:1">⚙</button>',
      '</div>',

      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">',
        '<div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:' + (isActive ? '#35cca3' : '#475569') + ';' + (isActive ? 'animation:blink 2s infinite' : '') + '"></div>',
        '<span style="color:#94a3b8">' + (isActive ? 'Ativo' : 'Inativo') + '</span>',
        isActive ? '<span style="margin-left:auto;color:#64748b">troca em <strong id="carouselCountdown" style="color:#e2e8f0">—</strong></span>' : '',
      '</div>',

      '<div id="carouselConfig" style="display:none;margin-top:12px">',
        '<label style="font-size:11px;color:#64748b;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em">Intervalo</label>',
        '<select id="carouselInterval" onchange="carouselSaveInterval()" style="width:100%;background:#1e293b;border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#e2e8f0;font-size:13px;padding:6px 10px;margin-bottom:10px">',
          options,
        '</select>',
        '<button onclick="carouselToggleActive()" style="width:100%;padding:8px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;background:' + (isActive ? 'rgba(239,68,68,.15)' : 'rgba(53,204,163,.15)') + ';color:' + (isActive ? '#ef4444' : '#35cca3') + '">',
          isActive ? '⏹ Parar carrossel' : '▶ Iniciar carrossel',
        '</button>',
      '</div>'
    ].join('');

    document.body.appendChild(panel);
  }

  /* ---- Funções globais ---- */
  window.carouselToggleConfig = function () {
    var el = document.getElementById('carouselConfig');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  window.carouselSaveInterval = function () {
    var state = getState();
    state.intervalMin = parseInt(document.getElementById('carouselInterval').value, 10);
    state.lastSwitch = Date.now();
    setState(state);
    if (state.active) startCarousel();
  };

  window.carouselToggleActive = function () {
    var state = getState();
    state.active = !state.active;
    if (!state.intervalMin) state.intervalMin = 2;
    if (state.active) state.lastSwitch = Date.now();
    setState(state);

    clearTimeout(_timer);
    clearInterval(_countInterval);

    var old = document.getElementById('carouselPanel');
    if (old) old.remove();
    buildUI();

    if (state.active) startCarousel();
  };

  /* ---- Init ---- */
  function init() {
    if (!window.CAROUSEL_PAGE) return;
    buildUI();
    var state = getState();
    if (state.active) startCarousel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
