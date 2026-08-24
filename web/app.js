/* Air Hockey — client. Online play is server-authoritative; the local
   two-player mode runs the exact same engine right here in the page. */
(function () {
'use strict';

const { Game, ST, CONST, halftimeFor, countdownDigit, MODES, FX } = window.AHEngine;
const { W, H, PUCK_R, GX0, GX1, PUCK_MAX, PAD_MAX_SPEED } = CONST;

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ============================ preferences ============================ */

/* Mallet radius in field units. The rink is 100 wide, so "Mini" is a 8%-wide
   disc — small enough that a fingertip never hides it completely. */
const PAD_SIZES = [4.0, 4.8, 5.6, 6.8];
const PAD_NAMES = ['Mini', 'Küçük', 'Orta', 'Büyük'];
/* How far ahead of the fingertip the mallet sits, in field units. */
const GRIPS = [0, 6, 10, 15];
const THEMES = ['krem', 'buz', 'cim', 'gece'];
const MODE_KEYS = [MODES.CLASSIC, MODES.LUCKY];

/* Puck colours. `g` is the highlight -> body -> rim gradient; `rgb` seeds the
   motion trail when nobody has struck the puck yet. "tema" keeps whatever the
   chosen rink was designed around. */
const PUCK_COLORS = {
  tema:    { name: 'Tema',    g: null },
  siyah:   { name: 'Siyah',   g: ['#6e6e6e', '#232323', '#080808'], rgb: '35,35,35' },
  kirmizi: { name: 'Kırmızı', g: ['#ffa898', '#e23b26', '#7f1a0e'], rgb: '226,59,38' },
  turuncu: { name: 'Turuncu', g: ['#ffd39a', '#f0871e', '#8f4c08'], rgb: '240,135,30' },
  sari:    { name: 'Sarı',    g: ['#fff6d8', '#ffd166', '#b8801a'], rgb: '255,209,102' },
  yesil:   { name: 'Yeşil',   g: ['#a8f0c8', '#20a05e', '#0c4d2c'], rgb: '32,160,94' },
  mavi:    { name: 'Mavi',    g: ['#b6dcff', '#1f7ae0', '#0b3c78'], rgb: '31,122,224' },
  mor:     { name: 'Mor',     g: ['#dcbcff', '#8b3ee0', '#431775'], rgb: '139,62,224' },
  beyaz:   { name: 'Beyaz',   g: ['#ffffff', '#eef1f6', '#9aa4b2'], rgb: '238,241,246' },
};
const PUCK_KEYS = Object.keys(PUCK_COLORS);

const Cfg = {
  theme: 'krem',
  puck: 'tema',
  pad: 1,
  grip: 2,      // a fingertip is ~6 units across, so 10 clears the mallet
  /* Last match rules, so the same two people do not re-pick them every time. */
  mode: MODES.CLASSIC,
  half: true,

  load() {
    try {
      const j = JSON.parse(localStorage.getItem('ah_cfg') || '{}');
      if (THEMES.indexOf(j.theme) >= 0) this.theme = j.theme;
      if (PUCK_KEYS.indexOf(j.puck) >= 0) this.puck = j.puck;
      if (j.pad >= 0 && j.pad < PAD_SIZES.length) this.pad = j.pad | 0;
      if (j.grip >= 0 && j.grip < GRIPS.length) this.grip = j.grip | 0;
      if (MODE_KEYS.indexOf(j.mode) >= 0) this.mode = j.mode;
      if (typeof j.half === 'boolean') this.half = j.half;
    } catch (_) { /* first run, or storage blocked */ }
  },
  save() {
    try {
      localStorage.setItem('ah_cfg', JSON.stringify(
        { theme: this.theme, puck: this.puck, pad: this.pad, grip: this.grip,
          mode: this.mode, half: this.half }));
    } catch (_) {}
  },
  padR() { return PAD_SIZES[this.pad]; },
  lead() { return GRIPS[this.grip]; },
  /* Falls back to the rink's own puck when the player has not picked one. */
  puckG() { return PUCK_COLORS[this.puck].g || PAL.puck; },
  puckRGB() { return PUCK_COLORS[this.puck].rgb || PAL.trail; },
};
Cfg.load();

/* Canvas colours per theme. The page chrome gets the same palette from CSS
   variables in style.css — keep the two in step. */
const PALETTES = {
  krem: {
    ice: ['#f9f0dd', '#f1e3c4', '#f9f0dd'],
    tintMe: 'rgba(23,114,107,.06)', tintFoe: 'rgba(192,69,44,.06)',
    line: 'rgba(122,95,55,.36)', lineSoft: 'rgba(122,95,55,.20)',
    board: 'rgba(122,95,55,.55)',
    me: '#17726b', foe: '#c0452c',
    puck: ['#6b5943', '#332618', '#171009'],
    trail: '90,72,45',
    padInner: 'rgba(255,255,255,.62)', padRing: 'rgba(0,0,0,.16)',
    shadow: 'rgba(96,74,42,.26)',
    glow: false,
  },
  buz: {
    ice: ['#ffffff', '#e8f1fb', '#ffffff'],
    tintMe: 'rgba(14,116,144,.07)', tintFoe: 'rgba(214,69,90,.06)',
    line: 'rgba(40,80,130,.32)', lineSoft: 'rgba(40,80,130,.18)',
    board: 'rgba(40,80,130,.48)',
    me: '#0e7490', foe: '#d6455a',
    puck: ['#5c6b7a', '#22303f', '#101820'],
    trail: '40,70,110',
    padInner: 'rgba(255,255,255,.7)', padRing: 'rgba(0,0,0,.14)',
    shadow: 'rgba(40,70,110,.22)',
    glow: false,
  },
  cim: {
    ice: ['#f2f7e8', '#e4eed3', '#f2f7e8'],
    tintMe: 'rgba(28,107,74,.07)', tintFoe: 'rgba(194,65,12,.06)',
    line: 'rgba(60,90,45,.34)', lineSoft: 'rgba(60,90,45,.18)',
    board: 'rgba(60,90,45,.5)',
    me: '#1c6b4a', foe: '#c2410c',
    puck: ['#5f6b4d', '#2a3320', '#141a0e'],
    trail: '60,90,45',
    padInner: 'rgba(255,255,255,.62)', padRing: 'rgba(0,0,0,.15)',
    shadow: 'rgba(60,90,45,.24)',
    glow: false,
  },
  gece: {
    ice: ['#132347', '#0c1631', '#132347'],
    tintMe: 'rgba(34,211,238,.06)', tintFoe: 'rgba(255,77,109,.06)',
    line: 'rgba(150,190,240,.30)', lineSoft: 'rgba(150,190,240,.22)',
    board: 'rgba(120,170,230,.34)',
    me: '#22d3ee', foe: '#ff4d6d',
    puck: ['#fff6d8', '#ffd166', '#c98f1e'],
    trail: '255,231,150',
    padInner: 'rgba(8,14,26,.62)', padRing: 'rgba(255,255,255,.28)',
    shadow: null,
    glow: true,
  },
};
let PAL = PALETTES[Cfg.theme];
/* The two mallet colours as "r,g,b", ready to drop into an rgba() string. */
let RGB = { me: '0,0,0', foe: '0,0,0' };

const hexRGB = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

const THEME_META = { krem: '#efe1c2', buz: '#e9f1fa', cim: '#e8f0d9', gece: '#070b14' };

function applyTheme(name) {
  Cfg.theme = THEMES.indexOf(name) >= 0 ? name : 'krem';
  PAL = PALETTES[Cfg.theme];
  RGB = { me: hexRGB(PAL.me), foe: hexRGB(PAL.foe) };
  document.body.dataset.theme = Cfg.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_META[Cfg.theme]);
}
applyTheme(Cfg.theme);

/* ============================ state ============================ */

const App = {
  mode: null,          // 'online' | 'local'
  side: 'a',
  code: null,
  target: 7,
  padR: Cfg.padR(),    // base radius the *engine in play* is using
  /* Live mallet radii. In lucky mode these drift away from padR mid-rally. */
  rMe: Cfg.padR(),
  rFoe: Cfg.padR(),
  gameMode: MODES.CLASSIC,
  halfAt: 0,           // goal count that triggers the break, 0 = no break
  halfReady: false,    // online break: I have tapped "ready"
  myName: 'Oyuncu',
  foeName: 'Rakip',
  snap: null,
  snapAt: 0,
  ping: null,
  peerOn: false,
  lastCd: -1,
  lastState: -1,
  game: null,          // local engine
  flip: false,         // second half — the phone has been turned around
};

/* Smoothed render positions (my paddle is ALWAYS the bottom one). */
const R = {
  puck: { x: W / 2, y: H / 2 },
  me:   { x: W / 2, y: H * 0.78 },
  foe:  { x: W / 2, y: H * 0.22 },
  trail: [],
  /* The motion beam is tinted by the mallet that last struck the puck, so you
     can read at a glance whose shot is in flight. */
  trailCol: null,
  shake: 0,
};

/* My paddle, simulated locally so my own finger never feels laggy. */
const myPad = { x: W / 2, y: H * 0.78, tx: W / 2, ty: H * 0.78 };
/* Local mode: the top player's paddle target. */
const foePad = { x: W / 2, y: H * 0.22, tx: W / 2, ty: H * 0.22 };

/* ============================ screens ============================ */

let current = 's-menu';
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  $(id).classList.remove('hidden');
  current = id;
  if (id === 's-set') drawPreview();
}

