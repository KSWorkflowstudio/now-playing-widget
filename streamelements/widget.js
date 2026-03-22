/* ============================================================
   NOW PLAYING WIDGET — widget.js
   StreamElements Custom Widget JS
   ============================================================ */

'use strict';

/* ---------- Config defaults (overridden by SE fieldData) ---------- */
var fields = {
  lastfm_user:    '',
  lastfm_key:     '',
  theme:          'dark',
  shape:          'default',
  animation:      'ios',
  show_album:     true,
  show_bars:      true,
  show_label:     true,
  font_size:      'medium',
  custom_width:   0,
  custom_radius:  0,
  custom_blur:    0,
  auto_hide_secs: 0,  /* 0 = always visible; >0 = hide after N seconds */
  text_align:     'left',
  text_scroll:    'left',   /* left | right | bounce | none */
  scroll_speed:   'normal', /* slow | normal | fast */
  scale:          1   /* render scale: 1=standard, 2=sharp 1080p, 4=4K */
};

/* Read config from URL params — standalone OBS direct mode */
(function () {
  try {
    var p = new URLSearchParams(window.location.search);
    if (p.get('user'))  fields.lastfm_user    = p.get('user');
    if (p.get('key'))   fields.lastfm_key     = p.get('key');
    if (p.get('theme')) fields.theme          = p.get('theme');
    if (p.get('shape')) fields.shape          = p.get('shape');
    if (p.get('anim'))  fields.animation      = p.get('anim');
    if (p.get('align')) fields.text_align     = p.get('align');
    if (p.get('fs'))    fields.font_size      = p.get('fs');
    var hide  = p.get('hide');  if (hide  !== null) fields.auto_hide_secs = parseInt(hide,  10) || 0;
    var bars  = p.get('bars');  if (bars  !== null) fields.show_bars      = bars  !== '0';
    var label = p.get('label'); if (label !== null) fields.show_label     = label !== '0';
    var album = p.get('album'); if (album !== null) fields.show_album     = album !== '0';
    var scale  = p.get('scale');  if (scale  !== null) fields.scale        = parseFloat(scale) || 1;
    var scroll = p.get('scroll'); if (scroll !== null) fields.text_scroll  = scroll;
    var spd    = p.get('spd');    if (spd    !== null) fields.scroll_speed = spd;
  } catch (e) {}
})();

var DEFAULT_ART = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"%3E%3Crect width="72" height="72" fill="%23222"%2F%3E%3Ccircle cx="36" cy="36" r="14" fill="%23444"%2F%3E%3Ccircle cx="36" cy="36" r="5" fill="%23222"%2F%3E%3C%2Fsvg%3E';

/* ---------- State ---------- */
var lastTrackId      = null;
var autoHiddenTrackId= null;  /* trackId that triggered auto-hide; null = not auto-hidden */
var autoHideTimer    = null;
var lastArtUrl       = null;
var progressMs       = 0;
var durationMs       = 0;
var isPlaying        = false;
var cardVisible      = false;
var progressInterval = null;
var pollTimer        = null;

/* ---------- Helpers ---------- */
var root    = document.documentElement;
var cardEl  = document.getElementById('np-card');
var trackEl = document.getElementById('np-track');
var artistEl= document.getElementById('np-artist');
var albumEl = document.getElementById('np-album');
var artEl   = document.getElementById('np-art');
var artNextEl = document.getElementById('np-art-next');
var fillEl  = document.getElementById('np-progress-fill');
var timeEl  = document.getElementById('np-time');
var barsEl  = document.getElementById('np-bars');
var labelEl = document.getElementById('np-now-label');
var statusEl= document.getElementById('np-status');

