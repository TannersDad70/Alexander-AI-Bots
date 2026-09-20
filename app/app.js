/* ============================================================
 * Alexander Bots — web app core.
 * Plain JS, no build step, no CDN. Works offline except for
 * live OpenRouter API calls. Runs from any static host,
 * file://, Electron, or Capacitor.
 *
 * Sibling-provided globals (all guarded):
 *   window.AB_CONFIG, window.VAULT_NOTES, window.HELP_PAGES,
 *   window.renderMarkdown(md)->html, window.renderGraph(canvas, notes, onClick),
 *   window.QRCode  OR  window.qrcode   (vendored QR lib)
 * ============================================================ */
(function () {
'use strict';

/* ---------- 0. Config (defensive: config.js normally provides this) ---------- */
if (!window.AB_CONFIG) {
  window.AB_CONFIG = {
    productName: 'Alexander Bots',
    productShort: 'Alexander Bots',
    tagline: 'Your AI companion',
    accent: 'gold',
    downloadPageUrl: 'download/',
    defaultModel: 'openrouter/auto',
    openRouterChatUrl: 'https://openrouter.ai/api/v1/chat/completions',
    openRouterModelsUrl: 'https://openrouter.ai/api/v1/models',
    gatewayUrl: '',
    appVersion: '0.1.0'
  };
}
var CFG = window.AB_CONFIG;

/* The header pet: "working" while the bot is answering, "waiting" otherwise. */
function setPet(state) {
  var pet = document.getElementById('pet');
  var label = document.getElementById('pet-label');
  if (!pet) return;
  pet.setAttribute('data-state', state);
  pet.setAttribute('aria-label', 'Bot status: ' + state);
  if (label) label.textContent = state;
  var face = document.getElementById('pet-face');
  if (face) face.textContent = state === 'working' ? '\u{1F604}' : '\u{1F60A}';
}
window.setPet = setPet;

/* ---------- 1. Small utilities ---------- */
function escapeHTML(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function $(sel, root) { return (root || document).querySelector(sel); }
function el(tag, cls) {
  var d = document.createElement(tag);
  if (cls) d.className = cls;
  return d;
}
function text(t) { return document.createTextNode(t); }

/* ---------- 2. Settings + storage ---------- */
var SETTINGS_KEY = 'ab.settings';
var HISTORY_KEY = 'ab.chat.history';
var MAX_HISTORY = 50;
var ACCENTS = ['gold', 'azure', 'violet', 'showcase'];

function defaultAccent() {
  return ACCENTS.indexOf(CFG.accent) >= 0 ? CFG.accent : 'gold';
}
function loadSettings() {
  var raw = {};
  try { raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) { raw = {}; }
  var s = {
    openrouterKey: typeof raw.openrouterKey === 'string' ? raw.openrouterKey : '',
    model: typeof raw.model === 'string' && raw.model ? raw.model : (CFG.defaultModel || 'openrouter/auto'),
    gatewayUrl: typeof raw.gatewayUrl === 'string' ? raw.gatewayUrl : '',
    downloadPageUrl: typeof raw.downloadPageUrl === 'string' ? raw.downloadPageUrl : '',
    accent: defaultAccent()
  };
  if (ACCENTS.indexOf(raw.accent) >= 0) s.accent = raw.accent;
  return s;
}
var settings = loadSettings();
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* storage full/blocked */ }
}
function applyAccent() {
  document.documentElement.setAttribute('data-accent', settings.accent);
}
function effectiveDownloadUrl() {
  return settings.downloadPageUrl || CFG.downloadPageUrl || 'download/';
}
function appVersion() { return CFG.appVersion || CFG.version || '0.1.0'; }
function appBuild() { return CFG.build || 'dev'; }
function brandName() { return CFG.productShort || CFG.productName || 'Alexander Bots'; }

/* ---------- 3. Toast ---------- */
function toast(msg, kind) {
  var root = $('#toast-root');
  if (!root) return;
  var t = el('div', 'toast' + (kind === 'error' ? ' toast-error' : ''));
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(function () { t.classList.add('show'); }, 20);
  setTimeout(function () {
    t.classList.remove('show');
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 350);
  }, 3200);
}

/* ---------- 3b. Platform API (same origin; the sign-in cookie comes along) ---------- */
function api(path) {
  var base = (settings.apiBase || CFG.apiBase || '').replace(/\/$/, '');
  return fetch(base + path, { headers: { 'Accept': 'application/json' } }).then(function (r) {
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403
      ? 'Not signed in to the deployment.' : 'The deployment answered ' + r.status + '.');
    return r.json();
  });
}
function apiPost(path, body) {
  var base = (settings.apiBase || CFG.apiBase || '').replace(/\/$/, '');
  return fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (d) {
      if (!r.ok) throw new Error(d.error || ('The deployment answered ' + r.status + '.'));
      return d;
    });
  });
}
function wsUrl(path) {
  var base = (settings.apiBase || CFG.apiBase || '');
  if (base) return base.replace(/^http/, 'ws').replace(/\/$/, '') + path;
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + path;
}

/* ---------- 4. Router ---------- */
var view = $('#view');
var graphCleanup = null;

function parseRoute() {
  var h = location.hash || '#/chat';
  var m = /^#\/(chat|vault|graph|help|settings|bots|computer|activity)(?:\/([^?#]*))?$/.exec(h);
  if (!m) return { name: 'chat', param: '' };
  var param = '';
  try { param = decodeURIComponent(m[2] || ''); } catch (e) { param = m[2] || ''; }
  return { name: m[1], param: param };
}

function render() {
  if (graphCleanup) { try { graphCleanup(); } catch (e) {} graphCleanup = null; }
  var r = parseRoute();
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].getAttribute('data-route') === r.name);
  }
  view.className = 'view view-' + r.name;
  if (r.name === 'chat') renderChat();
  else if (r.name === 'vault') {
    deploymentHas('/vault/').then(function (yes) {
      if (yes) renderDeploymentFrame('/vault/', 'Vault', 'The bot\u2019s notes, from the deployment.');
      else renderVault(r);
    });
  }
  else if (r.name === 'graph') {
    deploymentHas('/vault/graph.html').then(function (yes) {
      if (yes) renderDeploymentFrame('/vault/graph.html', 'Graph', 'The deployment\u2019s notes, as a graph.');
      else renderGraph();
    });
  }
  else if (r.name === 'help') renderHelp(r);
  else if (r.name === 'settings') renderSettings();
  else if (r.name === 'bots') renderBots();
  else if (r.name === 'computer') renderComputer(r);
  else if (r.name === 'activity') renderActivity();
  view.scrollTop = 0;
}
window.addEventListener('hashchange', render);

function pageHead(title, sub) {
  var h = el('div', 'view-head');
  var h1 = el('h1', 'fire'); h1.textContent = title;
  h.appendChild(h1);
  if (sub) { var p = el('p', 'muted'); p.textContent = sub; h.appendChild(p); }
  return h;
}
function emptyState(title, bodyText) {
  var d = el('div', 'empty-state');
  var h = el('h2'); h.textContent = title; d.appendChild(h);
  if (bodyText) { var p = el('p'); p.textContent = bodyText; d.appendChild(p); }
  return d;
}

/* ---------- 5. Chat ---------- */
function getHistory() {
  try {
    var h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(h)) return [];
    return h.filter(function (m) {
      return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
    });
  } catch (e) { return []; }
}
function setHistory(h) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-MAX_HISTORY))); } catch (e) {}
}

function bubble(role, content) {
  var d = el('div', 'msg ' + role);
  var lab = el('div', 'msg-role');
  lab.textContent = role === 'user' ? 'You' : brandName();
  d.appendChild(lab);
  var b = el('div', 'msg-body');
  b.textContent = content || '';
  d.appendChild(b);
  return d;
}
function setBubbleText(b, txt) {
  var bodyEl = b.querySelector('.msg-body');
  if (bodyEl) bodyEl.textContent = txt;
}
function addTypingDots(b) {
  var dots = el('span', 'typing-dots');
  dots.setAttribute('aria-hidden', 'true');
  dots.appendChild(el('i')); dots.appendChild(el('i')); dots.appendChild(el('i'));
  var bodyEl = b.querySelector('.msg-body');
  if (bodyEl) bodyEl.appendChild(dots);
}
function clearTypingDots(b) {
  var dots = b.querySelector('.typing-dots');
  if (dots && dots.parentNode) dots.parentNode.removeChild(dots);
}
function scrollChat(msgs) { msgs.scrollTop = msgs.scrollHeight; }

function orHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + (settings.openrouterKey || ''),
    'HTTP-Referer': (location.origin && location.origin !== 'null') ? location.origin : 'https://alexander.bots',
    'X-Title': brandName()
  };
}
function httpErrorMessage(status, bodyText) {
  var msg = 'HTTP ' + status;
  try {
    var j = JSON.parse(bodyText);
    if (j && j.error && j.error.message) msg = j.error.message;
    else if (j && j.message) msg = j.message;
  } catch (e) {
    if (bodyText && bodyText.length < 240) msg = bodyText;
  }
  if (status === 401) msg = 'Invalid API key. ' + msg;
  else if (status === 402) msg = 'OpenRouter billing issue. ' + msg;
  else if (status === 429) msg = 'Rate limited — please wait a moment and try again.';
  else if (status === 0) msg = 'Network error — are you offline?';
  return msg;
}

/* Streaming chat via SSE. cbs: onToken(full), onDone(full), onFatal(msg), onStreamFailed() */
function streamChat(body, cbs) {
  var req;
  try {
    req = fetch(CFG.openRouterChatUrl, {
      method: 'POST',
      headers: orHeaders(),
      body: JSON.stringify(body)
    });
  } catch (e) { cbs.onStreamFailed(); return; }
  req.then(function (res) {
    if (!res.ok) {
      return res.text().then(function (t) {
        cbs.onFatal(httpErrorMessage(res.status, t));
      }, function () { cbs.onFatal(httpErrorMessage(res.status, '')); });
    }
    if (!res.body || typeof res.body.getReader !== 'function') { cbs.onStreamFailed(); return; }
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buf = '', full = '', got = false;
    function finish() {
      /* process any trailing partial line left in the buffer */
      var tail = buf.trim();
      if (tail.indexOf('data:') === 0) {
        var tdata = tail.slice(5).trim();
        if (tdata && tdata !== '[DONE]') {
          try {
            var tj = JSON.parse(tdata);
            var td = tj.choices && tj.choices[0] && tj.choices[0].delta;
            var tc = td && td.content;
            if (typeof tc === 'string' && tc) { got = true; full += tc; cbs.onToken(full); }
          } catch (e) { /* ignore */ }
        }
      }
      if (got) cbs.onDone(full);
      else cbs.onStreamFailed();
    }
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) { finish(); return; }
        buf += decoder.decode(r.value, { stream: true });
        var lines = buf.split('\n');
        buf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (line.indexOf('data:') !== 0) continue;
          var data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            var j = JSON.parse(data);
            var d = j.choices && j.choices[0] && j.choices[0].delta;
            var c = d && d.content;
            if (typeof c === 'string' && c) { got = true; full += c; cbs.onToken(full); }
          } catch (e) { /* skip one malformed chunk */ }
        }
        return pump();
      }, function () { cbs.onStreamFailed(); });
    }
    pump().catch(function () { cbs.onStreamFailed(); });
  }, function () { cbs.onStreamFailed(); });
}

function nonStreamChat(body, onOk, onErr) {
  var b = { model: body.model, messages: body.messages, stream: false };
  fetch(CFG.openRouterChatUrl, { method: 'POST', headers: orHeaders(), body: JSON.stringify(b) })
    .then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) { throw new Error(httpErrorMessage(res.status, t)); },
          function () { throw new Error(httpErrorMessage(res.status, '')); });
      }
      return res.json();
    })
    .then(function (j) {
      var c = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (typeof c !== 'string') throw new Error('Unexpected response from the model.');
      onOk(c);
    })
    .catch(function (e) { onErr(e && e.message ? e.message : 'Request failed.'); });
}

function doSend(userText, msgs, done) {
  var history = getHistory();
  history.push({ role: 'user', content: userText });
  setHistory(history);

  msgs.appendChild(bubble('user', userText));
  var ab = bubble('assistant', '');
  addTypingDots(ab);
  msgs.appendChild(ab);
  scrollChat(msgs);

  var body = {
    model: settings.model || CFG.defaultModel || 'openrouter/auto',
    messages: history.slice(-MAX_HISTORY),
    stream: true
  };

  function success(full) {
    clearTypingDots(ab);
    setBubbleText(ab, full);
    var h = getHistory();
    h.push({ role: 'assistant', content: full });
    setHistory(h);
    scrollChat(msgs);
    done();
  }
  function fatal(msg) {
    clearTypingDots(ab);
    ab.classList.add('error');
    setBubbleText(ab, 'Something went wrong: ' + msg + '\n\nCheck your API key in Settings and try again.');
    scrollChat(msgs);
    toast('Chat failed: ' + msg, 'error');
    done();
  }

  streamChat(body, {
    onToken: function (full) { clearTypingDots(ab); setBubbleText(ab, full); scrollChat(msgs); },
    onDone: success,
    onFatal: fatal,
    onStreamFailed: function () {
      /* graceful fallback: one non-streamed request */
      nonStreamChat(body, success, fatal);
    }
  });
}

function autosize(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
}


/* ---------- Platform chat: talk to this deployment's bots over AG-UI ----------
 * Used when the app is served by a deployment (…/app/). The bot's reply arrives
 * as Server-Sent Events; TEXT_MESSAGE_CONTENT carries the text deltas.
 */
function platformMode() {
  return !!(settings.apiBase || CFG.apiBase) || location.pathname.indexOf('/app') === 0;
}
/* The chat is a window onto the main app's conversations: the channels it
 * lists are the same ones the deployment's own app shows, and messages land
 * in the same threads. */
var platformChannel = null;
var platformMessages = [];

/* Report a message to the channel, so the main app's roster shows it too. */
function reportActivity(channelId, message, agentId) {
  return apiPost('/api/channels/' + encodeURIComponent(channelId) + '/activity', {
    text: message, agentId: agentId || null, at: new Date().toISOString()
  }).catch(function () {});
}

/* The text of one thread message; content is a string or a list of parts. */
function messageText(m) {
  var c = m && m.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    var out = '';
    for (var i = 0; i < c.length; i++) {
      if (c[i] && typeof c[i].text === 'string') out += c[i].text;
    }
    return out.trim();
  }
  return '';
}

/* Replace the bubbles with the conversation's messages. */
function renderPlatformMessages(container, msgs) {
  var old = container.querySelectorAll('.bubble');
  for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
  msgs.forEach(function (m) {
    if (m.role !== 'user' && m.role !== 'assistant') return;
    var t = messageText(m);
    if (!t) return;
    container.appendChild(bubble(m.role, t));
  });
}

/* Load this conversation's history from the deployment. */
function loadPlatformMessages(container) {
  if (!container) return;
  if (!platformChannel || !platformChannel.threadId) { renderPlatformMessages(container, []); return; }
  api('/api/copilotkit/threads/' + encodeURIComponent(platformChannel.threadId) + '/messages')
    .then(function (d) {
      platformMessages = (d && (Array.isArray(d) ? d : d.messages)) || [];
      renderPlatformMessages(container, platformMessages);
      scrollChat(container);
    })
    .catch(function () { renderPlatformMessages(container, []); });
}

