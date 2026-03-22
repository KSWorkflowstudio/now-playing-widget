/* ============================================================
   TWITCH CHAT WIDGET — Frosted Glass Style
   StreamElements Custom Widget JS
   ============================================================ */

var fields = {
  max_messages:         0,
  show_avatar:          true,
  show_badges:          true,
  show_timestamp:       false,
  show_header:          true,
  font_size:            'medium',
  font_color:           'rgba(255,255,255,0.90)',
  theme:                'dark',
  shape:                'default',
  animation:            'ios',
  custom_width:         0,
  custom_radius:        0,
  custom_blur:          0,
  scale:                1,
  text_align:           'left',
  auto_hide_secs:       0,
  transparent_bg:       true,
  avatar_size:          'medium',
  use_twitch_color:     true,
  username_fixed_color: '',
  color_broadcaster:    '#fbbf24',
  color_moderator:      '#22c55e',
  color_vip:            '#f472b6',
  color_subscriber:     '#a78bfa',
  color_viewer:         ''
};

var _hideTimer    = null;
var _msgCount     = 0;
var _visible      = false;
var _seenIds      = {};
var _avatarCache  = {};  /* username → jtvnw.net URL (or '' if not found) */
var _lastSender   = '';  /* for WhatsApp-style message grouping  */
var _currentSide  = 'left'; /* alternates left/right per user group */

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
  if (!w || _visible) return;
  _visible = true;
  w.classList.remove('chat-hidden', 'chat-anim-out');
  w.classList.add('chat-visible', 'chat-anim-in');
  setTimeout(function() { w.classList.remove('chat-anim-in'); }, 450);
}

/* ---- Hide widget ---- */
function hideWidget() {
  var w = document.getElementById('chat-widget');
  if (!w) return;
  _visible = false;
  w.classList.remove('chat-visible', 'chat-anim-in');
  w.classList.add('chat-anim-out');
  setTimeout(function() {
    w.classList.remove('chat-anim-out');
    w.classList.add('chat-hidden');
    var c = document.getElementById('chat-messages');
    if (c) c.innerHTML = '';
    _lastSender  = '';
    _currentSide = 'left';
  }, 350);
}

/* ---- Auto-hide timer ---- */
function resetHideTimer() {
  var secs = parseInt(fields.auto_hide_secs, 10) || 0;
  if (!secs) return;
  if (_hideTimer) clearTimeout(_hideTimer);
  _hideTimer = setTimeout(hideWidget, secs * 1000);
}