function fmt(ms) {
  if (!ms || isNaN(ms)) return '';
  var s = Math.floor(ms / 1000);
  var m = Math.floor(s / 60);
  s = s % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function fieldBool(key, defaultVal) {
  var v = fields[key];
  if (v === undefined || v === null) return defaultVal;
  return v === true || v === 'true';
}

function setOrReset(prop, val) {
  var n = parseFloat(val);
  if (n > 0) {
    root.style.setProperty(prop, n + 'px');
  } else {
    root.style.removeProperty(prop);
  }
}

/* ---------- Appearance ---------- */
function applyAppearance() {
  // Theme class
  cardEl.classList.remove('np-theme-dark','np-theme-frosted','np-theme-light','np-theme-minimal','np-theme-neon','np-theme-liquid');
  if (fields.theme && fields.theme !== 'dark') {
    cardEl.classList.add('np-theme-' + fields.theme);
  }

  // Animation class
  cardEl.classList.remove('np-anim-fade','np-anim-slide-left','np-anim-slide-right','np-anim-scale','np-anim-slide-bottom');
  if (fields.animation && fields.animation !== 'ios') {
    cardEl.classList.add('np-anim-' + fields.animation);
  }

  // Custom overrides
  setOrReset('--np-width', fields.custom_width);
  setOrReset('--np-blur',  fields.custom_blur);

  // Shape / Radius — custom_radius wins, otherwise use shape preset
  var customR = parseFloat(fields.custom_radius);
  if (customR > 0) {
    root.style.setProperty('--np-radius', customR + 'px');
  } else {
    var shapeMap = { pill: '60px', sharp: '6px', square: '0px' };
    var sr = shapeMap[fields.shape];
    if (sr) { root.style.setProperty('--np-radius', sr); }
    else     { root.style.removeProperty('--np-radius'); }
  }

  // Visibility toggles
  if (albumEl)  albumEl.style.display = fieldBool('show_album', true) ? '' : 'none';
  if (barsEl)   barsEl.style.display  = fieldBool('show_bars',  true) ? '' : 'none';
  if (labelEl)  labelEl.style.display = fieldBool('show_label', true) ? '' : 'none';
  if (statusEl) statusEl.style.display = (fieldBool('show_bars', true) || fieldBool('show_label', true)) ? '' : 'none';

  // Font size
  var fontSizeMap = { small: '12px', medium: '15px', large: '18px' };
  var fs = fontSizeMap[fields.font_size];
  if (fs) {
    root.style.setProperty('--np-track-size',  fs);
    root.style.setProperty('--np-artist-size', (parseInt(fs) - 3) + 'px');
    root.style.setProperty('--np-album-size',  (parseInt(fs) - 5) + 'px');
  }

  // Text alignment
  var alignMap = { left: 'left', center: 'center', right: 'right' };
  var align = alignMap[fields.text_align] || 'left';
  var justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
  root.style.setProperty('--np-text-align',     align);
  root.style.setProperty('--np-status-justify', justifyMap[align] || 'flex-start');

  // HiDPI / 4K render scale — zoom doubles/quadruples pixel density
  var sc = parseFloat(fields.scale) || 1;
  document.body.style.zoom = sc > 1 ? sc : '';

  // Scroll mode class on card
  cardEl.classList.remove('np-scroll-left', 'np-scroll-right', 'np-scroll-bounce');
  var sm = fields.text_scroll || 'left';
  if (sm !== 'none') cardEl.classList.add('np-scroll-' + sm);

  // Re-evaluate scroll on both text elements after layout settles
  setTimeout(function () {
    applyScrollEl(trackEl);
    applyScrollEl(artistEl);
  }, 80);
}

/* ---------- Text scroll helpers ---------- */

/* Scroll speed in pixels per second */
var _ppsMap = { slow: 30, normal: 50, fast: 90 };

/* Cache injected @keyframes to avoid redundant DOM writes */
var _kfCache = {};

function injectKeyframes(name, css) {
  if (_kfCache[name] === css) return;
  _kfCache[name] = css;
  var existing = document.getElementById('np-kf-' + name);
  if (existing) existing.remove();
  var s = document.createElement('style');
  s.id = 'np-kf-' + name;
  s.textContent = css;
  document.head.appendChild(s);
}

function applyScrollEl(el) {
  if (!el) return;
  var inner = el.querySelector('.np-scroll-inner');
  if (!inner) return;

  var mode = fields.text_scroll || 'left';
  el.classList.remove('np-scrolling');
  inner.style.animation = '';

  if (mode === 'none') return;

  var overflow = inner.scrollWidth - el.clientWidth;
  if (overflow <= 2) return;

  /* Fixed timing constants (seconds) */
  var PAUSE_START = 2;   /* pause before scrolling begins          */
  var PAUSE_END   = 3;   /* hard 3s pause after text reaches end   */
  var FADE        = 0.35;/* fade-out / fade-in duration (left/right only) */
  var PAUSE_AFTER = 1.5; /* pause after fade-in before next cycle  */

  var pps      = _ppsMap[fields.scroll_speed] || 50;
  var scrollSec = Math.max(1.5, overflow / pps);
  var dist      = (mode === 'right') ? overflow : -overflow;
  var animName  = 'np-kf-' + el.id + '-' + mode;
  var total, kfCss;

  /* Helper: convert seconds to percentage string */
  function pct(t) { return (t / total * 100).toFixed(3) + '%'; }

  if (mode === 'bounce') {
    /* pause_start | scroll→end | pause_end(3s) | scroll→start | (loop seamlessly) */
    total  = PAUSE_START + scrollSec + PAUSE_END + scrollSec;
    var t1 = PAUSE_START;
    var t2 = t1 + scrollSec;
    var t3 = t2 + PAUSE_END;

    kfCss = '@keyframes ' + animName + ' {\n' +
      '  0%        { transform:translateX(0);          animation-timing-function:linear; }\n' +
      '  ' + pct(t1) + ' { transform:translateX(0);          animation-timing-function:ease-in-out; }\n' +
      '  ' + pct(t2) + ' { transform:translateX(' + dist + 'px); animation-timing-function:linear; }\n' +
      '  ' + pct(t3) + ' { transform:translateX(' + dist + 'px); animation-timing-function:ease-in-out; }\n' +
      '  100%      { transform:translateX(0); }\n}';

  } else {
    /* pause_start | scroll | pause_end(3s) | fade-out | reset(invisible) | fade-in | pause_after */
    total       = PAUSE_START + scrollSec + PAUSE_END + FADE + 0.05 + FADE + PAUSE_AFTER;
    var s1      = PAUSE_START;
    var s2      = s1 + scrollSec;
    var s3      = s2 + PAUSE_END;          /* end of 3s pause — starts fading */
    var s4      = s3 + FADE;              /* fully faded out                  */
    var s4r     = s4 + 0.05;             /* position reset (invisible)       */
    var s5      = s4r + FADE;            /* fully faded back in               */

    kfCss = '@keyframes ' + animName + ' {\n' +
      '  0%        { transform:translateX(0);             opacity:1; animation-timing-function:linear; }\n' +
      '  ' + pct(s1)  + ' { transform:translateX(0);             opacity:1; animation-timing-function:ease-in-out; }\n' +
      '  ' + pct(s2)  + ' { transform:translateX(' + dist + 'px);  opacity:1; animation-timing-function:linear; }\n' +
      '  ' + pct(s3)  + ' { transform:translateX(' + dist + 'px);  opacity:1; animation-timing-function:linear; }\n' +
      '  ' + pct(s4)  + ' { transform:translateX(' + dist + 'px);  opacity:0; animation-timing-function:linear; }\n' +
      '  ' + pct(s4r) + ' { transform:translateX(0);             opacity:0; animation-timing-function:linear; }\n' +
      '  ' + pct(s5)  + ' { transform:translateX(0);             opacity:1; animation-timing-function:linear; }\n' +
      '  100%      { transform:translateX(0);             opacity:1; }\n}';
  }

  injectKeyframes(animName, kfCss);
  /* Force reflow so browser registers new @keyframes before animation starts */
  inner.style.animation = 'none';
  void inner.offsetWidth;
  inner.style.animation = animName + ' ' + total.toFixed(2) + 's linear infinite';
  el.classList.add('np-scrolling');
}

function setScrollText(el, text) {
  if (!el) return;
  var inner = el.querySelector('.np-scroll-inner');
  if (!inner) {
    inner = document.createElement('span');
    inner.className = 'np-scroll-inner';
    el.innerHTML = '';
    el.appendChild(inner);
  }
  /* Reset first so new text doesn't inherit stale animation */
  inner.style.animation = '';
  el.classList.remove('np-scrolling');
  inner.textContent = text;
  /* Wait for layout so scrollWidth is accurate */
  setTimeout(function () { applyScrollEl(el); }, 100);
}

/* ---------- iPhone-style animation helpers ---------- */
function removeAnimClasses() {
  cardEl.classList.remove('np-notify-in', 'np-notify-out', 'np-track-bump');
}

function showCard() {
  if (cardVisible) return;
  cardVisible = true;
  removeAnimClasses();
  cardEl.classList.remove('np-hidden');
  // Force reflow so animation triggers fresh
  void cardEl.offsetWidth;
  cardEl.classList.add('np-notify-in');
  cardEl.addEventListener('animationend', function onIn() {
    cardEl.removeEventListener('animationend', onIn);
    cardEl.classList.remove('np-notify-in');
  });
}

function hideCard() {
  if (!cardVisible) return;
  cardVisible = false;
  removeAnimClasses();
  // Force reflow
  void cardEl.offsetWidth;
  cardEl.classList.add('np-notify-out');
  cardEl.addEventListener('animationend', function onOut() {
    cardEl.removeEventListener('animationend', onOut);
    cardEl.classList.remove('np-notify-out');
    cardEl.classList.add('np-hidden');
  });
}

/* Start/reset the auto-hide countdown. No-op when auto_hide_secs === 0. */
function scheduleAutoHide() {
  if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
  var secs = parseInt(fields.auto_hide_secs, 10);
  if (!secs || secs <= 0) return;
  autoHideTimer = setTimeout(function () {
    autoHideTimer    = null;
    autoHiddenTrackId = lastTrackId; /* remember so same track doesn't re-show */
    hideCard();
  }, secs * 1000);
}

function bumpTrack() {
  removeAnimClasses();
  void cardEl.offsetWidth;
  cardEl.classList.add('np-track-bump');
  cardEl.addEventListener('animationend', function onBump() {
    cardEl.removeEventListener('animationend', onBump);
    cardEl.classList.remove('np-track-bump');
  });
}

/* ---------- Art crossfade ---------- */
function crossfadeArt(newUrl) {
  if (!newUrl) newUrl = DEFAULT_ART;
  if (newUrl === lastArtUrl) return;
  lastArtUrl = newUrl;

  if (!artEl) return;

  var preload = new Image();
  preload.onload = function () {
    if (!artNextEl) {
      artEl.src = newUrl;
      return;
    }
    artNextEl.style.transition = 'opacity 0s';
    artNextEl.style.opacity    = '0';
    artNextEl.src              = newUrl;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        artNextEl.style.transition = 'opacity 0.5s ease';
        artNextEl.style.opacity    = '1';
        setTimeout(function () {
          artEl.src                  = newUrl;
          artNextEl.style.transition = 'opacity 0s';
          artNextEl.style.opacity    = '0';
        }, 520);
      });
    });
  };
  preload.onerror = function () {
    artEl.src = DEFAULT_ART;
    lastArtUrl = DEFAULT_ART;
  };
  preload.src = newUrl;
}