function doSendPlatform(userText, msgs, done) {
  var channel = platformChannel;
  var agentId = (channel && channel.agentIds && channel.agentIds[0]) || 'general-assistant';

  msgs.appendChild(bubble('user', userText));
  var ab = bubble('assistant', '');
  addTypingDots(ab);
  msgs.appendChild(ab);
  scrollChat(msgs);
  if (channel) reportActivity(channel.id, userText, null);

  var full = '';
  var socket = null;
  var finished = false;

  function finish(ok, message) {
    if (finished) return;
    finished = true;
    try { if (socket) socket.close(); } catch (e) {}
    if (ok) {
      clearTypingDots(ab);
      setBubbleText(ab, full || '(the bot said nothing)');
      if (channel) reportActivity(channel.id, full || '(the bot said nothing)', agentId);
      scrollChat(msgs);
    } else {
      clearTypingDots(ab);
      ab.classList.add('error');
      setBubbleText(ab, 'The bot could not answer: ' + message);
      scrollChat(msgs);
      toast('Chat failed: ' + message, 'error');
    }
    done();
  }

  if (!channel || !channel.threadId) { finish(false, 'there is no conversation selected'); return; }
  var runId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
  fetch('/api/copilotkit/agent/' + encodeURIComponent(agentId) + '/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      threadId: channel.threadId, runId: runId, state: {},
      messages: [{ id: runId, role: 'user', content: userText }],
      tools: [], context: [], forwardedProps: {}
    })
  }).then(function (r) {
    if (!r.ok) throw new Error('the deployment answered ' + r.status);
    return r.json();
  }).then(function (run) {
    var realtime = (run && run.realtime) || {};
    if (!run.joinToken || !realtime.clientUrl || !realtime.topic) {
      throw new Error('the deployment did not open a reply stream');
    }
    /* CopilotKit Intelligence speaks Phoenix Channels: connect with the join
       token, join the thread topic, then read ag_ui_event deltas. */
    socket = new WebSocket(realtime.clientUrl + '/websocket?vsn=2.0.0&join_token=' + encodeURIComponent(run.joinToken));
    socket.onopen = function () {
      socket.send(JSON.stringify([null, '1', realtime.topic, 'phx_join', {}]));
    };
    socket.onmessage = function (ev) {
      var frame = null;
      try { frame = JSON.parse(ev.data); } catch (e) { return; }
      if (!frame || frame.length < 5 || frame[3] !== 'ag_ui_event') return;
      var payload = frame[4] || {};
      if (typeof payload.delta === 'string') {
        full += payload.delta;
        clearTypingDots(ab);
        setBubbleText(ab, full);
        scrollChat(msgs);
      }
      if (payload.finishReason) finish(true);
      if (payload.error) finish(false, payload.error.message || 'the bot stopped');
    };
    socket.onerror = function () { finish(false, 'the reply stream dropped'); };
    socket.onclose = function () { if (!finished) finish(true); };
    setTimeout(function () { finish(true); }, 120000);  /* a turn has a ceiling */
  }).catch(function (e) { finish(false, e && e.message ? e.message : String(e)); });
}

function renderChat() {
  view.innerHTML = '';
  var wrap = el('div', 'chat');

  /* top bar: model chip, key status, new chat */
  var top = el('div', 'chat-topbar');
  var modelChip = el('span', 'chip model-chip');
  modelChip.appendChild(text('model: '));
  var mb = el('b'); mb.textContent = settings.model || CFG.defaultModel || 'openrouter/auto';
  mb.title = mb.textContent;
  modelChip.appendChild(mb);
  top.appendChild(modelChip);

  if (platformMode()) {
    api('/info').then(function (d) {
      if (d && d.model) { mb.textContent = d.model; mb.title = d.model; }
    }).catch(function () {});
  }

  if (!platformMode()) {
    var keyChip = el('span', 'chip key-chip ' + (settings.openrouterKey ? 'ok' : 'warn'));
    keyChip.appendChild(el('span', 'dot'));
    keyChip.appendChild(text(settings.openrouterKey ? 'API key set' : 'no API key'));
    top.appendChild(keyChip);
  }

  top.appendChild(el('span', 'spacer'));
  var newBtn = el('button', 'btn btn-small btn-ghost');
  newBtn.type = 'button';
  newBtn.textContent = 'New chat';
  newBtn.addEventListener('click', function () {
    if (platformMode()) {
      var agentIds = (platformChannel && platformChannel.agentIds) || ['general-assistant'];
      apiPost('/api/channels', { agentIds: agentIds }).then(function (d) {
        if (!d || !d.channel) throw new Error('the deployment did not return the conversation');
        platformChannel = d.channel;
        renderChat();
        toast('New conversation started');
      }).catch(function (e) { toast('Could not start a conversation: ' + e.message, 'error'); });
      return;
    }
    setHistory([]);
    renderChat();
    toast('Conversation cleared');
  });
  top.appendChild(newBtn);
  wrap.appendChild(top);

  /* platform mode: pick which conversation (channel) to talk to */
  if (platformMode()) {
    var picker = el('div', 'bot-picker');
    wrap.appendChild(picker);
    api('/api/channels?limit=100').then(function (d) {
      var channels = (d && d.channels) || [];
      if (!channels.length) return;
      if (!platformChannel || !channels.some(function (c) { return c.id === platformChannel.id; })) {
        platformChannel = channels[0];
      }
      channels.forEach(function (ch) {
        var c = el('button', 'chip' + (platformChannel && ch.id === platformChannel.id ? ' on' : ''));
        c.type = 'button';
        c.textContent = ch.name || ch.id;
        c.addEventListener('click', function () {
          platformChannel = ch;
          renderChat();
        });
        picker.appendChild(c);
      });
      loadPlatformMessages($('#chat-messages'));
    }).catch(function () {});
  } else {
    var gw = settings.gatewayUrl || CFG.gatewayUrl || '';
    if (gw) {
      var banner = el('div', 'banner-chip');
      banner.textContent = 'Gateway mode \u2014 chatting through your deployment';
      wrap.appendChild(banner);
    }
  }

  /* messages */
  var msgs = el('div', 'chat-messages');
  msgs.id = 'chat-messages';
  wrap.appendChild(msgs);

  /* watermark: the logo sits under the bot list, blurred, like background art */
  var mark = el('div', 'chat-watermark');
  var markImg = document.createElement('img');
  markImg.src = 'assets/logo-lockup.png';
  markImg.srcset = 'assets/logo-lockup@2x.png 2x';
  markImg.alt = '';
  markImg.setAttribute('aria-hidden', 'true');
  mark.appendChild(markImg);
  msgs.appendChild(mark);

  var history = getHistory();
  if (!platformMode() && !settings.openrouterKey) {
    var notice = el('div', 'chat-notice');
    var nh = el('h2'); nh.textContent = 'No API key yet'; notice.appendChild(nh);
    var np = el('p');
    np.textContent = 'Add your OpenRouter API key in Settings to start chatting. Your key stays on this device.';
    notice.appendChild(np);
    var goBtn = el('a', 'btn btn-accent');
    goBtn.href = '#/settings';
    goBtn.textContent = 'Open Settings';
    notice.appendChild(goBtn);
    msgs.appendChild(notice);
  }
  if (platformMode()) {
    if (platformChannel) loadPlatformMessages(msgs);
  } else {
    for (var i = 0; i < history.length; i++) {
      msgs.appendChild(bubble(history[i].role, history[i].content));
    }
    if (settings.openrouterKey && !history.length) {
      var wel = el('div', 'chat-welcome');
      var wh = el('h2', 'fire'); wh.textContent = 'Hello, I\u2019m ' + brandName();
      var wp = el('p'); wp.textContent = 'Ask me anything \u2014 I\u2019ll answer using the model you picked in Settings.';
      wel.appendChild(wh); wel.appendChild(wp);
      msgs.appendChild(wel);
    }
  }

  /* composer */
  var form = el('form', 'chat-composer');
  var ta = document.createElement('textarea');
  ta.setAttribute('aria-label', 'Type your message');
  ta.rows = 1;
  var send = el('button', 'btn btn-accent');
  send.type = 'submit';
  send.textContent = 'Send';
  if (!settings.openrouterKey && !platformMode()) {
    ta.disabled = true; send.disabled = true;
    ta.placeholder = 'Add an API key in Settings to start chatting';
  } else {
    ta.placeholder = 'Message ' + brandName() + '\u2026';
  }
  form.appendChild(ta);
  form.appendChild(send);
  wrap.appendChild(form);
  view.appendChild(wrap);

  autosize(ta);
  ta.addEventListener('input', function () { autosize(ta); });
  ta.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else send.click();
    }
  });

  var sending = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;
    var t = ta.value.trim();
    if (!t) return;
    sending = true;
    send.disabled = true;
    ta.value = '';
    autosize(ta);
    setPet('working');
    var runner = platformMode() ? doSendPlatform : doSend;
    runner(t, msgs, function () {
      sending = false;
      send.disabled = false;
      setPet('waiting');
      if (!ta.disabled) ta.focus();
    });
  });

  scrollChat(msgs);
}