let toastTimer = null;
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

/* ============================ networking ============================ */

const Net = {
  ws: null,
  ready: false,
  wantRoom: null,      // code to re-join after an unexpected drop
  retry: 0,
  pingTimer: null,

  url() {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return q;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  },

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    setConn('wait', 'Bağlanıyor…');
    let ws;
    try { ws = new WebSocket(this.url()); } catch (_) { return this.scheduleRetry(); }
    this.ws = ws;

    ws.onopen = () => {
      this.ready = true;
      this.retry = 0;
      setConn('ok', 'Sunucuya bağlı');
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'p', c: Date.now() }), 2000);
      this.send({ t: 'p', c: Date.now() });
      if (this.wantRoom) {
        this.send({ t: 'join', code: this.wantRoom, name: App.myName });
      }
    };

    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (_) { return; }
      onMessage(m);
    };

    ws.onclose = () => {
      this.ready = false;
      clearInterval(this.pingTimer);
      setConn('bad', 'Bağlantı koptu');
      if (App.mode === 'online') toast('Bağlantı koptu, yeniden deneniyor…');
      this.scheduleRetry();
    };

    ws.onerror = () => { /* onclose always follows */ };
  },

  scheduleRetry() {
    const wait = Math.min(8000, 600 * Math.pow(1.7, this.retry++));
    setTimeout(() => this.connect(), wait);
  },

  send(o) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(o));
      return true;
    }
    return false;
  },
};

function setConn(cls, txt) {
  const d = $('conn-dot'), t = $('conn-txt');
  if (!d) return;
  d.className = 'dot' + (cls === 'ok' ? ' ok' : cls === 'bad' ? ' bad' : '');
  t.textContent = txt;
}

function onMessage(m) {
  switch (m.t) {
    case 'q': {
      const rtt = Date.now() - m.c;
      App.ping = App.ping == null ? rtt : Math.round(App.ping * 0.7 + rtt * 0.3);
      const el = $('hud-ping');
      if (el) {
        el.textContent = App.ping + ' ms';
        el.parentElement.classList.toggle('bad', App.ping > 140);
      }
      break;
    }

    case 'joined':
      App.mode = 'online';
      App.side = m.side;
      App.code = m.code;
      App.target = m.target;
      if (m.pad) { App.padR = m.pad; App.rMe = App.rFoe = m.pad; }
      App.gameMode = m.mode || MODES.CLASSIC;
      App.halfAt = m.half || 0;
      App.halfReady = false;
      Net.wantRoom = m.code;
      $('lobby-code').textContent = m.code;
      setHudTarget(m.target, App.halfAt, App.gameMode);
      syncLobbyRules();
      if (current !== 's-game') show('s-lobby');
      break;

    case 'room': {
      App.target = m.target;
      if (m.pad) { App.padR = m.pad; App.rMe = App.rFoe = m.pad; }
      App.gameMode = m.mode || MODES.CLASSIC;
      App.halfAt = m.half || 0;
      setHudTarget(m.target, App.halfAt, App.gameMode);
      syncLobbyRules();
      const mine = App.side === 'a' ? m.names.a : m.names.b;
      const theirs = App.side === 'a' ? m.names.b : m.names.a;
      const theirsHere = App.side === 'a' ? m.b : m.a;
      App.myName = mine;
      App.foeName = theirsHere ? theirs : 'Rakip';
      $('p-a').textContent = mine;
      $('p-b').textContent = theirsHere ? theirs : 'Bekleniyor…';
      $('p-b-sub').textContent = theirsHere ? 'Hazır' : 'Kodu paylaş';
      $('slot-b').classList.toggle('waiting', !theirsHere);
      $('hud-me').textContent = mine;
      $('hud-foe').textContent = App.foeName;
      App.peerOn = !!theirsHere;
      break;
    }

    case 'peer':
      if (m.on) { Snd.join(); toast('Rakip bağlandı!'); }
      else { toast('Rakip ayrıldı — bekleniyor…', 4000); }
      break;

    case 'hr':
      // Half-time break: who has tapped "ready".
      App.halfReady = App.side === 'a' ? m.a : m.b;
      paintHalfWait(App.side === 'a' ? m.b : m.a);
      break;

    case 'err':
      toast(m.m, 3400);
      if (current === 's-lobby' || current === 's-game') {
        Net.wantRoom = null;
        show('s-online');
      }
      break;

    case 's':
      App.snap = m;
      App.snapAt = performance.now();
      if (App.mode === 'online') handleSnapshot(m);
      break;
  }
}

