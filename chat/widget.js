/* ============================================================
   TWITCH CHAT WIDGET — Frosted Glass Style
   StreamElements Custom Widget JS
   ============================================================ */

var fields = {
  max_messages:       6,
  show_avatar:        true,
  show_badges:        true,
  show_role:          true,
  show_timestamp:     false,
  show_header:        true,
  font_size:          'medium',
  font_color:         'rgba(255,255,255,0.90)',
  font_family:        'default',
  theme:              'dark',
  auto_hide_secs:     0,
  transparent_bg:     true,
  color_broadcaster:  '#fbbf24',
  color_moderator:    '#22c55e',
  color_vip:          '#f472b6',
  color_subscriber:   '#a78bfa',
  color_viewer:       ''
};

var _hideTimer  = null;
var _msgCount   = 0;
var _visible    = false;
var _seenIds    = {};

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

/* ---- Twitch CDN fallback URLs for common badge types ---- */
var BADGE_URLS = {
  broadcaster: 'https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/1',
  moderator:   'https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/1',
  vip:         'https://static-cdn.jtvnw.net/badges/v1/b817aba4-fad8-49e2-b88a-7cc744dfa6ec/1',
  subscriber:  'https://static-cdn.jtvnw.net/badges/v1/5d9f2208-5dd8-11e7-8513-2ff4adfae661/1',
  staff:       'https://static-cdn.jtvnw.net/badges/v1/d97c37bd-a6f5-4c38-8f57-4e4bef88af34/1',
  partner:     'https://static-cdn.jtvnw.net/badges/v1/d12a2e27-16f6-41d0-ab77-b780518f00a3/1'
};

/* ---- Badge HTML — uses SE-provided URL first, Twitch CDN as fallback ---- */
function renderBadges(badges) {
  if (!fields.show_badges || !badges || !badges.length) return '';
  var html = '<span class="chat-badges">';
  for (var i = 0; i < badges.length; i++) {
    var b    = badges[i];
    var type = (b.type || '').toLowerCase();
    var url  = b.url || BADGE_URLS[type] || '';
    if (!url) continue;
    html += '<img class="chat-badge" src="' + url + '" alt="' + type + '" title="' + type + '">';
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

/* ---- Detect role from badges ---- */
function detectRole(badges) {
  for (var i = 0; i < badges.length; i++) {
    var t = (badges[i].type || '').toLowerCase();
    if (t === 'broadcaster') return 'broadcaster';
    if (t === 'moderator')   return 'moderator';
    if (t === 'vip')         return 'vip';
    if (t === 'subscriber')  return 'subscriber';
  }
  return 'viewer';
}

/* ---- Add message ---- */
function addMessage(data) {
  var container = document.getElementById('chat-messages');
  if (!container) return;

  /* Deduplicate — SE can fire the same event twice */
  var msgId = data.msgId || data.id || (data.tags && data.tags.id);
  if (msgId) {
    if (_seenIds[msgId]) return;
    _seenIds[msgId] = true;
    var keys = Object.keys(_seenIds);
    if (keys.length > 200) delete _seenIds[keys[0]];
  }

  /* SE uses different field names across versions — check all */
  var displayName = data.displayName || data.name || data.username || data.nick || 'User';
  var text        = data.renderedText || data.text || '';
  var badges      = data.badges || [];
  var tagColor    = (data.tags && data.tags.color) || null;
  var initial     = displayName.charAt(0).toUpperCase();
  var avatarBg    = usernameColor(displayName);

  /* Name color: role color > Twitch tag color > username hash */
  var role      = detectRole(badges);
  var roleColor = fields['color_' + role];
  var userColor = (roleColor && roleColor !== '')
    ? roleColor
    : (tagColor && tagColor !== '#000000' && tagColor !== '') ? tagColor : usernameColor(displayName);

  /* Avatar — merge top-level and nested data to catch avatar at either level.
     SE provides profileImage / avatar on event.data for real Twitch chat.
     unavatar.io is the fallback proxy when SE doesn't supply it. */
  var avatarHtml = '';
  if (fields.show_avatar) {
    var uname  = (data.username || data.name || displayName).toLowerCase().replace(/[^a-z0-9_]/g, '');
    var imgUrl = data.avatar || data.profileImage || data.profile_image_url
              || ('https://unavatar.io/twitch/' + uname);
    avatarHtml =
      '<div class="chat-avatar chat-avatar-wrap" style="background:' + avatarBg + '" title="' + esc(displayName) + '">' +
        '<img class="chat-avatar-img" src="' + imgUrl + '" alt="" ' +
          'onerror="this.style.display=\'none\';this.parentNode.classList.add(\'chat-avatar-fallback\')">' +
        '<span class="chat-avatar-initial">' + initial + '</span>' +
      '</div>';
  }

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
var _fontLinkEl = null;
var GOOGLE_FONTS = {
  roboto:       'Roboto',
  oswald:       'Oswald',
  montserrat:   'Montserrat',
  lato:         'Lato',
  nunito:       'Nunito',
  pressstart:   'Press+Start+2P',
  bangers:      'Bangers'
};
var FONT_STACKS = {
  default:    "'Inter', 'Segoe UI', sans-serif",
  roboto:     "'Roboto', sans-serif",
  oswald:     "'Oswald', sans-serif",
  montserrat: "'Montserrat', sans-serif",
  lato:       "'Lato', sans-serif",
  nunito:     "'Nunito', sans-serif",
  pressstart: "'Press Start 2P', cursive",
  bangers:    "'Bangers', cursive"
};

function applyAppearance() {
  var root    = document.documentElement;
  var widget  = document.getElementById('chat-widget');
  if (!widget) return;

  /* Font size + color */
  var fsMap = { small: '12px', medium: '14px', large: '16px', xl: '20px', xxl: '24px', xxxl: '30px' };
  root.style.setProperty('--chat-font-size',  fsMap[fields.font_size] || '14px');
  if (fields.font_color) {
    root.style.setProperty('--chat-text-color', fields.font_color);
  }

  /* Font family — load Google Font if needed */
  var ff = fields.font_family || 'default';
  if (ff !== 'default' && GOOGLE_FONTS[ff]) {
    if (!_fontLinkEl) {
      _fontLinkEl = document.createElement('link');
      _fontLinkEl.rel = 'stylesheet';
      document.head.appendChild(_fontLinkEl);
    }
    _fontLinkEl.href = 'https://fonts.googleapis.com/css2?family=' + GOOGLE_FONTS[ff] + '&display=swap';
  }
  root.style.setProperty('--chat-font', FONT_STACKS[ff] || FONT_STACKS.default);

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

  if (detail.listener === 'message') {
    var ev = detail.event || {};
    /* Merge top-level event fields with nested data object so avatar/profileImage
       is found regardless of which level SE places it at */
    var msg = ev.data ? Object.assign({}, ev, ev.data) : ev;
    addMessage(msg);
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