/* ---------- 6. QR modal (Get the app) ---------- */
function renderQRCode(box, url) {
  box.innerHTML = '';
  /* flavor 1: davidshimjs-style `new QRCode(el, {text, width, height})` */
  try {
    if (typeof window.QRCode === 'function') {
      new window.QRCode(box, { text: url, width: 220, height: 220 });
      return;
    }
  } catch (e) { /* fall through */ }
  /* flavor 2: qrcode-generator (kazuhikoarase) `qrcode(n, level)` API */
  try {
    if (typeof window.qrcode === 'function') {
      var qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      var tag = null;
      try { tag = qr.createSvgTag({ cellSize: 5, margin: 0, scalable: true }); }
      catch (e2) {
        try { tag = qr.createSvgTag(5, 0); } catch (e3) { tag = null; }
      }
      if (!tag) {
        try { tag = qr.createImgTag(5, 0); } catch (e4) { tag = null; }
      }
      if (tag) {
        box.innerHTML = tag;
        var svg = box.querySelector('svg');
        if (svg) { svg.setAttribute('width', '220'); svg.setAttribute('height', '220'); }
        var img = box.querySelector('img');
        if (img) { img.style.width = '220px'; img.style.height = '220px'; img.alt = 'QR code'; }
        return;
      }
    }
  } catch (e) { /* fall through */ }
  /* flavor 3: no QR lib — show the URL plainly */
  var p = el('p', 'qr-fallback');
  p.textContent = url;
  box.appendChild(p);
}

function openQRModal() {
  var dlg = $('#qr-modal');
  if (!dlg) return;
  var url = effectiveDownloadUrl();
  renderQRCode($('#qr-box'), url);
  $('#qr-url').textContent = url;
  $('#qr-open').setAttribute('href', url);
  try {
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute('open', '');
  } catch (e) {
    try { dlg.setAttribute('open', ''); } catch (e2) {}
  }
}
function closeQRModal() {
  var dlg = $('#qr-modal');
  if (!dlg) return;
  try {
    if (typeof dlg.close === 'function' && dlg.open) dlg.close();
    else dlg.removeAttribute('open');
  } catch (e) { dlg.removeAttribute('open'); }
}
function legacyCopy(t) {
  try {
    var ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}
function copyDownloadLink() {
  var url = effectiveDownloadUrl();
  function ok() { toast('Download link copied'); }
  function fail() { toast('Copy failed \u2014 long-press the link to copy it', 'error'); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(ok, function () {
      if (legacyCopy(url)) ok(); else fail();
    });
  } else if (legacyCopy(url)) ok();
  else fail();
}

/* ---------- 7. Settings ---------- */
function fmtCtx(n) {
  if (!n || n <= 0) return '\u2014';
  if (n >= 1000000) {
    var m = n / 1000000;
    return (m >= 10 ? Math.round(m) : (Math.round(m * 10) / 10)) + 'M';
  }
  if (n >= 1000) return Math.round(n / 1000) + 'K';
  return String(n);
}

function testKey(keyVal, btn) {
  if (!keyVal) { toast('Enter an API key first', 'error'); return; }
  btn.disabled = true;
  var old = btn.textContent;
  btn.textContent = 'Testing\u2026';
  fetch(CFG.openRouterModelsUrl, { headers: { 'Authorization': 'Bearer ' + keyVal } })
    .then(function (res) {
      if (!res.ok) throw new Error(httpErrorMessage(res.status, ''));
      return res.json();
    })
    .then(function () { toast('Key works \u2014 connected to OpenRouter'); })
    .catch(function (e) { toast('Key test failed: ' + (e && e.message ? e.message : e), 'error'); })
    .then(function () { btn.disabled = false; btn.textContent = old; });
}

function setTitle(txt) {
  var h = el('h2'); h.textContent = txt; return h;
}
function setDesc(txt) {
  var p = el('p', 'set-desc'); p.textContent = txt; return p;
}

/* --- API key card --- */
function buildKeyCard() {
  var card = el('section', 'set-card');
  card.appendChild(setTitle('OpenRouter API key'));
  card.appendChild(setDesc('Your key is stored only on this device (localStorage) and is sent directly to OpenRouter. Get one free at openrouter.ai/keys.'));
  var zone = el('div', 'key-zone');
  card.appendChild(zone);

  function draw(editing) {
    zone.innerHTML = '';
    if (settings.openrouterKey && !editing) {
      var row = el('div', 'form-row');
      var status = el('div', 'key-status');
      status.appendChild(el('span', 'dot'));
      var km = el('span', 'key-masked'); km.textContent = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (saved)';
      status.appendChild(km);
      row.appendChild(status);
      row.appendChild(el('span', 'spacer'));
      var change = el('button', 'btn btn-small'); change.type = 'button'; change.textContent = 'Change key';
      var test = el('button', 'btn btn-small btn-ghost'); test.type = 'button'; test.textContent = 'Test key';
      var remove = el('button', 'btn btn-small btn-danger'); remove.type = 'button'; remove.textContent = 'Remove';
      row.appendChild(change); row.appendChild(test); row.appendChild(remove);
      zone.appendChild(row);
      change.addEventListener('click', function () { draw(true); });
      test.addEventListener('click', function () { testKey(settings.openrouterKey, test); });
      remove.addEventListener('click', function () {
        if (window.confirm('Remove the saved OpenRouter API key from this device?')) {
          settings.openrouterKey = '';
          saveSettings();
          draw(false);
          toast('API key removed');
        }
      });
    } else {
      var block = el('div', 'field-block');
      var lab = el('label', 'field-label');
      lab.setAttribute('for', 'set-key-input');
      lab.textContent = settings.openrouterKey ? 'New API key' : 'API key';
      var input = document.createElement('input');
      input.type = 'password';
      input.id = 'set-key-input';
      input.className = 'text-input';
      input.placeholder = 'sk-or-\u2026';
      input.autocomplete = 'off';
      input.spellcheck = false;
      block.appendChild(lab);
      block.appendChild(input);
      var row2 = el('div', 'form-row');
      var save = el('button', 'btn btn-accent'); save.type = 'button'; save.textContent = 'Save key';
      var test2 = el('button', 'btn btn-small btn-ghost'); test2.type = 'button'; test2.textContent = 'Test key';
      row2.appendChild(save); row2.appendChild(test2);
      if (settings.openrouterKey) {
        var cancel = el('button', 'btn btn-small btn-ghost'); cancel.type = 'button'; cancel.textContent = 'Cancel';
        row2.appendChild(cancel);
        cancel.addEventListener('click', function () { draw(false); });
      }
      block.appendChild(row2);
      zone.appendChild(block);
      save.addEventListener('click', function () {
        var v = input.value.trim();
        if (!v) { toast('Paste your API key first', 'error'); return; }
        settings.openrouterKey = v;
        saveSettings();
        input.value = '';
        draw(false);
        toast('API key saved on this device');
      });
      test2.addEventListener('click', function () {
        var v = input.value.trim() || settings.openrouterKey;
        testKey(v, test2);
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); save.click(); }
      });
    }
  }
  draw(false);
  return card;
}