/* ============================ snapshot handling ============================ */

function handleSnapshot(s) {
  if (current !== 's-game' && s.st !== ST.LOBBY) {
    enterGame();
  }

  $('sc-me').textContent = s.sm;
  $('sc-foe').textContent = s.so;

  // Lucky mode resizes mallets mid-rally, so the radii ride along with
  // every frame instead of being fixed when the room was made.
  if (s.rm) App.rMe = s.rm;
  if (s.ro) App.rFoe = s.ro;

  // Events: identical audio cues on both clients, driven by the server.
  for (const e of s.e) {
    const type = e[0], ey = e[2], inten = e[3];
    if (type === 0) {
      Snd.hit(inten);
      R.shake = Math.min(1, inten / PUCK_MAX) * 0.6;
      R.trailCol = ey >= H / 2 ? RGB.me : RGB.foe;
    }
    else if (type === 1) { Snd.wall(inten); }
    else if (type === 2) {
      const mine = ey < H / 2;               // the puck went into THEIR net
      Snd.goal(mine);
      R.shake = 1;
      centerMsg(mine ? 'GOL!' : 'Rakip Attı', 'goal', 1200);
    }
    else if (type === 3) {
      Snd.ui();
      centerMsg(luckyText(e[3], ey >= H / 2, false), 'lucky', 1400);
    }
  }

  // Countdown ticks
  if (s.st === ST.COUNTDOWN) {
    paintCountdown(s.cd);
  } else if (App.lastState === ST.COUNTDOWN && s.st === ST.PLAYING) {
    App.lastCd = -1;
    centerMsg('BAŞLA!', '', 550);
  } else if (s.st === ST.PAUSED) {
    centerMsg('Rakip bekleniyor…', 'wait', 0);
  } else if (s.st === ST.PLAYING) {
    hideMsgIfIdle();
  }

  if (s.st === ST.HALFTIME && App.lastState !== ST.HALFTIME) enterHalftimeOnline(s);
  if (s.st !== ST.HALFTIME && App.lastState === ST.HALFTIME) $('half').classList.add('hidden');

  if (s.st === ST.OVER && App.lastState !== ST.OVER) {
    showOver(s.w === 1, s.sm, s.so);
  }
  if (s.st !== ST.OVER && App.lastState === ST.OVER) hideOver();

  App.lastState = s.st;
}

/* What a lucky-mode twist should say. `mine` is true when the affected mallet
   is the bottom one; in the same-device mode that is Oyuncu 1, not "you". */
function luckyText(code, mine, local) {
  const who = local ? (mine ? 'OYUNCU 1' : 'OYUNCU 2') : (mine ? 'SOPAN' : 'RAKİP');
  switch (code) {
    case FX.GROW:   return who + ' BÜYÜDÜ';
    case FX.SHRINK: return who + ' KÜÇÜLDÜ';
    case FX.FAST:   return 'BUZ KAYGAN';
    default:        return 'BUZ AĞIR';
  }
}

/* ============================ center message ============================ */

let msgTimer = null;
function centerMsg(txt, cls, ms) {
  const el = $('cmsg');
  $('cmsg-txt').textContent = txt;
  el.className = 'center-msg' + (cls ? ' ' + cls : '');
  clearTimeout(msgTimer);
  msgTimer = ms > 0 ? setTimeout(hideMsg, ms) : null;
}
function hideMsg() {
  msgTimer = null;
  $('cmsg').classList.add('hidden');
}
function hideMsgIfIdle() {
  if (!msgTimer) hideMsg();
}

/* 3 - 2 - 1. The tick always sounds on the beat, but the digit waits for a
   goal shout to finish before it takes over the middle of the rink. */
function paintCountdown(ms) {
  const n = countdownDigit(ms);
  const changed = n !== App.lastCd;
  if (changed) { App.lastCd = n; Snd.count(n); }
  if (msgTimer) return;
  if (changed || $('cmsg').classList.contains('hidden')) centerMsg(String(n), '', 0);
}

/* ============================ half time ============================ */

function setFlip(on) {
  App.flip = on;
  $('s-game').classList.toggle('flip', on);
  // A finger still down belongs to whichever half it is now over.
  pointers.clear();
}

/* Two flavours of the same overlay: on one phone the players physically turn
   it round, online they just take a breather on their own screens. */
function openHalftime(score, turnPhone) {
  Snd.half();
  $('half-score').textContent = score;
  hideMsg();
  clearTimeout(msgTimer); msgTimer = null;
  $('half').classList.toggle('solo', !turnPhone);
  $('half-top').classList.toggle('hidden', !turnPhone);
  $('half-bot').classList.toggle('hidden', !turnPhone);
  $('half-icon').classList.toggle('hidden', !turnPhone);
  $('half-title').classList.toggle('hidden', turnPhone);
  $('half-note').innerHTML = turnPhone
    ? 'Alt taraf yukarı, üst taraf aşağı.<br>Böylece herkes ekranın iki yanını da kullanır.'
    : 'İkiniz de hazır deyince ikinci yarı başlar.';
  $('b-half').textContent = turnPhone ? 'Çevirdik, Devam' : 'Hazırım';
  $('b-half').disabled = false;
  $('half-wait').classList.add('hidden');
  $('half').classList.remove('hidden');
}

function enterHalftime(g) {
  openHalftime(`${g.scoreA} – ${g.scoreB}`, true);
  // Turn the rink now, so what is on screen already matches the instruction.
  setFlip(!App.flip);
  myPad.x = myPad.tx = W / 2; myPad.y = myPad.ty = H * 0.78;
  foePad.x = foePad.tx = W / 2; foePad.y = foePad.ty = H * 0.22;
}

function enterHalftimeOnline(s) {
  App.halfReady = false;
  openHalftime(`${s.sm} – ${s.so}`, false);
}

/* Online break: once I have tapped, the button turns into a wait notice. */
function paintHalfWait(foeReady) {
  if ($('half').classList.contains('hidden')) return;
  $('b-half').disabled = App.halfReady;
  $('half-wait').classList.toggle('hidden', !App.halfReady || foeReady);
}

$('b-half').addEventListener('click', () => {
  Snd.ui();
  App.lastCd = -1;
  if (App.mode === 'online') {
    App.halfReady = true;
    Net.send({ t: 'ready' });
    paintHalfWait(false);
    return;
  }
  $('half').classList.add('hidden');
  if (App.game) App.game.resumeHalftime();
});

/* "ŞANSLI · 4 DEVRE · 7 GOL" — always visible during a match. */
function setHudTarget(target, half, mode) {
  const bits = [];
  if (mode === MODES.LUCKY) bits.push('ŞANSLI');
  if (half) bits.push(`<b>${half}</b> DEVRE`);
  bits.push(`${target} GOL`);
  $('hud-target').innerHTML = bits.join(' · ');
}

