/* ============================================================
   TWITCH CHAT WIDGET — Frosted Glass Style
   StreamElements Custom Widget JS
   ============================================================ */

var fields = {
  max_messages:    6,
  show_avatar:     true,
  show_badges:     true,
  show_role:       true,
  show_timestamp:  false,
  show_header:     true,
  font_size:       'medium',
  theme:           'dark',
  auto_hide_secs:  0,
  transparent_bg:  true
};

var _hideTimer  = null;
var _msgCount   = 0;
var _visible    = false;

/* ---- Deterministic color from username ---- */
var COLORS = [
  '#ff6b6b','#feca57','#48dbfb','#ff9ff3','#54a0ff',
  '#5f27cd','#00d2d3','#1dd1a1','#ff9f43','#ee5a24',
  '#a29bfe','#fd79a8','#6c5ce7','#00b894','#e17055'
];
function usernameColor(name) {
  var h = 0;
  for (var i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

/* ---- Role detection from badges ---- */
function getRole(badges) {
  if (!badges || !badges.length) return '';
  for (var i = 0; i < badges.length; i++) {
    var t = (badges[i].type || '').toLowerCase();
    if (t === 'broadcaster') return 'Streamer';
    if (t === 'moderator'  ) return 'Mod';
    if (t === 'vip'        ) return 'VIP';
    if (t === 'subscriber' ) return 'Sub';
  }
  return '';
}

/* ---- Badge HTML ---- */
function renderBadges(badges) {
  if (!fields.show_badges || !badges || !badges.length) return '';
  var html = '<span class="chat-badges">';
  for (var i = 0; i < badges.length; i++) {
    var b = badges[i];
    if (!b.url) continue;
    html += '<img class="chat-badge" src="' + b.url + '" alt="' + (b.type || '') + '" title="' + (b.type || '') + '">';
  }
  html += '</span>';
  return html;
}

/* ---- Timestamp (HH:MM) ---- */
function timestamp() {
  var d = new Date();
  var h = d.getHours().toString().padStart(2, '0');
  var m = d.getMinutes().toString().padStart(2, '0');
  return h + ':' + m;
}

/* ---- Escape HTML (for plain text portions) ---- */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---- Show widget ---- */
function showWidget() {
  var w = document.getElementById('chat-widget');
  if (!w) return;
  w.classList.remove('chat-hidden', 'chat-out');
  w.classList.add('chat-visible');
  _visible = true;
}

/* ---- Hide widget ---- */
function hideWidget() {
  var w = document.getElementById('chat-widget');
  if (!w) return;
  w.classList.remove('chat-visible');
  w.classList.add('chat-out');
  setTimeout(function() {
    w.classList.add('chat-hidden');
    w.classList.remove('chat-out');
    var c = document.getElementById('chat-messages');
    if (c) c.innerHTML = '';
    _visible = false;
  }, 500);
}

/* ---- Auto-hide timer ---- */
function resetHideTimer() {
  var secs = parseInt(fields.auto_hide_secs, 10) || 0;
  if (!secs) return;
  if (_hideTimer) clearTimeout(_hideTimer);
  _hideTimer = setTimeout(hideWidget, secs * 1000);
}

/* ---- Add message ---- */
function addMessage(data) {
  var container = document.getElementById('chat-messages');
  if (!container) return;

  var displayName = data.displayName || data.username || 'User';
  var text        = data.renderedText || data.text || '';
  var badges      = data.badges || [];
  var tagColor    = data.tags && data.tags.color ? data.tags.color : null;
  var userColor   = (tagColor && tagColor !== '#000000') ? tagColor : usernameColor(displayName);
  var role        = fields.show_role ? getRole(badges) : '';
  var initial     = displayName.charAt(0).toUpperCase();
  var avatarBg    = usernameColor(displayName);

  /* Avatar — try Twitch profile picture, fall back to colored initial */
  var avatarHtml = '';
  if (fields.show_avatar) {
    var username = (data.username || displayName).toLowerCase().replace(/[^a-z0-9_]/g, '');
    var imgUrl   = data.avatar || ('https://unavatar.io/twitch/' + username + '?fallback=false');
    avatarHtml =
      '<div class="chat-avatar chat-avatar-wrap" style="background:' + avatarBg + '" title="' + esc(displayName) + '">' +
        '<img class="chat-avatar-img" src="' + imgUrl + '" alt="" ' +
          'onerror="this.style.display=\'none\';this.parentNode.classList.add(\'chat-avatar-fallback\')">' +
        '<span class="chat-avatar-initial">' + initial + '</span>' +
      '</div>';
  }

  /* Role pill */
  var roleHtml = role
    ? '<span class="chat-role chat-role-' + role.toLowerCase() + '">' + role + '</span>'
    : '';

  /* Timestamp */
  var timeHtml = fields.show_timestamp
    ? '<div class="chat-time">' + timestamp() + '</div>'
    : '';

  /* Full message element */
  var msgEl = document.createElement('div');
  msgEl.className = 'chat-msg chat-msg-in';
  msgEl.id = 'cm-' + (++_msgCount);
  msgEl.innerHTML =
    avatarHtml +
    '<div class="chat-bubble">' +
      '<div class="chat-meta">' +
        renderBadges(badges) +
        '<span class="chat-name" style="color:' + userColor + '">' + esc(displayName) + '</span>' +
        roleHtml +
      '</div>' +
      '<div class="chat-text">' + text + '</div>' +
      timeHtml +
    '</div>';

  container.appendChild(msgEl);

  /* Enforce max message count — remove oldest first */
  var max = Math.max(1, parseInt(fields.max_messages, 10) || 6);
  var all = container.querySelectorAll('.chat-msg');
  if (all.length > max) {
    var toRemove = all.length - max;
    for (var i = 0; i < toRemove; i++) {
      var old = all[i];
      old.classList.remove('chat-msg-in');
      old.classList.add('chat-msg-out');
      (function(el) {
        setTimeout(function() { if (el.parentNode) el.parentNode.removeChild(el); }, 380);
      })(old);
    }
  }

  showWidget();
  resetHideTimer();
}

/* ---- Apply theme + appearance ---- */
function applyAppearance() {
  var root    = document.documentElement;
  var widget  = document.getElementById('chat-widget');
  if (!widget) return;

  /* Font size */
  var fsMap = { small: '12px', medium: '14px', large: '16px' };
  root.style.setProperty('--chat-font-size', fsMap[fields.font_size] || '14px');

  /* Theme class */
  widget.classList.remove('theme-frosted','theme-light','theme-minimal','theme-neon','theme-liquid','theme-dark');
  if (fields.theme && fields.theme !== 'dark') {
    widget.classList.add('theme-' + fields.theme);
  }

  /* Header bar visibility */
  var bar = document.querySelector('.chat-header-bar');
  if (bar) bar.style.display = fields.show_header ? '' : 'none';

  /* Transparent background */
  if (fields.transparent_bg) {
    widget.classList.add('chat-bg-transparent');
  } else {
    widget.classList.remove('chat-bg-transparent');
  }
}

/* ============================================================
   SE Widget lifecycle
   ============================================================ */
window.addEventListener('onWidgetLoad', function(e) {
  var detail = e.detail || {};
  fields = Object.assign(fields, detail.fieldData || {});
  applyAppearance();
});

window.addEventListener('onEventReceived', function(e) {
  var detail = e.detail;
  if (!detail || !detail.listener) return;

  /* Chat message */
  if (detail.listener === 'message') {
    addMessage(detail.event || {});
  }
});

/* ---- Preview / test mode ---- */
var _testNames = ['StreamerFan92','LunaPlays','xXDarkWolfXx','cozyvibes','TwitchUser'];
var _testMsgs  = [
  'Hype hype hype!! PogChamp',
  'Was ein krasser Stream heute :fire:',
  'gg ez keine chance gehabt LUL',
  'Wann kommt der naechste Drop?',
  'Erster Kommentar seit 3 Stunden xD'
];
var _testRoles = [
  [{ type: 'broadcaster', url: '' }],
  [{ type: 'moderator',   url: '' }],
  [{ type: 'vip',         url: '' }],
  [{ type: 'subscriber',  url: '' }],
  []
];
var _testIdx = 0;

function sendTestMessage() {
  var i = _testIdx % _testNames.length;
  addMessage({
    displayName:  _testNames[i],
    username:     _testNames[i].toLowerCase(),
    text:         _testMsgs[i % _testMsgs.length],
    renderedText: _testMsgs[i % _testMsgs.length],
    badges:       _testRoles[i % _testRoles.length],
    tags:         { color: '' }
  });
  _testIdx++;
}

/* SE test button in editor fires onTestMessageReceived */
window.addEventListener('onTestMessageReceived', function() {
  sendTestMessage();
});