/* --- Model picker card --- */
function buildModelCard() {
  var card = el('section', 'set-card');
  card.appendChild(setTitle('AI model'));
  card.appendChild(setDesc('Pick which OpenRouter model answers in Chat. Refresh loads the live model list; search filters it.'));

  var cur = el('p', 'model-current');
  function drawCurrent() {
    cur.innerHTML = '';
    cur.appendChild(text('Current model: '));
    var b = el('b'); b.textContent = settings.model || CFG.defaultModel || 'openrouter/auto';
    cur.appendChild(b);
  }
  drawCurrent();
  card.appendChild(cur);

  var row = el('div', 'form-row');
  var refresh = el('button', 'btn btn-small'); refresh.type = 'button'; refresh.textContent = 'Refresh models';
  var search = document.createElement('input');
  search.type = 'search';
  search.className = 'text-input';
  search.placeholder = 'Search models\u2026';
  search.setAttribute('aria-label', 'Search models');
  search.disabled = true;
  row.appendChild(refresh);
  row.appendChild(search);
  card.appendChild(row);

  var customBlock = el('div', 'field-block');
  var clab = el('label', 'field-label');
  clab.setAttribute('for', 'set-custom-model');
  clab.textContent = 'Or use a custom model id';
  var crow = el('div', 'form-row');
  var cinput = document.createElement('input');
  cinput.type = 'text';
  cinput.id = 'set-custom-model';
  cinput.className = 'text-input';
  cinput.placeholder = 'e.g. anthropic/claude-opus-4-6';
  cinput.spellcheck = false;
  cinput.autocomplete = 'off';
  var cuse = el('button', 'btn btn-small btn-ghost'); cuse.type = 'button'; cuse.textContent = 'Use this model';
  crow.appendChild(cinput); crow.appendChild(cuse);
  customBlock.appendChild(clab); customBlock.appendChild(crow);
  card.appendChild(customBlock);

  var listWrap = el('div');
  card.appendChild(listWrap);

  var models = null;

  function selectModel(id) {
    settings.model = id;
    saveSettings();
    drawCurrent();
    var rows = listWrap.querySelectorAll('.model-row');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('selected', rows[i].getAttribute('data-id') === id);
    }
    toast('Model set to ' + id);
  }

  function drawList() {
    listWrap.innerHTML = '';
    if (!models) return;
    var q = search.value.trim().toLowerCase();
    var shown = models.filter(function (m) {
      if (!q) return true;
      return (m.id || '').toLowerCase().indexOf(q) >= 0 ||
             (m.name || '').toLowerCase().indexOf(q) >= 0;
    });
    if (!shown.length) {
      var none = el('div', 'model-error');
      none.textContent = q ? 'No models match your search.' : 'No models found.';
      listWrap.appendChild(none);
      return;
    }
    var list = el('div', 'model-list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Available models');
    shown.slice(0, 300).forEach(function (m) {
      var b = el('button', 'model-row' + (m.id === settings.model ? ' selected' : ''));
      b.type = 'button';
      b.setAttribute('data-id', m.id);
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', m.id === settings.model ? 'true' : 'false');
      var tip = (m.name || m.id) + ' \u00B7 context ' + fmtCtx(m.context_length);
      if (m.description) tip += '\n\n' + String(m.description).slice(0, 280);
      b.title = tip;
      var idSpan = el('span', 'model-id'); idSpan.textContent = m.id;
      var ctx = el('span', 'model-ctx'); ctx.textContent = fmtCtx(m.context_length);
      var chk = el('span', 'model-check'); chk.textContent = '\u2713';
      b.appendChild(idSpan); b.appendChild(ctx); b.appendChild(chk);
      b.addEventListener('click', function () { selectModel(m.id); });
      list.appendChild(b);
    });
    listWrap.appendChild(list);
    if (shown.length > 300) {
      var more = el('p', 'field-hint');
      more.textContent = 'Showing the first 300 matches \u2014 refine your search to narrow it down.';
      listWrap.appendChild(more);
    }
  }

  search.addEventListener('input', drawList);
  cuse.addEventListener('click', function () {
    var v = cinput.value.trim();
    if (!v) { toast('Enter a model id first', 'error'); return; }
    selectModel(v);
    cinput.value = '';
  });

  refresh.addEventListener('click', function () {
    refresh.disabled = true;
    var old = refresh.textContent;
    refresh.textContent = 'Loading\u2026';
    listWrap.innerHTML = '';
    var headers = {};
    if (settings.openrouterKey) headers.Authorization = 'Bearer ' + settings.openrouterKey;
    fetch(CFG.openRouterModelsUrl, { headers: headers })
      .then(function (res) {
        if (!res.ok) throw new Error(httpErrorMessage(res.status, ''));
        return res.json();
      })
      .then(function (j) {
        var data = (j && j.data) || [];
        models = data
          .filter(function (m) { return m && m.id; })
          .sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });
        search.disabled = false;
        drawList();
        toast(models.length + ' models loaded');
      })
      .catch(function (e) {
        var err = el('div', 'model-error');
        err.appendChild(text('Couldn\u2019t load the model list (' + (e && e.message ? e.message : 'network error') + '). '));
        var retry = el('button', 'btn btn-small'); retry.type = 'button'; retry.textContent = 'Try again';
        retry.addEventListener('click', function () { refresh.click(); });
        err.appendChild(document.createElement('br'));
        err.appendChild(retry);
        listWrap.appendChild(err);
      })
      .then(function () { refresh.disabled = false; refresh.textContent = old; });
  });

  return card;
}

/* --- Deployment card --- */
function buildDeployCard() {
  var card = el('section', 'set-card');
  card.appendChild(setTitle('Deployment'));
  card.appendChild(setDesc('Optional overrides. Leave the gateway empty to chat directly with OpenRouter.'));

  var gwBlock = el('div', 'field-block');
  var glab = el('label', 'field-label');
  glab.setAttribute('for', 'set-gateway');
  glab.textContent = 'Gateway URL (optional)';
  var ginput = document.createElement('input');
  ginput.type = 'url';
  ginput.id = 'set-gateway';
  ginput.className = 'text-input';
  ginput.placeholder = 'https://your-deployment.example/chat';
  ginput.value = settings.gatewayUrl || '';
  ginput.autocomplete = 'off';
  ginput.spellcheck = false;
  gwBlock.appendChild(glab); gwBlock.appendChild(ginput);
  var ghint = el('p', 'field-hint');
  ghint.textContent = 'When set, Chat shows a \u201CGateway mode\u201D banner. Chat still talks directly to OpenRouter in this build.';
  gwBlock.appendChild(ghint);
  card.appendChild(gwBlock);

  var dlBlock = el('div', 'field-block');
  var dlab = el('label', 'field-label');
  dlab.setAttribute('for', 'set-dlurl');
  dlab.textContent = 'Download page URL';
  var dinput = document.createElement('input');
  dinput.type = 'url';
  dinput.id = 'set-dlurl';
  dinput.className = 'text-input';
  dinput.placeholder = CFG.downloadPageUrl || 'download/';
  dinput.value = settings.downloadPageUrl || '';
  dinput.autocomplete = 'off';
  dinput.spellcheck = false;
  dlBlock.appendChild(dlab); dlBlock.appendChild(dinput);
  var dhint = el('p', 'field-hint');
  dhint.textContent = 'Used by the \u201CGet the app\u201D QR code. Leave empty to use the default from config.';
  dlBlock.appendChild(dhint);
  card.appendChild(dlBlock);

  var row = el('div', 'form-row');
  var save = el('button', 'btn btn-accent'); save.type = 'button'; save.textContent = 'Save deployment settings';
  row.appendChild(save);
  card.appendChild(row);
  save.addEventListener('click', function () {
    settings.gatewayUrl = ginput.value.trim();
    settings.downloadPageUrl = dinput.value.trim();
    saveSettings();
    toast('Deployment settings saved');
  });
  return card;
}