/* "4 golde devre → 7 golde biter" for whichever screen asked. */
function updatePlan(id, target, halfOn) {
  const half = halfOn ? halftimeFor(target) : 0;
  const el = $(id);
  if (!el) return;
  if (half) {
    el.style.display = '';
    el.querySelector('.plan-half b').textContent = half;
    el.querySelector('.plan-end b').textContent = target;
  } else {
    el.style.display = 'none';
  }
}

/* ============================ game over ============================ */

function showOver(win, me, foe) {
  Snd.over(win);
  const t = $('ovl-title');
  t.textContent = win ? 'Kazandın!' : 'Kaybettin';
  t.className = 'ovl-title ' + (win ? 'win' : 'lose');
  $('ovl-score').textContent = `${me} – ${foe}`;
  $('ovl-sub').textContent = App.mode === 'online'
    ? 'Tekrar oyna dersen maç yeniden başlar.'
    : '';
  $('ovl').classList.remove('hidden');
}
function showOverLocal(g) {
  const win = g.winner === 'a';
  Snd.over(true);
  const t = $('ovl-title');
  t.textContent = win ? 'Oyuncu 1 Kazandı!' : 'Oyuncu 2 Kazandı!';
  t.className = 'ovl-title ' + (win ? 'win' : 'lose');
  $('ovl-score').textContent = `${g.scoreA} – ${g.scoreB}`;
  $('ovl-sub').textContent = '';
  $('ovl').classList.remove('hidden');
}
function hideOver() { $('ovl').classList.add('hidden'); $('half').classList.add('hidden'); }

/* ============================ canvas ============================ */

const cv = $('cv');
const cx = cv.getContext('2d');
let VIEW = { ox: 0, oy: 0, s: 1, w: 0, h: 0 };

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = window.innerWidth, h = window.innerHeight;
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pad = 6;
  const s = Math.min((w - pad * 2) / W, (h - pad * 2) / H);
  VIEW = { ox: (w - W * s) / 2, oy: (h - H * s) / 2, s, w, h };
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

const fx = (x) => VIEW.ox + x * VIEW.s;
const fy = (y) => VIEW.oy + y * VIEW.s;
const fs = (v) => v * VIEW.s;
/* screen -> field. In the second half the canvas is drawn rotated a half turn
   about the viewport centre, so touches come back through the same turn. */
const gx = (px) => { const v = (px - VIEW.ox) / VIEW.s; return App.flip ? W - v : v; };
const gy = (py) => { const v = (py - VIEW.oy) / VIEW.s; return App.flip ? H - v : v; };

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawRink() {
  const x = fx(0), y = fy(0), w = fs(W), h = fs(H), r = fs(9);

  // ice
  const g = cx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, PAL.ice[0]);
  g.addColorStop(0.5, PAL.ice[1]);
  g.addColorStop(1, PAL.ice[2]);
  roundRect(cx, x, y, w, h, r);
  cx.fillStyle = g;
  cx.fill();

  cx.save();
  roundRect(cx, x, y, w, h, r);
  cx.clip();

  // half-court tints
  cx.fillStyle = PAL.tintMe;
  cx.fillRect(x, y + h / 2, w, h / 2);
  cx.fillStyle = PAL.tintFoe;
  cx.fillRect(x, y, w, h / 2);

  // centre line
  cx.strokeStyle = PAL.line;
  cx.lineWidth = Math.max(1, fs(0.5));
  cx.setLineDash([fs(3), fs(3)]);
  cx.beginPath();
  cx.moveTo(x, fy(H / 2));
  cx.lineTo(x + w, fy(H / 2));
  cx.stroke();
  cx.setLineDash([]);

  // centre circle
  cx.beginPath();
  cx.arc(fx(W / 2), fy(H / 2), fs(16), 0, Math.PI * 2);
  cx.stroke();
  cx.beginPath();
  cx.arc(fx(W / 2), fy(H / 2), fs(2.2), 0, Math.PI * 2);
  cx.fillStyle = PAL.line;
  cx.fill();

  // goal creases
  cx.strokeStyle = PAL.lineSoft;
  cx.beginPath(); cx.arc(fx(W / 2), fy(0), fs(26), 0, Math.PI); cx.stroke();
  cx.beginPath(); cx.arc(fx(W / 2), fy(H), fs(26), Math.PI, Math.PI * 2); cx.stroke();

  cx.restore();

  // goal mouths
  drawGoal(fy(0), PAL.foe);
  drawGoal(fy(H), PAL.me);

  // board
  roundRect(cx, x, y, w, h, r);
  cx.strokeStyle = PAL.board;
  cx.lineWidth = Math.max(1.5, fs(0.7));
  cx.stroke();
}

function drawGoal(yy, color) {
  const x0 = fx(GX0), x1 = fx(GX1);
  cx.save();
  cx.strokeStyle = color;
  cx.lineWidth = Math.max(3, fs(1.8));
  cx.lineCap = 'round';
  if (PAL.glow) { cx.shadowColor = color; cx.shadowBlur = fs(6); }
  cx.beginPath();
  cx.moveTo(x0, yy);
  cx.lineTo(x1, yy);
  cx.stroke();
  cx.restore();
}

/* A soft contact shadow reads as depth on the light themes, where a neon
   glow would just look muddy. */
function drawShadow(px, py, pr) {
  if (!PAL.shadow) return;
  cx.save();
  cx.fillStyle = PAL.shadow;
  cx.filter = 'blur(' + Math.max(1, fs(0.6)) + 'px)';
  cx.beginPath();
  cx.ellipse(px + pr * 0.16, py + pr * 0.30, pr * 0.98, pr * 0.92, 0, 0, Math.PI * 2);
  cx.fill();
  cx.restore();
}

function drawPuck(p) {
  // Motion beam, in the striker's colour and lighter than the puck itself.
  const beam = R.trailCol || Cfg.puckRGB();
  for (let i = 0; i < R.trail.length; i++) {
    const t = R.trail[i];
    const f = i / R.trail.length;
    const a = f * 0.24;
    cx.beginPath();
    cx.arc(fx(t.x), fy(t.y), fs(PUCK_R) * (0.35 + 0.6 * f), 0, Math.PI * 2);
    cx.fillStyle = `rgba(${beam},${a})`;
    cx.fill();
  }

  const col = Cfg.puckG();
  const px = fx(p.x), py = fy(p.y), pr = fs(PUCK_R);
  drawShadow(px, py, pr);
  cx.save();
  if (PAL.glow) { cx.shadowColor = col[1]; cx.shadowBlur = fs(7); }
  const g = cx.createRadialGradient(px - pr * 0.3, py - pr * 0.4, pr * 0.1, px, py, pr);
  g.addColorStop(0, col[0]);
  g.addColorStop(0.55, col[1]);
  g.addColorStop(1, col[2]);
  cx.beginPath();
  cx.arc(px, py, pr, 0, Math.PI * 2);
  cx.fillStyle = g;
  cx.fill();
  cx.restore();

  // A hairline in the opposite direction to the rink keeps a black puck on a
  // dark rink (or a white one on ice) from disappearing.
  cx.beginPath();
  cx.arc(px, py, pr - Math.max(0.4, fs(0.12)), 0, Math.PI * 2);
  cx.strokeStyle = PAL.glow ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.22)';
  cx.lineWidth = Math.max(1, fs(0.3));
  cx.stroke();
}