/* ---------- Progress ---------- */
function startProgress() {
  if (progressInterval) clearInterval(progressInterval);
  if (!isPlaying) return;
  progressInterval = setInterval(function () {
    progressMs += 1000;
    if (durationMs > 0 && progressMs > durationMs) progressMs = durationMs;
    renderProgress();
  }, 1000);
}

function renderProgress() {
  if (!fillEl) return;
  var pct = (durationMs > 0) ? (progressMs / durationMs * 100) : 0;
  fillEl.style.width = Math.min(100, pct) + '%';
  if (timeEl) {
    if (durationMs > 0) {
      timeEl.textContent = fmt(progressMs) + ' / ' + fmt(durationMs);
    } else {
      timeEl.textContent = fmt(progressMs);
    }
  }
}

/* ---------- Show track ---------- */
function showTrack(data) {
  var trackId    = (data.artist || '') + '|' + (data.title || '');
  var isNewTrack = (trackId !== lastTrackId);

  // Update text content (setScrollText also re-evaluates marquee)
  setScrollText(trackEl,  data.title  || '');
  setScrollText(artistEl, data.artist || '');
  if (albumEl) albumEl.textContent = data.album || '';

  // Playing state
  isPlaying = !!data.isPlaying;
  if (cardEl) cardEl.classList.toggle('np-paused', !isPlaying);

  // Progress
  progressMs = data.progressMs || 0;
  durationMs = data.durationMs || 0;
  renderProgress();
  startProgress();

  if (isNewTrack) {
    /* ── New song: always show (even if auto-hidden), reset timer ── */
    lastTrackId       = trackId;
    autoHiddenTrackId = null;
    if (autoHideTimer) { clearTimeout(autoHideTimer); autoHideTimer = null; }
    crossfadeArt(data.artUrl);
    if (!cardVisible) {
      showCard();
    } else {
      bumpTrack();
    }
    scheduleAutoHide();
  } else if (!cardVisible) {
    /* ── Same track, card currently hidden ── */
    if (trackId !== autoHiddenTrackId) {
      /* Hidden because song paused/stopped, now resumed → show again */
      crossfadeArt(data.artUrl);
      showCard();
      scheduleAutoHide();
    }
    /* If auto-hidden (autoHiddenTrackId === trackId): stay hidden until next song */
  } else {
    /* ── Same track, card visible: just update art ── */
    crossfadeArt(data.artUrl);
  }
}