/* --- Appearance card --- */
function buildAppearanceCard() {
  var card = el('section', 'set-card');
  card.appendChild(setTitle('Appearance'));
  card.appendChild(setDesc('Pick an accent theme. It applies instantly everywhere.'));
  var picker = el('div', 'accent-picker');
  var opts = [
    { id: 'gold', label: 'Gold', sw: 'swatch-gold' },
    { id: 'azure', label: 'Azure', sw: 'swatch-azure' },
    { id: 'violet', label: 'Violet', sw: 'swatch-violet' },
    { id: 'showcase', label: 'Showcase', sw: 'swatch-showcase' }
  ];
  opts.forEach(function (o) {
    var b = el('button', 'accent-opt' + (settings.accent === o.id ? ' selected' : ''));
    b.type = 'button';
    b.setAttribute('data-accent-opt', o.id);
    var sw = el('span', 'swatch ' + o.sw);
    sw.setAttribute('aria-hidden', 'true');
    b.appendChild(sw);
    b.appendChild(text(o.label));
    b.addEventListener('click', function () {
      settings.accent = o.id;
      saveSettings();
      applyAccent();
      var all = picker.querySelectorAll('.accent-opt');
      for (var i = 0; i < all.length; i++) {
        all[i].classList.toggle('selected', all[i].getAttribute('data-accent-opt') === o.id);
      }
      toast('Accent theme: ' + o.label);
    });
    picker.appendChild(b);
  });
  card.appendChild(picker);
  return card;
}

/* --- About card --- */
function buildAboutCard() {
  var card = el('section', 'set-card');
  card.appendChild(setTitle('About'));
  var rows = el('div', 'about-rows');
  function addRow(k, vNode) {
    var r = el('div', 'about-row');
    var kk = el('span', 'k'); kk.textContent = k;
    var vv = el('span', 'v'); vv.appendChild(vNode);
    r.appendChild(kk); r.appendChild(vv);
    rows.appendChild(r);
  }
  addRow('App', text(brandName() + ' ' + appVersion()));
  addRow('Built on', text('OpenBot (MIT)'));
  var keyLink = el('a', '');
  keyLink.href = 'https://openrouter.ai/keys';
  keyLink.target = '_blank';
  keyLink.rel = 'noopener';
  keyLink.textContent = 'openrouter.ai/keys';
  addRow('API keys', keyLink);
  card.appendChild(rows);
  return card;
}

/* --- Updates card --- */
function checkForUpdates(statusEl, btn, silent) {
  statusEl.textContent = 'Checking\u2026';
  btn.textContent = 'Checking\u2026';
  btn.disabled = true;
  fetch('version.json?_=' + Date.now(), { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('the server answered ' + r.status);
      return r.json();
    })
    .then(function (d) {
      var latest = (d && (d.build || d.version)) || '';
      btn.disabled = false;
      if (latest && latest !== appBuild()) {
        statusEl.textContent = 'build ' + latest + ' \u2014 update available';
        btn.textContent = 'Update now';
        btn.onclick = applyUpdate;
        if (!silent) toast('An update is ready \u2014 tap Update now');
      } else {
        statusEl.textContent = 'build ' + (latest || appBuild()) + ' \u2014 up to date';
        btn.textContent = 'Check again';
        btn.onclick = function () { checkForUpdates(statusEl, btn, false); };
        if (!silent) toast('The app is up to date');
      }
    })
    .catch(function (e) {
      btn.disabled = false;
      statusEl.textContent = 'Could not check (' + (e && e.message ? e.message : e) + ')';
      btn.textContent = 'Try again';
      btn.onclick = function () { checkForUpdates(statusEl, btn, false); };
    });
}

function applyUpdate() {
  toast('Updating\u2026');
  var jobs = [];
  try {
    if (window.caches && caches.keys) {
      jobs.push(caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }));
    }
  } catch (e) { /* no CacheStorage */ }
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister(); }));
      }));
    }
  } catch (e) { /* no service worker */ }
  var go = function () {
    location.replace(location.pathname + '?fresh=' + Date.now() + location.hash);
  };
  Promise.all(jobs).then(go, go);
}

function buildUpdateCard() {
  var card = el('section', 'set-card');
  card.appendChild(setTitle('App updates'));
  card.appendChild(setDesc('The app asks this deployment for a newer build. Updating clears the copy saved on this device and reloads.'));
  var row = el('div', 'form-row');
  var status = el('div', 'key-status');
  status.appendChild(el('span', 'dot'));
  var label = el('span', 'key-masked');
  label.textContent = 'build ' + appBuild();
  status.appendChild(label);
  row.appendChild(status);
  row.appendChild(el('span', 'spacer'));
  var btn = el('button', 'btn btn-small');
  btn.type = 'button';
  btn.textContent = 'Check for updates';
  btn.onclick = function () { checkForUpdates(label, btn, false); };
  row.appendChild(btn);
  card.appendChild(row);
  checkForUpdates(label, btn, true);
  return card;
}

function renderSettings() {
  view.innerHTML = '';
  var wrap = el('div', 'settings');
  wrap.appendChild(pageHead('Settings', 'Keys, models, deployment, and appearance.'));
  wrap.appendChild(buildKeyCard());
  wrap.appendChild(buildModelCard());
  wrap.appendChild(buildDeployCard());
  wrap.appendChild(buildUpdateCard());
  wrap.appendChild(buildAppearanceCard());
  wrap.appendChild(buildAboutCard());
  view.appendChild(wrap);
}

/* ---------- 8. Vault ---------- */
function renderVault(r) {
  var notes = Array.isArray(window.VAULT_NOTES) ? window.VAULT_NOTES : [];
  view.innerHTML = '';
  var wrap = el('div', 'vault');
  if (!notes.length) {
    wrap.appendChild(emptyState('Vault is empty', 'No notes were found.'));
    view.appendChild(wrap);
    return;
  }
  var id = r.param || '';
  var sel = null;
  for (var i = 0; i < notes.length; i++) {
    if (String(notes[i].id) === id) { sel = notes[i]; break; }
  }
  wrap.classList.add(sel ? 'reader-mode' : 'list-mode');

  var list = el('aside', 'vault-list');
  list.setAttribute('aria-label', 'Notes');
  notes.forEach(function (n) {
    var a = el('a', 'vault-note-item' + (sel && String(sel.id) === String(n.id) ? ' active' : ''));
    a.href = '#/vault/' + encodeURIComponent(n.id);
    var t = el('div', 'vault-note-title'); t.textContent = n.title || n.id;
    var m = el('div', 'vault-note-meta'); m.textContent = n.updated || '';
    a.appendChild(t); a.appendChild(m);
    list.appendChild(a);
  });
  wrap.appendChild(list);

  var reader = el('article', 'vault-reader');
  if (!sel) {
    var ph = el('div', 'empty-state');
    var pht = el('h2'); pht.textContent = 'Select a note';
    var php = el('p'); php.textContent = 'Choose a note from the list to read it here.';
    ph.appendChild(pht); ph.appendChild(php);
    reader.appendChild(ph);
  } else {
    var back = el('a', 'back-link vault-back');
    back.href = '#/vault';
    back.textContent = '\u2190 All notes';
    reader.appendChild(back);
    var h1 = el('h1', 'fire'); h1.textContent = sel.title || sel.id;
    reader.appendChild(h1);
    if (sel.updated) {
      var meta = el('p', 'muted small'); meta.textContent = 'Updated ' + sel.updated;
      reader.appendChild(meta);
    }
    var body = el('div', 'md');
    if (typeof window.renderMarkdown === 'function') {
      body.innerHTML = window.renderMarkdown(sel.body || '');
    } else {
      body.textContent = sel.body || '';
      body.style.whiteSpace = 'pre-wrap';
    }
    reader.appendChild(body);
    if (sel.links && sel.links.length) {
      var lh = el('h3'); lh.textContent = 'Linked notes';
      reader.appendChild(lh);
      var chips = el('div', 'link-chips');
      sel.links.forEach(function (lid) {
        var target = null;
        for (var k = 0; k < notes.length; k++) {
          if (String(notes[k].id) === String(lid)) { target = notes[k]; break; }
        }
        var a2 = el('a', 'chip link-chip');
        a2.href = '#/vault/' + encodeURIComponent(lid);
        a2.textContent = target ? (target.title || target.id) : String(lid);
        chips.appendChild(a2);
      });
      reader.appendChild(chips);
    }
  }
  wrap.appendChild(reader);
  view.appendChild(wrap);
}