function drawPaddle(p, color, radius, dim) {
  const px = fx(p.x), py = fy(p.y), pr = fs(radius);
  drawShadow(px, py, pr);
  cx.save();
  cx.globalAlpha = dim ? 0.55 : 1;

  if (PAL.glow) { cx.shadowColor = color; cx.shadowBlur = fs(6); }

  const g = cx.createRadialGradient(px, py, pr * 0.25, px, py, pr);
  g.addColorStop(0, 'rgba(255,255,255,.30)');
  g.addColorStop(0.62, color);
  g.addColorStop(1, color);
  cx.beginPath();
  cx.arc(px, py, pr, 0, Math.PI * 2);
  cx.fillStyle = g;
  cx.fill();

  cx.shadowBlur = 0;
  cx.beginPath();
  cx.arc(px, py, pr * 0.52, 0, Math.PI * 2);
  cx.fillStyle = PAL.padInner;
  cx.fill();

  cx.beginPath();
  cx.arc(px, py, pr * 0.52, 0, Math.PI * 2);
  cx.strokeStyle = PAL.padRing;
  cx.lineWidth = Math.max(1, fs(0.35));
  cx.stroke();
  cx.restore();
}

/* ============================ input ============================ */

const pointers = new Map();   // pointerId -> 'me' | 'foe'

function clampMy(x, y) {
  const r = App.rMe;
  return { x: clamp(x, r, W - r), y: clamp(y, H / 2 + r, H - r) };
}
function clampFoe(x, y) {
  const r = App.rFoe;
  return { x: clamp(x, r, W - r), y: clamp(y, r, H / 2 - r) };
}

function pointerPos(e) {
  const rect = cv.getBoundingClientRect();
  return { x: gx(e.clientX - rect.left), y: gy(e.clientY - rect.top) };
}

function onDown(e) {
  if (current !== 's-game') return;
  if (!$('half').classList.contains('hidden')) return;   // half-time break
  cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
  const p = pointerPos(e);
  // Which half was touched decides which paddle this finger owns.
  const who = p.y >= H / 2 ? 'me' : 'foe';
  if (who === 'foe' && App.mode !== 'local') return;   // online: only my half
  pointers.set(e.pointerId, who);
  applyPointer(who, p);
  e.preventDefault();
}

function onMove(e) {
  const who = pointers.get(e.pointerId);
  if (!who) return;
  applyPointer(who, pointerPos(e));
  e.preventDefault();
}

function onUp(e) {
  pointers.delete(e.pointerId);
}

/* The mallet sits a little way *up-field* of the fingertip, so the finger
   never parks on top of the thing you are trying to aim with. */
function applyPointer(who, p) {
  const lead = Cfg.lead();
  if (who === 'me') {
    const c = clampMy(p.x, p.y - lead);
    myPad.tx = c.x; myPad.ty = c.y;
  } else {
    const c = clampFoe(p.x, p.y + lead);
    foePad.tx = c.x; foePad.ty = c.y;
  }
}

cv.addEventListener('pointerdown', onDown, { passive: false });
cv.addEventListener('pointermove', onMove, { passive: false });
cv.addEventListener('pointerup', onUp);
cv.addEventListener('pointercancel', onUp);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

/* Mouse fallback for desktop: move without pressing. */
cv.addEventListener('mousemove', (e) => {
  if (current !== 's-game' || pointers.size) return;
  if (e.pointerType && e.pointerType !== 'mouse') return;
  const rect = cv.getBoundingClientRect();
  const p = { x: gx(e.clientX - rect.left), y: gy(e.clientY - rect.top) };
  if (p.y >= H / 2) applyPointer('me', p);
  else if (App.mode === 'local') applyPointer('foe', p);
});

/* ============================ loop ============================ */

function stepPad(p, dt) {
  const dx = p.tx - p.x, dy = p.ty - p.y;
  const d = Math.hypot(dx, dy);
  const m = PAD_MAX_SPEED * dt;
  if (d <= m || d === 0) { p.x = p.tx; p.y = p.ty; }
  else { p.x += (dx / d) * m; p.y += (dy / d) * m; }
}

let lastFrame = performance.now();
let lastSent = { x: -1, y: -1 };

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (dt > 0.1) dt = 0.1;
  if (current !== 's-game') return;

  if (App.mode === 'local') stepLocal(dt);
  else stepOnline(dt);

  render(dt);
}

function stepOnline(dt) {
  const s = App.snap;
  // "3 - 2 - 1" means nobody moves. The server ignores input during the
  // countdown; pinning the local copy too keeps the two views in step.
  const frozen = !!s && s.st !== ST.PLAYING;

  if (frozen) {
    if (s) { myPad.x = myPad.tx = s.m[0]; myPad.y = myPad.ty = s.m[1]; }
    lastSent = { x: -1, y: -1 };
  } else {
    stepPad(myPad, dt);
    // Push my paddle target to the server at frame rate.
    if (myPad.tx !== lastSent.x || myPad.ty !== lastSent.y) {
      if (Net.send({ t: 'i', x: +myPad.tx.toFixed(2), y: +myPad.ty.toFixed(2) })) {
        lastSent.x = myPad.tx; lastSent.y = myPad.ty;
      }
    }
  }

  if (!s) return;

  /* A snapshot describes the rink as it was one trip-time ago, so it is carried
     forward over that trip *plus* the packet's own age. Drawing it raw puts the
     puck a whole ping behind the mallet you are swinging at it - which is
     exactly what "the mallet went straight through the puck" looks like. */
  const lead = App.ping == null ? 0 : Math.min(App.ping, 240) / 2000;
  const age = Math.min((performance.now() - App.snapAt) / 1000 + lead, 0.22);
  const live = s.st === ST.PLAYING;
  const tpx = clamp(s.p[0] + (live ? s.p[2] * age : 0), -6, W + 6);
  const tpy = clamp(s.p[1] + (live ? s.p[3] * age : 0), -6, H + 6);

  // The opponent's mallet gets the same treatment, so their strike lands on
  // screen at the moment the puck leaves rather than a ping later.
  const ov = s.ov || [0, 0];
  const tox = clamp(s.o[0] + (live ? ov[0] * age : 0), 0, W);
  const toy = clamp(s.o[1] + (live ? ov[1] * age : 0), 0, H / 2);

  const a = 1 - Math.exp(-42 * dt);
  R.puck.x += (tpx - R.puck.x) * a;
  R.puck.y += (tpy - R.puck.y) * a;
  R.foe.x += (tox - R.foe.x) * a;
  R.foe.y += (toy - R.foe.y) * a;

  // Gently reconcile my paddle with the server's authoritative copy.
  const b = 1 - Math.exp(-6 * dt);
  myPad.x += (s.m[0] - myPad.x) * b;
  myPad.y += (s.m[1] - myPad.y) * b;
  R.me.x = myPad.x; R.me.y = myPad.y;

  // Whatever the numbers say, a solid mallet must never be drawn sitting on
  // top of the puck. If the two overlap on screen, the puck is nudged clear -
  // the next snapshot corrects it, and the contact reads as a contact.
  if (live) { pushPuckOut(R.me, App.rMe); pushPuckOut(R.foe, App.rFoe); }
}