/* ---- Async Twitch avatar loader — fetches real jtvnw.net URL via decapi.me ---- */
function loadTwitchAvatar(uname, wrapEl) {
  function applyUrl(url) {
    if (!url || !wrapEl.parentNode) return;
    var img = document.createElement('img');
    img.className = 'chat-avatar-img';
    img.alt = '';
    img.onerror = function() { this.style.display = 'none'; };
    img.onload  = function() { wrapEl.classList.remove('chat-avatar-fallback'); };
    img.src = url;
    wrapEl.insertBefore(img, wrapEl.firstChild);
  }

  if (_avatarCache[uname] !== undefined) {
    applyUrl(_avatarCache[uname]);
    return;
  }
  _avatarCache[uname] = '';
  fetch('https://decapi.me/twitch/avatar/' + uname)
    .then(function(r) { return r.text(); })
    .then(function(url) {
      url = (url || '').trim();
      var valid = url && url.indexOf('http') === 0 && url.indexOf('Error') === -1;
      _avatarCache[uname] = valid ? url : '';
      applyUrl(_avatarCache[uname]);
    })
    .catch(function() { _avatarCache[uname] = ''; });
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

/* ---- Remove oldest message, promote next if it was a continuation ---- */
function removeOldest(container) {
  var msgs = container.querySelectorAll('.chat-msg');
  if (!msgs.length) return;
  var oldest = msgs[0];
  var next   = msgs[1];

  /* If next was a continuation from the same user, promote it to group-start */
  if (next && next.classList.contains('chat-msg-cont') &&
      next.dataset.sender === oldest.dataset.sender) {
    next.classList.remove('chat-msg-cont');
    var av = next.querySelector('.chat-avatar');
    if (av) av.style.visibility = '';
    var meta = next.querySelector('.chat-meta');
    if (meta) meta.style.display = '';
  }

  oldest.classList.remove('chat-msg-in');
  oldest.classList.add('chat-msg-out');
  setTimeout(function() { if (oldest.parentNode) oldest.parentNode.removeChild(oldest); }, 380);
}

/* ---- Trim messages: count-based (max>0) or overflow-based (max=0) ---- */
function trimToFit(container) {
  var max = parseInt(fields.max_messages, 10) || 0;
  if (max > 0) {
    var msgs = container.querySelectorAll('.chat-msg');
    for (var i = 0; i < msgs.length - max; i++) removeOldest(container);
  } else {
    /* Auto-fill: remove until content fits the container height */
    var attempts = 0;
    while (container.scrollHeight > container.clientHeight + 4 &&
           container.querySelectorAll('.chat-msg').length > 1 &&
           attempts++ < 40) {
      removeOldest(container);
    }
  }
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
  var uname       = (data.username || data.name || displayName).toLowerCase().replace(/[^a-z0-9_]/g, '');

  /* WhatsApp-style grouping + alternating left/right per user */
  var isCont = (uname !== '' && uname === _lastSender);
  if (!isCont && _lastSender !== '') {
    /* New user arrived — flip side */
    _currentSide = (_currentSide === 'left') ? 'right' : 'left';
  }
  var side = _currentSide;
  _lastSender = uname;

  /* Name color priority:
     1. username_fixed_color → feste Farbe für alle
     2. use_twitch_color ON  → Twitch tag color → hash fallback
     3. use_twitch_color OFF → role color → hash fallback           */
  var role = detectRole(badges);
  var userColor;
  if (fields.username_fixed_color) {
    userColor = fields.username_fixed_color;
  } else if (fields.use_twitch_color) {
    var tc = tagColor && tagColor !== '#000000' ? tagColor : '';
    userColor = tc || usernameColor(displayName);
  } else {
    var rc = fields['color_' + role];
    userColor = (rc && rc !== '') ? rc : usernameColor(displayName);
  }

  /* Avatar — always rendered; visibility:hidden for continuations so column stays aligned.
     Real Twitch picture fetched async via decapi.me (cached). */
  var seAvatar   = data.avatar || data.profileImage || data.profile_image_url || '';
  var avatarHtml = '';
  if (fields.show_avatar) {
    var avStyle = isCont
      ? 'visibility:hidden;pointer-events:none;background:transparent'
      : 'background:' + avatarBg;
    avatarHtml =
      '<div class="chat-avatar chat-avatar-wrap' + (isCont ? '' : ' chat-avatar-fallback') + '"' +
        ' data-uname="' + uname + '"' +
        ' style="' + avStyle + '"' +
        ' title="' + esc(displayName) + '">' +
        ((!isCont && seAvatar) ? '<img class="chat-avatar-img" src="' + seAvatar + '" alt="" onerror="this.style.display=\'none\'">' : '') +
        (!isCont ? '<span class="chat-avatar-initial">' + initial + '</span>' : '') +
      '</div>';
  }

  /* Meta row (name + badges) — hidden for continuations, visible for first in group */
  var metaHtml = '<div class="chat-meta"' + (isCont ? ' style="display:none"' : '') + '>' +
    renderBadges(badges) +
    '<span class="chat-name" style="color:' + userColor + '">' + esc(displayName) + '</span>' +
  '</div>';

  /* Timestamp */
  var timeHtml = fields.show_timestamp ? '<div class="chat-time">' + timestamp() + '</div>' : '';

  /* Build message element */
  var msgEl = document.createElement('div');
  msgEl.className = 'chat-msg chat-msg-' + side + ' chat-msg-in' + (isCont ? ' chat-msg-cont' : '');
  msgEl.id = 'cm-' + (++_msgCount);
  msgEl.dataset.sender = uname;
  msgEl.dataset.side   = side;
  msgEl.innerHTML =
    avatarHtml +
    '<div class="chat-bubble">' +
      metaHtml +
      '<div class="chat-text">' + text + '</div>' +
      timeHtml +
    '</div>';

  container.appendChild(msgEl);

  /* Async-load real Twitch profile picture for first-in-group messages */
  if (fields.show_avatar && !isCont && uname) {
    var wrapEl = msgEl.querySelector('.chat-avatar-wrap');
    if (wrapEl && !wrapEl.querySelector('.chat-avatar-img')) {
      loadTwitchAvatar(uname, wrapEl);
    }
  }

  /* Trim after render — overflow-based when max_messages=0, count-based otherwise */
  requestAnimationFrame(function() { trimToFit(container); });

  showWidget();
  resetHideTimer();
}

/* ---- Helper: set CSS px var or remove if value ≤ 0 ---- */
function chatSetOrReset(prop, val) {
  var n = parseFloat(val);
  if (n > 0) document.documentElement.style.setProperty(prop, n + 'px');
  else        document.documentElement.style.removeProperty(prop);
}

/* ---- Apply theme + appearance ---- */
function applyAppearance() {
  var root   = document.documentElement;
  var widget = document.getElementById('chat-widget');
  if (!widget) return;

  /* Font size — drives name size AND avatar size proportionally */
  var fsPx = { small: 12, medium: 14, large: 16, xl: 20, xxl: 24, xxxl: 30 };
  var fs   = fsPx[fields.font_size] || 14;
  root.style.setProperty('--chat-font-size', fs + 'px');
  root.style.setProperty('--chat-name-size', (fs + 1) + 'px');

  /* Font — fixed to Inter/Segoe UI, same as Now Playing widget */
  root.style.setProperty('--chat-font', "'Inter', 'Segoe UI', sans-serif");

  /* Message text color */
  if (fields.font_color) root.style.setProperty('--chat-text-color', fields.font_color);

  /* Text alignment */
  root.style.setProperty('--chat-text-align', fields.text_align || 'left');

  /* Avatar size — scales with font_size; avatar_size is a multiplier */
  var avMult = { xs: 0.65, small: 0.82, medium: 1.0, large: 1.28, xl: 1.65 };
  var mult   = avMult[fields.avatar_size] || 1.0;
  root.style.setProperty('--chat-avatar-size', Math.round(fs * 2.5 * mult) + 'px');

  /* Theme class */
  widget.classList.remove('theme-frosted','theme-light','theme-minimal','theme-neon','theme-liquid','theme-dark');
  if (fields.theme && fields.theme !== 'dark') widget.classList.add('theme-' + fields.theme);

  /* Animation class — controls show/hide animation style */
  widget.classList.remove('chat-anim-ios','chat-anim-fade','chat-anim-slide-left',
                           'chat-anim-slide-right','chat-anim-scale','chat-anim-slide-bottom');
  widget.classList.add('chat-anim-' + (fields.animation || 'ios'));

  /* Shape / corner radius — custom_radius wins, otherwise shape preset */
  var customR = parseFloat(fields.custom_radius);
  if (customR > 0) {
    root.style.setProperty('--chat-radius', customR + 'px');
  } else {
    var shapeMap = { pill: '60px', sharp: '6px', square: '0px' };
    var sr = shapeMap[fields.shape];
    if (sr) root.style.setProperty('--chat-radius', sr);
    else    root.style.removeProperty('--chat-radius');
  }

  /* Custom width + blur overrides */
  chatSetOrReset('--chat-width', fields.custom_width);
  chatSetOrReset('--chat-blur',  fields.custom_blur);

  /* HiDPI / 4K render scale */
  var sc = parseFloat(fields.scale) || 1;
  document.body.style.zoom = sc > 1 ? String(sc) : '';

  /* Header bar visibility */
  var bar = document.querySelector('.chat-header-bar');
  if (bar) bar.style.display = fields.show_header ? '' : 'none';

  /* Transparent background */
  if (fields.transparent_bg) widget.classList.add('chat-bg-transparent');
  else                        widget.classList.remove('chat-bg-transparent');
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