/* ---------- 9. Help ---------- */
function renderHelp(r) {
  var pages = Array.isArray(window.HELP_PAGES) ? window.HELP_PAGES : [];
  view.innerHTML = '';
  var wrap = el('div', 'help');

  if (!r.param) {
    wrap.appendChild(pageHead('Help', 'Guides and answers for ' + brandName() + '.'));
    if (!pages.length) {
      wrap.appendChild(emptyState('No help articles', 'Help content hasn\u2019t been added yet.'));
    } else {
      var grid = el('div', 'help-grid');
      pages.forEach(function (p) {
        var card = el('a', 'help-card');
        card.href = '#/help/' + encodeURIComponent(p.slug);
        var t = el('h3'); t.textContent = p.title || p.slug;
        var intro = el('p'); intro.textContent = p.intro || '';
        var more = el('span', 'read-more'); more.textContent = 'Read \u2192';
        card.appendChild(t); card.appendChild(intro); card.appendChild(more);
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
    }
  } else {
    var pg = null;
    for (var i = 0; i < pages.length; i++) {
      if (String(pages[i].slug) === r.param) { pg = pages[i]; break; }
    }
    if (!pg) {
      wrap.appendChild(emptyState('Article not found', 'That help article doesn\u2019t exist.'));
      var back0 = el('a', 'back-link'); back0.href = '#/help'; back0.textContent = '\u2190 All articles';
      wrap.appendChild(back0);
    } else {
      var back = el('a', 'back-link'); back.href = '#/help'; back.textContent = '\u2190 All articles';
      wrap.appendChild(back);
      var art = el('article', 'help-article');
      var h1 = el('h1', 'fire'); h1.textContent = pg.title || pg.slug;
      art.appendChild(h1);
      if (pg.intro) {
        var lead = el('p', 'lead'); lead.textContent = pg.intro;
        art.appendChild(lead);
      }
      (pg.sections || []).forEach(function (s) {
        var sec = el('section');
        if (s.h) { var h2 = el('h2'); h2.textContent = s.h; sec.appendChild(h2); }
        if (s.html) {
          var div = el('div', 'md');
          div.innerHTML = s.html; /* sibling-provided trusted content */
          sec.appendChild(div);
        }
        art.appendChild(sec);
      });
      wrap.appendChild(art);
    }
  }
  view.appendChild(wrap);
}

/* ---------- 10. Graph ---------- */
function renderGraph() {
  var notes = Array.isArray(window.VAULT_NOTES) ? window.VAULT_NOTES : [];
  view.innerHTML = '';
  var wrap = el('div', 'graph');

  var toolbar = el('div', 'graph-toolbar');
  var search = document.createElement('input');
  search.type = 'search';
  search.className = 'text-input graph-search';
  search.placeholder = 'Search notes\u2026';
  search.setAttribute('aria-label', 'Search notes');
  var count = el('span', 'chip graph-count');
  toolbar.appendChild(search);
  toolbar.appendChild(count);
  wrap.appendChild(toolbar);

  var stage = el('div', 'graph-canvas-wrap');
  var canvas = document.createElement('canvas');
  canvas.className = 'graph-canvas';
  canvas.setAttribute('aria-label', 'Knowledge graph. Select a node to open the note.');
  stage.appendChild(canvas);
  if (!notes.length) {
    var ov = el('div', 'graph-empty');
    ov.textContent = 'No notes to graph yet.';
    stage.appendChild(ov);
  }
  wrap.appendChild(stage);
  view.appendChild(wrap);

  function linkCount(ns) {
    var m = 0;
    for (var i = 0; i < ns.length; i++) {
      if (ns[i].links && ns[i].links.length) m += ns[i].links.length;
    }
    return m;
  }
  function draw() {
    var q = search.value.trim().toLowerCase();
    var list = notes;
    if (q) {
      list = notes.filter(function (n) {
        return (n.title || '').toLowerCase().indexOf(q) >= 0 ||
               String(n.id).toLowerCase().indexOf(q) >= 0;
      });
    }
    count.textContent = list.length + ' notes \u00B7 ' + linkCount(list) + ' links';
    var rect = stage.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width));
    canvas.height = Math.max(1, Math.round(rect.height));
    if (typeof window.renderGraph === 'function' && list.length) {
      try {
        window.renderGraph(canvas, list, function (nid) {
          location.hash = '#/vault/' + encodeURIComponent(nid);
        });
      } catch (e) { /* graph lib error: leave canvas blank */ }
    }
  }
  draw();

  var deb = null;
  search.addEventListener('input', function () {
    if (deb) clearTimeout(deb);
    deb = setTimeout(draw, 200);
  });
  var rdeb = null;
  function onResize() {
    if (rdeb) clearTimeout(rdeb);
    rdeb = setTimeout(draw, 250);
  }
  window.addEventListener('resize', onResize);
  graphCleanup = function () { window.removeEventListener('resize', onResize); };
}

/* ---------- 11. Init ---------- */
function initBrand() {
  var n = $('#brand-name');
  if (n) n.textContent = brandName();
  var tag = $('#brand-tag');
  if (tag && CFG.tagline) tag.textContent = CFG.tagline;
  document.title = brandName();
}

function init() {
  applyAccent();
  initBrand();

  var getApp = $('#get-app-btn');
  if (getApp) getApp.addEventListener('click', openQRModal);
  var closeBtn = $('#qr-close');
  if (closeBtn) closeBtn.addEventListener('click', closeQRModal);
  var dlg = $('#qr-modal');
  if (dlg) {
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) closeQRModal();
    });
  }
  var copyBtn = $('#qr-copy');
  if (copyBtn) copyBtn.addEventListener('click', copyDownloadLink);

  if (!location.hash) location.hash = '#/chat';
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* ============================================================
 * Platform screens: Bots and Computer (live screen + take control)
 * These talk to the deployment this app is served from, at /app/.
 * ============================================================ */

function renderActivity() {
  view.innerHTML = '';
  view.appendChild(pageHead('Activity', 'What the bots have done, from the deployment\u2019s audit trail.'));

  var list = el('div', 'activity-list');
  var loading = el('p', 'muted');
  loading.textContent = 'Loading\u2026';
  list.appendChild(loading);
  view.appendChild(list);

  api('/api/admin/audit-events?limit=60').then(function (d) {
    var events = (d && d.events) || [];
    list.textContent = '';
    if (!events.length) {
      list.appendChild(emptyState('Nothing yet', 'Actions the bots take will appear here.'));
      return;
    }
    var lastDay = '';
    events.forEach(function (ev) {
      var when = new Date(ev.createdAt);
      var day = when.toDateString();
      if (day !== lastDay) {
        lastDay = day;
        var dh = el('h2', 'act-day');
        dh.textContent = day === new Date().toDateString() ? 'Today' : day;
        list.appendChild(dh);
      }
      var item = el('div', 'act-item');
      var dot = el('span', 'act-dot ' + kindClass(ev.eventType));
      var body = el('div', 'act-body');
      var line = el('div', 'act-line');
      var who = el('b');
      who.textContent = (ev.payload && ev.payload.bot) || ev.targetId || 'deployment';
      line.appendChild(who);
      line.appendChild(document.createTextNode(' \u00b7 ' + prettyEvent(ev.eventType)));
      var meta = el('div', 'act-meta');
      var bits = [];
      if (ev.payload && ev.payload.action) bits.push(ev.payload.action);
      if (ev.payload && ev.payload.page) bits.push(ev.payload.page);
      if (ev.payload && ev.payload.file) bits.push(ev.payload.file);
      meta.textContent = bits.join(' \u00b7 ') || (ev.targetType + (ev.targetId ? ' ' + ev.targetId : ''));
      var time = el('div', 'act-time');
      time.textContent = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      body.appendChild(line);
      body.appendChild(meta);
      item.appendChild(dot);
      item.appendChild(body);
      item.appendChild(time);
      list.appendChild(item);
    });
  }).catch(function (e) {
    list.textContent = '';
    list.appendChild(emptyState('Cannot reach the deployment', e.message +
      ' Open this app from the deployment itself (…/app/) so it shares the sign-in.'));
  });
}