/* ---------- Last.fm polling ---------- */
function pollLastFm() {
  var user = fields.lastfm_user;
  var key  = fields.lastfm_key;
  if (!user || !key) return;

  var url = 'https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks'
    + '&user=' + encodeURIComponent(user)
    + '&api_key=' + encodeURIComponent(key)
    + '&format=json&limit=1';

  fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.error) {
        // Show error in widget so user knows what's wrong
        setScrollText(trackEl,  'Last.fm Error ' + data.error);
        setScrollText(artistEl, data.message || '');
        if (albumEl)  albumEl.textContent  = '';
        showCard();
        return;
      }

      var tracks = data.recenttracks && data.recenttracks.track;
      if (!tracks) { hideCard(); return; }
      var track = Array.isArray(tracks) ? tracks[0] : tracks;
      if (!track) { hideCard(); return; }

      // Detect now playing: @attr.nowplaying OR recent scrobble within 8 min
      var isNowPlaying = !!(track['@attr'] && track['@attr'].nowplaying === 'true');
      var isRecentScrobble = false;
      if (!isNowPlaying && track.date && track.date.uts) {
        var ageSec = Math.floor(Date.now() / 1000) - parseInt(track.date.uts, 10);
        isRecentScrobble = ageSec >= 0 && ageSec < 480;
      }

      if (!isNowPlaying && !isRecentScrobble) {
        hideCard();
        return;
      }

      var artUrl = '';
      var images = track.image;
      if (images && images.length) {
        // Prefer extralarge > large > medium
        for (var i = images.length - 1; i >= 0; i--) {
          if (images[i]['#text']) { artUrl = images[i]['#text']; break; }
        }
      }

      showTrack({
        title:      track.name || '',
        artist:     (track.artist && (track.artist['#text'] || track.artist.name)) || '',
        album:      (track.album && track.album['#text']) || '',
        artUrl:     artUrl,
        isPlaying:  isNowPlaying,
        progressMs: 0,
        durationMs: 0
      });
    })
    .catch(function (err) {
      console.error('[NP] poll error', err);
    });
}

/* ---------- SE event handlers ---------- */
window.addEventListener('onWidgetLoad', function (e) {
  window.__np_started = true;
  var detail = e.detail || {};
  fields = Object.assign(fields, detail.fieldData || {});
  applyAppearance();
  if (artEl) artEl.src = DEFAULT_ART;
  if (fields.lastfm_user && fields.lastfm_key) {
    pollLastFm();
    pollTimer = setInterval(pollLastFm, 5000);
  }
});

window.addEventListener('onSessionUpdate', function (e) {
  var detail = e.detail || {};
  if (detail.fieldData) {
    fields = Object.assign(fields, detail.fieldData);
    applyAppearance();
  }
});

/* ---------- Startup fallback — fires if onWidgetLoad never comes ---------- */
/* Handles SE preview mode, direct file opens, and misconfigured overlays   */
document.addEventListener('DOMContentLoaded', function () {
  setTimeout(function () {
    if (window.__np_started) return;
    applyAppearance();
    if (artEl) artEl.src = DEFAULT_ART;
    if (fields.lastfm_user && fields.lastfm_key) {
      pollLastFm();
      pollTimer = setInterval(pollLastFm, 5000);
    }
  }, 1500);
});