/* Cosmetic separation only: no velocity is invented here. */
function pushPuckOut(pad, r) {
  const dx = R.puck.x - pad.x;
  const dy = R.puck.y - pad.y;
  const min = PUCK_R + r;
  const d = Math.hypot(dx, dy);
  if (d >= min) return;
  const nx = d === 0 ? 0 : dx / d;
  const ny = d === 0 ? -1 : dy / d;
  R.puck.x = pad.x + nx * min;
  R.puck.y = pad.y + ny * min;
}

function stepLocal(dt) {
  const g = App.game;
  if (!g) return;

  // setInput is a no-op unless the puck is live, so the countdown freeze
  // needs nothing special here.
  g.applyInput('a', myPad.tx, myPad.ty);
  g.setInput('b', foePad.tx, foePad.ty);

  const prevState = g.state;
  g.step(dt);

  for (const e of g.events) {
    const type = e[0], ey = e[2], inten = e[3];
    if (type === 0) {
      Snd.hit(inten);
      R.shake = Math.min(1, inten / PUCK_MAX) * 0.6;
      R.trailCol = ey >= H / 2 ? RGB.me : RGB.foe;
    } else if (type === 1) Snd.wall(inten);
    else if (type === 2) {
      const bottomScored = ey < H / 2;
      Snd.goal(true);
      R.shake = 1;
      centerMsg(bottomScored ? 'OYUNCU 1' : 'OYUNCU 2', 'goal', 1200);
    } else if (type === 3) {
      Snd.ui();
      centerMsg(luckyText(inten, ey >= H / 2, true), 'lucky', 1400);
    }
  }
  g.clearEvents();

  if (g.state === ST.HALFTIME && prevState !== ST.HALFTIME) {
    enterHalftime(g);
  } else if (g.state === ST.COUNTDOWN) {
    paintCountdown(g.countdown);
  } else if (prevState === ST.COUNTDOWN && g.state === ST.PLAYING) {
    App.lastCd = -1;
    centerMsg('BAŞLA!', '', 550);
  }

  if (g.state === ST.OVER && prevState !== ST.OVER) showOverLocal(g);

  $('sc-me').textContent = g.scoreA;
  $('sc-foe').textContent = g.scoreB;

  R.puck.x = g.puck.x; R.puck.y = g.puck.y;
  R.me.x = g.padA.x;   R.me.y = g.padA.y;
  R.foe.x = g.padB.x;  R.foe.y = g.padB.y;
  App.rMe = g.padA.r;  App.rFoe = g.padB.r;
  // The mallets sit on their spots through the countdown; keep the finger
  // targets there too so nothing lurches when the puck goes live.
  if (g.state !== ST.PLAYING) {
    myPad.x = myPad.tx = g.padA.x; myPad.y = myPad.ty = g.padA.y;
    foePad.x = foePad.tx = g.padB.x; foePad.y = foePad.ty = g.padB.y;
  }
}

function render(dt) {
  cx.clearRect(0, 0, VIEW.w, VIEW.h);

  cx.save();
  // Second half: the whole rink is drawn upside down, because the phone
  // itself has been turned around on the table.
  if (App.flip) {
    cx.translate(VIEW.w / 2, VIEW.h / 2);
    cx.rotate(Math.PI);
    cx.translate(-VIEW.w / 2, -VIEW.h / 2);
  }

  if (R.shake > 0.01) {
    const s = R.shake * fs(1.4);
    cx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    R.shake *= Math.pow(0.0015, dt);
  } else R.shake = 0;

  drawRink();

  R.trail.push({ x: R.puck.x, y: R.puck.y });
  if (R.trail.length > 7) R.trail.shift();

  drawPaddle(R.foe, PAL.foe, App.rFoe, App.mode === 'online' && !App.peerOn);
  drawPaddle(R.me, PAL.me, App.rMe, false);
  drawPuck(R.puck);

  cx.restore();
}

requestAnimationFrame(frame);

/* ============================ pickers ============================ */

function syncChips(groupId, inputId, value) {
  const g = $(groupId);
  if (!g) return;
  let matched = false;
  g.querySelectorAll('.chip[data-v]').forEach((c) => {
    const on = +c.dataset.v === value;
    c.classList.toggle('is-on', on);
    if (on) matched = true;
  });
  const inp = $(inputId);
  if (matched) { inp.value = ''; inp.classList.remove('is-on'); }
  else { inp.value = value; inp.classList.add('is-on'); }
}

function wirePicker(groupId, inputId, onChange) {
  const g = $(groupId);
  g.querySelectorAll('.chip[data-v]').forEach((c) => {
    c.addEventListener('click', () => {
      Snd.ui();
      onChange(+c.dataset.v);
    });
  });
  const inp = $(inputId);
  const commit = () => {
    let v = parseInt(inp.value, 10);
    if (!Number.isFinite(v)) return;
    v = clamp(v, 1, 15);
    inp.value = v;
    onChange(v);
  };
  inp.addEventListener('input', commit);
  inp.addEventListener('blur', () => { if (!inp.value) syncChips(groupId, inputId, App.target); });
}

/* Simple option rows (theme / mallet size / grip) — no free-text field. */
function wireOptions(groupId, get, set) {
  const g = $(groupId);
  const paint = () => g.querySelectorAll('.chip[data-v]').forEach((c) => {
    c.classList.toggle('is-on', String(c.dataset.v) === String(get()));
  });
  g.querySelectorAll('.chip[data-v]').forEach((c) => {
    c.addEventListener('click', () => { Snd.ui(); set(c.dataset.v); paint(); });
  });
  paint();
  return paint;
}