function prettyEvent(type) {
  var map = {
    'computer.action_allowed': 'an action was allowed',
    'computer.action_refused': 'an action was refused',
    'computer.control_taken': 'a person took the wheel',
    'computer.control_released': 'the wheel went back to the bot',
    'computer.control_requested': 'the bot asked for help',
    'computer.policy_loaded': 'policy loaded',
    'computer.isolation_loaded': 'computer mode set'
  };
  return map[type] || type.replace(/[._]/g, ' ');
}
function kindClass(type) {
  if (/refus|fail|error/.test(type)) return 'bad';
  if (/control|help|request/.test(type)) return 'warn';
  if (/allowed|ok|loaded/.test(type)) return 'ok';
  return '';
}

/* Vault and Graph come from the deployment when this app is served by one
 * (…/app/), and fall back to the app's own local copies otherwise. */
function deploymentHas(path) {
  return fetch(path, { method: 'HEAD' }).then(function (r) { return r.ok; }).catch(function () { return false; });
}
function renderDeploymentFrame(path, title, sub) {
  view.innerHTML = '';
  /* The vault and the graph are their own pages; give them the whole view
     instead of a column beside a heading. */
  view.className = 'view view-deploy';
  var box = el('div', 'frame-box');
  var frame = document.createElement('iframe');
  frame.className = 'deploy-frame';
  frame.src = path;
  frame.setAttribute('title', title);
  box.appendChild(frame);
  view.appendChild(box);
}

function renderBots() {
  view.innerHTML = '';
  view.appendChild(pageHead('AI Coworkers', 'Bots on this deployment \u2014 each with its own computer.'));

  var list = el('div', 'bots-list');
  var loading = el('p', 'muted');
  loading.textContent = 'Loading\u2026';
  list.appendChild(loading);
  view.appendChild(list);

  api('/api/agents').then(function (d) {
    var bots = (d && d.agents) || [];
    list.textContent = '';
    if (!bots.length) {
      list.appendChild(emptyState('No bots yet', 'Create one in the deployment and it will appear here.'));
      return;
    }
    bots.forEach(function (b) {
      var card = el('a', 'bot-card');
      card.href = '#/computer/' + encodeURIComponent(b.id);
      var av = el('div', 'bot-avatar');
      av.textContent = (b.name || '?').slice(0, 1);
      var body = el('div', 'bot-body');
      var n = el('div', 'bot-name');
      n.textContent = b.name || b.id;
      var sub = el('div', 'bot-sub');
      sub.textContent = b.title || b.roleDescription || '';
      body.appendChild(n);
      body.appendChild(sub);
      var chev = el('div', 'bot-chev');
      chev.textContent = '\u203a';
      card.appendChild(av);
      card.appendChild(body);
      card.appendChild(chev);
      list.appendChild(card);
    });
  }).catch(function (e) {
    list.textContent = '';
    list.appendChild(emptyState('Cannot reach the deployment', e.message +
      ' Open this app from the deployment itself (for example /app/ on its address) so it shares the sign-in.'));
  });
}

function renderComputer(r) {
  var botId = r.param || '';
  if (!botId) {
    view.appendChild(emptyState('No bot chosen', 'Pick one from Bots.'));
    return;
  }

  view.innerHTML = '';
  var head = el('div', 'view-head');
  var h1 = el('h1', 'fire');
  h1.textContent = 'Computer';
  var sub = el('p', 'muted');
  sub.textContent = botId;
  head.appendChild(h1);
  head.appendChild(sub);
  view.appendChild(head);

  var stage = el('div', 'screen-stage');
  var img = el('img', 'screen-img');
  img.alt = 'The bot\u2019s screen';
  var placeholder = el('div', 'screen-wait');
  placeholder.textContent = 'Connecting to the bot\u2019s screen\u2026';
  stage.appendChild(img);
  stage.appendChild(placeholder);
  view.appendChild(stage);

  var bar = el('div', 'wheel-bar');
  var take = el('button', 'btn btn-accent');
  take.textContent = 'Take Control';
  var status = el('div', 'wheel-status');
  status.textContent = 'Checking\u2026';
  bar.appendChild(take);
  bar.appendChild(status);
  view.appendChild(bar);

  var panel = el('div', 'human-panel');
  panel.style.display = 'none';
  var hint = el('p', 'muted');
  hint.textContent = 'You have the wheel. Tap the screen to click, type below, or scroll with the buttons.';
  var row = el('div', 'human-row');
  var input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Type into the bot\u2019s screen\u2026';
  var sendBtn = el('button', 'btn');
  sendBtn.textContent = 'Send';
  row.appendChild(input);
  row.appendChild(sendBtn);
  var scrollRow = el('div', 'human-row');
  var up = el('button', 'btn btn-quiet'); up.textContent = 'Scroll up';
  var down = el('button', 'btn btn-quiet'); down.textContent = 'Scroll down';
  scrollRow.appendChild(up);
  scrollRow.appendChild(down);
  panel.appendChild(hint);
  panel.appendChild(row);
  panel.appendChild(scrollRow);
  view.appendChild(panel);

  var frameSize = { w: 1280, h: 800 };
  var holder = '';
  var ws = null;
  var poll = null;

  try {
    ws = new WebSocket(wsUrl('/api/computers/' + encodeURIComponent(botId) + '/stream'));
    ws.onmessage = function (ev) {
      var m = null;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m && m.type === 'frame' && m.data) {
        frameSize = { w: m.width || frameSize.w, h: m.height || frameSize.h };
        img.src = 'data:image/jpeg;base64,' + m.data;
        if (placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
      }
    };
    ws.onerror = function () {
      placeholder.textContent = 'Could not reach this bot\u2019s computer.';
    };
  } catch (e) {
    placeholder.textContent = 'Could not open the screen stream.';
  }

  function applyHolder() {
    var human = holder === 'human';
    take.textContent = human ? 'Return Control to Bot' : 'Take Control';
    status.textContent = human ? 'You are in control' : 'Bot is operating';
    panel.style.display = human ? 'block' : 'none';
    img.classList.toggle('is-human', human);
  }

  function refreshControl() {
    api('/api/computers/' + encodeURIComponent(botId) + '/control').then(function (d) {
      holder = (d && d.holder) || 'bot';
      applyHolder();
    }).catch(function () {
      status.textContent = 'Control state unavailable';
    });
  }

  take.addEventListener('click', function () {
    var path = holder === 'human' ? '/control/release' : '/control/take';
    take.disabled = true;
    apiPost('/api/computers/' + encodeURIComponent(botId) + path, {}).then(function () {
      take.disabled = false;
      refreshControl();
    }).catch(function (e) {
      take.disabled = false;
      status.textContent = e.message;
    });
  });

  img.addEventListener('click', function (e) {
    if (holder !== 'human') return;
    var rect = img.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var x = Math.round((e.clientX - rect.left) / rect.width * frameSize.w);
    var y = Math.round((e.clientY - rect.top) / rect.height * frameSize.h);
    apiPost('/api/computers/' + encodeURIComponent(botId) + '/human/click', { x: x, y: y }).catch(function () {});
  });

  sendBtn.addEventListener('click', function () {
    var text = input.value;
    if (!text) return;
    apiPost('/api/computers/' + encodeURIComponent(botId) + '/human/type', { text: text })
      .then(function () { input.value = ''; })
      .catch(function (e) { status.textContent = e.message; });
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); sendBtn.click(); }
  });
  up.addEventListener('click', function () {
    apiPost('/api/computers/' + encodeURIComponent(botId) + '/human/scroll', { deltaY: -600 }).catch(function () {});
  });
  down.addEventListener('click', function () {
    apiPost('/api/computers/' + encodeURIComponent(botId) + '/human/scroll', { deltaY: 600 }).catch(function () {});
  });

  refreshControl();
  poll = setInterval(refreshControl, 4000);

  graphCleanup = function () {
    if (poll) clearInterval(poll);
    try { if (ws) ws.close(); } catch (e) {}
  };
}
})();