/* A plain on/off row. */
function wireToggle(id, get, set) {
  const el = $(id);
  const paint = () => {
    const on = !!get();
    el.classList.toggle('is-on', on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  };
  el.addEventListener('click', () => { Snd.ui(); set(!get()); paint(); });
  paint();
  return paint;
}

let onlineTarget = 7;
let localTarget = 7;
let onlineMode = Cfg.mode, localMode = Cfg.mode;
let onlineHalf = Cfg.half, localHalf = Cfg.half;

wirePicker('pick-online', 't-online', (v) => {
  onlineTarget = v;
  syncChips('pick-online', 't-online', v);
  updatePlan('plan-online', v, onlineHalf);
});
wirePicker('pick-local', 't-local', (v) => {
  localTarget = v;
  syncChips('pick-local', 't-local', v);
  updatePlan('plan-local', v, localHalf);
});
wirePicker('pick-lobby', 't-lobby', (v) => {
  if (App.side !== 'a') return;
  App.target = v;
  syncChips('pick-lobby', 't-lobby', v);
  updatePlan('plan-lobby', v, App.halfAt > 0);
  Net.send({ t: 'target', v });
});

wireOptions('mode-online', () => onlineMode, (v) => { onlineMode = v; Cfg.mode = v; Cfg.save(); });
wireOptions('mode-local', () => localMode, (v) => { localMode = v; Cfg.mode = v; Cfg.save(); });
wireToggle('half-online', () => onlineHalf, (v) => {
  onlineHalf = v; Cfg.half = v; Cfg.save();
  updatePlan('plan-online', onlineTarget, v);
});
wireToggle('half-local', () => localHalf, (v) => {
  localHalf = v; Cfg.half = v; Cfg.save();
  updatePlan('plan-local', localTarget, v);
  $('hint-local-half').classList.toggle('hidden', !v);
});
updatePlan('plan-online', onlineTarget, onlineHalf);
updatePlan('plan-local', localTarget, localHalf);
$('hint-local-half').classList.toggle('hidden', !localHalf);

/* Only the host may touch the lobby rules; the guest sees them greyed out. */
function sendOpts() {
  Net.send({ t: 'opts', mode: App.gameMode, half: App.halfAt > 0 });
}
const paintLobbyMode = wireOptions('mode-lobby', () => App.gameMode, (v) => {
  if (App.side !== 'a') return;
  App.gameMode = v;
  sendOpts();
});
const paintLobbyHalf = wireToggle('half-lobby', () => App.halfAt > 0, (v) => {
  if (App.side !== 'a') return;
  App.halfAt = v ? halftimeFor(App.target) : 0;
  sendOpts();
});

function syncLobbyRules() {
  const host = App.side === 'a';
  $('lobby-rules').classList.toggle('locked', !host);
  $('lobby-hostnote').classList.toggle('hidden', !host);
  $('lobby-guestnote').classList.toggle('hidden', host);
  syncChips('pick-lobby', 't-lobby', App.target);
  paintLobbyMode();
  paintLobbyHalf();
  updatePlan('plan-lobby', App.target, App.halfAt > 0);
}

(function buildPuckChips() {
  const g = $('pick-puck');
  for (const key of PUCK_KEYS) {
    const c = PUCK_COLORS[key];
    const b = document.createElement('button');
    b.className = 'chip chip-puck';
    b.dataset.v = key;
    b.textContent = c.name;
    // "Tema" has no fixed colour of its own; show the rink's current puck.
    b.style.setProperty('--swatch',
      c.g ? `linear-gradient(135deg,${c.g[0]},${c.g[2]})` : 'conic-gradient(#e23b26,#ffd166,#1f7ae0,#232323,#e23b26)');
    g.appendChild(b);
  }
}());

let repaintPuckChips = null;

wireOptions('pick-theme', () => Cfg.theme, (v) => {
  applyTheme(v);
  Cfg.save();
  if (repaintPuckChips) repaintPuckChips();
  drawPreview();
});
repaintPuckChips = wireOptions('pick-puck', () => Cfg.puck, (v) => {
  Cfg.puck = v;
  Cfg.save();
  drawPreview();
});
wireOptions('pick-pad', () => Cfg.pad, (v) => {
  Cfg.pad = +v;
  Cfg.save();
  if (App.mode !== 'online') { App.padR = Cfg.padR(); App.rMe = App.rFoe = App.padR; }
  drawPreview();
});
wireOptions('pick-grip', () => Cfg.grip, (v) => {
  Cfg.grip = +v;
  Cfg.save();
  drawPreview();
});

/* ---------------- settings preview ---------------- */

const pv = $('pv');
const pvx = pv.getContext('2d');
const PV_S = 6;                 // px per field unit
const PV_TOP = H - pv.height / PV_S;
const pvFinger = { x: W / 2, y: H - 16 };

function drawPreview() {
  const w = pv.width, h = pv.height;
  const X = (x) => x * PV_S;
  const Y = (y) => (y - PV_TOP) * PV_S;

  pvx.clearRect(0, 0, w, h);
  const g = pvx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, PAL.ice[1]);
  g.addColorStop(1, PAL.ice[0]);
  pvx.fillStyle = g;
  pvx.fillRect(0, 0, w, h);

  // my half tint + goal line
  pvx.fillStyle = PAL.tintMe;
  pvx.fillRect(0, 0, w, h);
  pvx.strokeStyle = PAL.me;
  pvx.lineWidth = 8; pvx.lineCap = 'round';
  pvx.beginPath(); pvx.moveTo(X(GX0), h - 4); pvx.lineTo(X(GX1), h - 4); pvx.stroke();

  const r = Cfg.padR() * PV_S;
  const padY = clamp(pvFinger.y - Cfg.lead(), PV_TOP + Cfg.padR(), H - Cfg.padR());
  const padX = clamp(pvFinger.x, Cfg.padR(), W - Cfg.padR());

  // the puck, for scale and to preview its colour
  const puckCol = Cfg.puckG();
  const pg = pvx.createRadialGradient(
    X(W / 2) - PUCK_R * PV_S * 0.3, Y(PV_TOP + 9) - PUCK_R * PV_S * 0.4, 2,
    X(W / 2), Y(PV_TOP + 9), PUCK_R * PV_S);
  pg.addColorStop(0, puckCol[0]);
  pg.addColorStop(0.55, puckCol[1]);
  pg.addColorStop(1, puckCol[2]);
  pvx.fillStyle = pg;
  pvx.beginPath(); pvx.arc(X(W / 2), Y(PV_TOP + 9), PUCK_R * PV_S, 0, Math.PI * 2); pvx.fill();

  // mallet
  pvx.fillStyle = PAL.me;
  pvx.beginPath(); pvx.arc(X(padX), Y(padY), r, 0, Math.PI * 2); pvx.fill();
  pvx.fillStyle = PAL.padInner;
  pvx.beginPath(); pvx.arc(X(padX), Y(padY), r * 0.52, 0, Math.PI * 2); pvx.fill();

  // a real fingertip is roughly 6 field units across on a phone-sized rink
  pvx.strokeStyle = 'rgba(0,0,0,.45)';
  pvx.setLineDash([7, 6]);
  pvx.lineWidth = 3;
  pvx.beginPath(); pvx.arc(X(pvFinger.x), Y(pvFinger.y), 6 * PV_S, 0, Math.PI * 2); pvx.stroke();
  pvx.setLineDash([]);
  pvx.fillStyle = 'rgba(0,0,0,.18)';
  pvx.beginPath(); pvx.arc(X(pvFinger.x), Y(pvFinger.y), 6 * PV_S, 0, Math.PI * 2); pvx.fill();

  $('pv-hint').textContent =
    `${PAD_NAMES[Cfg.pad]} sopa · parmak boşluğu ${['kapalı', 'az', 'orta', 'çok'][Cfg.grip]}`
    + ' — kesikli daire parmağın.';
}

function pvPoint(e) {
  const rect = pv.getBoundingClientRect();
  const sx = pv.width / rect.width;
  pvFinger.x = clamp(((e.clientX - rect.left) * sx) / PV_S, 0, W);
  pvFinger.y = clamp(((e.clientY - rect.top) * sx) / PV_S + PV_TOP, PV_TOP, H);
  drawPreview();
}
pv.addEventListener('pointerdown', (e) => { pv.setPointerCapture(e.pointerId); pvPoint(e); e.preventDefault(); });
pv.addEventListener('pointermove', (e) => { if (e.buttons) { pvPoint(e); e.preventDefault(); } });

/* ============================ game entry ============================ */

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (_) { /* not fatal */ }
}
function releaseAwake() {
  if (wakeLock) { try { wakeLock.release(); } catch (_) {} wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current === 's-game') keepAwake();
});

function resetRender() {
  R.puck.x = W / 2; R.puck.y = H / 2;
  R.me.x = myPad.x = myPad.tx = W / 2;
  R.me.y = myPad.y = myPad.ty = H * 0.78;
  R.foe.x = foePad.x = foePad.tx = W / 2;
  R.foe.y = foePad.y = foePad.ty = H * 0.22;
  R.trail.length = 0;
  R.trailCol = null;
  R.shake = 0;
  pointers.clear();
  App.lastCd = -1;
  App.halfReady = false;
  App.rMe = App.rFoe = App.padR;
  lastSent = { x: -1, y: -1 };
}

function enterGame() {
  resize();
  resetRender();
  hideOver();
  show('s-game');
  keepAwake();
}

function startLocal() {
  App.mode = 'local';
  App.target = localTarget;
  App.padR = Cfg.padR();
  App.gameMode = localMode;
  App.lastState = -1;
  App.game = new Game({
    target: localTarget, padR: App.padR, halftime: localHalf, mode: localMode,
  });
  App.halfAt = App.game.halfAt;
  App.game.startCountdown();
  setFlip(false);
  $('hud-me').textContent = 'Oyuncu 1';
  $('hud-foe').textContent = 'Oyuncu 2';
  setHudTarget(localTarget, App.halfAt, localMode);
  $('hud-ping').parentElement.style.display = 'none';
  enterGame();
}

function leaveGame() {
  releaseAwake();
  if (App.mode === 'online') { Net.send({ t: 'leave' }); Net.wantRoom = null; }
  App.mode = null;
  App.game = null;
  App.snap = null;
  setFlip(false);
  hideOver();
  hideMsg();
  show('s-menu');
}

/* ============================ UI wiring ============================ */

function firstGesture() {
  Snd.unlock();
  window.removeEventListener('pointerdown', firstGesture);
  window.removeEventListener('keydown', firstGesture);
}
window.addEventListener('pointerdown', firstGesture);
window.addEventListener('keydown', firstGesture);

document.querySelectorAll('[data-back]').forEach((b) => {
  b.addEventListener('click', () => { Snd.ui(); show(b.dataset.back); });
});

$('i-name').addEventListener('input', (e) => {
  App.myName = e.target.value.trim().slice(0, 14) || 'Oyuncu';
  try { localStorage.setItem('ah_name', App.myName); } catch (_) {}
});
try {
  const saved = localStorage.getItem('ah_name');
  if (saved) { $('i-name').value = saved; App.myName = saved; }
} catch (_) {}

$('b-settings').addEventListener('click', () => { Snd.ui(); show('s-set'); });

$('b-online').addEventListener('click', () => {
  Snd.ui();
  $('hud-ping').parentElement.style.display = '';
  show('s-online');
  Net.connect();
});

$('b-local').addEventListener('click', () => { Snd.ui(); show('s-local'); });
$('b-local-start').addEventListener('click', () => { Snd.ui(); startLocal(); });

$('b-create').addEventListener('click', () => {
  Snd.ui();
  if (!Net.ready) { toast('Sunucuya bağlanılıyor, bir saniye…'); Net.connect(); return; }
  App.lastState = -1;
  Net.send({
    t: 'create', target: onlineTarget, mode: onlineMode, half: onlineHalf,
    pad: Cfg.padR(), name: App.myName,
  });
});

$('i-code').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (e.target.value.length === 4) e.target.blur();
});

$('b-join').addEventListener('click', () => {
  Snd.ui();
  const code = $('i-code').value.trim().toUpperCase();
  if (code.length !== 4) return toast('4 haneli oda kodunu gir.');
  if (!Net.ready) { toast('Sunucuya bağlanılıyor, bir saniye…'); Net.connect(); return; }
  App.lastState = -1;
  Net.wantRoom = code;
  Net.send({ t: 'join', code, name: App.myName });
});

$('b-copy').addEventListener('click', async () => {
  Snd.ui();
  try {
    await navigator.clipboard.writeText(App.code);
    toast('Kod kopyalandı: ' + App.code);
  } catch (_) {
    toast('Kod: ' + App.code);
  }
});

$('b-share').addEventListener('click', async () => {
  Snd.ui();
  const url = `${location.origin}${location.pathname}?oda=${App.code}`;
  const text = `Air Hockey oynayalım! Oda kodum: ${App.code}\nLinke dokun, direkt odaya gir:\n${url}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Air Hockey', text }); return; } catch (_) { return; }
  }
  try { await navigator.clipboard.writeText(text); toast('Davet kopyalandı'); }
  catch (_) { toast('Kod: ' + App.code); }
});

$('b-lobby-leave').addEventListener('click', () => {
  Snd.ui();
  Net.send({ t: 'leave' });
  Net.wantRoom = null;
  App.mode = null;
  show('s-online');
});

$('b-exit').addEventListener('click', () => { Snd.ui(); leaveGame(); });
$('b-menu').addEventListener('click', () => { Snd.ui(); leaveGame(); });

$('b-again').addEventListener('click', () => {
  Snd.ui();
  if (App.mode === 'local') {
    App.game.restart();
    App.lastCd = -1;
    setFlip(false);
    hideOver();
  } else {
    Net.send({ t: 'restart' });
    hideOver();
  }
});

/* Deep link: ?oda=ABCD jumps straight into a room. */
(function deepLink() {
  const code = new URLSearchParams(location.search).get('oda');
  if (!code) return;
  $('i-code').value = code.toUpperCase().slice(0, 4);
  show('s-online');
  Net.connect();
  const t = setInterval(() => {
    if (Net.ready) {
      clearInterval(t);
      Net.wantRoom = $('i-code').value;
      Net.send({ t: 'join', code: $('i-code').value, name: App.myName });
    }
  }, 300);
  setTimeout(() => clearInterval(t), 12000);
}());

resize();
drawPreview();
Net.connect();
}());
