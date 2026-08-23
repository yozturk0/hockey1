/* Air Hockey — client. Online play is server-authoritative; the local
   two-player mode runs the exact same engine right here in the page. */
(function () {
'use strict';

const { Game, ST, CONST } = window.AHEngine;
const { W, H, PUCK_R, PAD_R, GX0, GX1 } = CONST;

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ============================ state ============================ */

const App = {
  mode: null,          // 'online' | 'local'
  side: 'a',
  code: null,
  target: 7,
  myName: 'Oyuncu',
  foeName: 'Rakip',
  snap: null,
  snapAt: 0,
  ping: null,
  peerOn: false,
  lastCd: -1,
  lastState: -1,
  game: null,          // local engine
  running: false,
};

/* Smoothed render positions (my paddle is ALWAYS the bottom one). */
const R = {
  puck: { x: W / 2, y: H / 2 },
  me:   { x: W / 2, y: H * 0.78 },
  foe:  { x: W / 2, y: H * 0.22 },
  trail: [],
  flash: 0,
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
      Net.wantRoom = m.code;
      $('lobby-code').textContent = m.code;
      $('hud-target').textContent = m.target;
      syncChips('pick-lobby', 't-lobby', m.target);
      $('pick-lobby').style.display = m.side === 'a' ? '' : 'none';
      if (current !== 's-game') show('s-lobby');
      break;

    case 'room': {
      App.target = m.target;
      $('hud-target').textContent = m.target;
      syncChips('pick-lobby', 't-lobby', m.target);
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

  // Events: identical audio cues on both clients, driven by the server.
  for (const e of s.e) {
    const type = e[0], ey = e[2], inten = e[3];
    if (type === 0) { Snd.hit(inten); R.flash = 1; R.shake = Math.min(1, inten / 190) * 0.5; }
    else if (type === 1) { Snd.wall(inten); }
    else if (type === 2) {
      const mine = ey < H / 2;               // the puck went into THEIR net
      Snd.goal(mine);
      R.shake = 1;
      centerMsg(mine ? 'GOL!' : 'Rakip Attı', 'goal', 1200);
    }
  }

  // Countdown ticks
  if (s.st === ST.COUNTDOWN) {
    const n = Math.ceil(s.cd / 1000);
    if (n !== App.lastCd && n > 0) { App.lastCd = n; Snd.count(n); }
    if (s.cd > 0 && R.flash === 0) centerMsg(String(Math.max(1, n)), '', 0);
  } else if (App.lastState === ST.COUNTDOWN && s.st === ST.PLAYING) {
    App.lastCd = -1;
    centerMsg('BAŞLA!', '', 550);
  } else if (s.st === ST.PAUSED) {
    centerMsg('Rakip bekleniyor…', 'goal', 0);
  } else if (s.st === ST.PLAYING) {
    hideMsgIfIdle();
  }

  if (s.st === ST.OVER && App.lastState !== ST.OVER) {
    showOver(s.w === 1, s.sm, s.so);
  }
  if (s.st !== ST.OVER && App.lastState === ST.OVER) hideOver();

  App.lastState = s.st;
}

/* ============================ center message ============================ */

let msgTimer = null;
function centerMsg(txt, cls, ms) {
  const el = $('cmsg');
  $('cmsg-txt').textContent = txt;
  el.className = 'center-msg' + (cls ? ' ' + cls : '');
  clearTimeout(msgTimer);
  if (ms > 0) msgTimer = setTimeout(() => el.classList.add('hidden'), ms);
}
function hideMsgIfIdle() {
  if (!msgTimer) $('cmsg').classList.add('hidden');
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
function hideOver() { $('ovl').classList.add('hidden'); }

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
/* screen -> field */
const gx = (px) => (px - VIEW.ox) / VIEW.s;
const gy = (py) => (py - VIEW.oy) / VIEW.s;

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
  g.addColorStop(0, '#132347');
  g.addColorStop(0.5, '#0c1631');
  g.addColorStop(1, '#132347');
  roundRect(cx, x, y, w, h, r);
  cx.fillStyle = g;
  cx.fill();

  cx.save();
  roundRect(cx, x, y, w, h, r);
  cx.clip();

  // half-court tints
  cx.fillStyle = 'rgba(34,211,238,.06)';
  cx.fillRect(x, y + h / 2, w, h / 2);
  cx.fillStyle = 'rgba(255,77,109,.06)';
  cx.fillRect(x, y, w, h / 2);

  // centre line
  cx.strokeStyle = 'rgba(150,190,240,.30)';
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
  cx.fillStyle = 'rgba(150,190,240,.30)';
  cx.fill();

  // goal creases
  cx.strokeStyle = 'rgba(150,190,240,.22)';
  cx.beginPath(); cx.arc(fx(W / 2), fy(0), fs(26), 0, Math.PI); cx.stroke();
  cx.beginPath(); cx.arc(fx(W / 2), fy(H), fs(26), Math.PI, Math.PI * 2); cx.stroke();

  cx.restore();

  // goal mouths
  drawGoal(fy(0), '#ff4d6d');
  drawGoal(fy(H), '#22d3ee');

  // board
  roundRect(cx, x, y, w, h, r);
  cx.strokeStyle = 'rgba(120,170,230,.34)';
  cx.lineWidth = Math.max(1.5, fs(0.7));
  cx.stroke();
}

function drawGoal(yy, color) {
  const x0 = fx(GX0), x1 = fx(GX1);
  cx.save();
  cx.strokeStyle = color;
  cx.lineWidth = Math.max(3, fs(1.6));
  cx.lineCap = 'round';
  cx.shadowColor = color;
  cx.shadowBlur = fs(6);
  cx.beginPath();
  cx.moveTo(x0, yy);
  cx.lineTo(x1, yy);
  cx.stroke();
  cx.restore();
}

function drawPuck(p) {
  // trail
  for (let i = 0; i < R.trail.length; i++) {
    const t = R.trail[i];
    const a = (i / R.trail.length) * 0.30;
    cx.beginPath();
    cx.arc(fx(t.x), fy(t.y), fs(PUCK_R) * (0.35 + 0.6 * (i / R.trail.length)), 0, Math.PI * 2);
    cx.fillStyle = `rgba(255,231,150,${a})`;
    cx.fill();
  }

  const px = fx(p.x), py = fy(p.y), pr = fs(PUCK_R);
  cx.save();
  cx.shadowColor = 'rgba(255,214,110,.9)';
  cx.shadowBlur = fs(7);
  const g = cx.createRadialGradient(px - pr * 0.3, py - pr * 0.4, pr * 0.1, px, py, pr);
  g.addColorStop(0, '#fff6d8');
  g.addColorStop(0.55, '#ffd166');
  g.addColorStop(1, '#c98f1e');
  cx.beginPath();
  cx.arc(px, py, pr, 0, Math.PI * 2);
  cx.fillStyle = g;
  cx.fill();
  cx.restore();
}

function drawPaddle(p, color, dim) {
  const px = fx(p.x), py = fy(p.y), pr = fs(PAD_R);
  cx.save();
  cx.globalAlpha = dim ? 0.55 : 1;

  cx.shadowColor = color;
  cx.shadowBlur = fs(6);

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
  cx.fillStyle = 'rgba(8,14,26,.62)';
  cx.fill();

  cx.beginPath();
  cx.arc(px, py, pr * 0.52, 0, Math.PI * 2);
  cx.strokeStyle = 'rgba(255,255,255,.28)';
  cx.lineWidth = Math.max(1, fs(0.35));
  cx.stroke();
  cx.restore();
}

/* ============================ input ============================ */

const pointers = new Map();   // pointerId -> 'me' | 'foe'

function clampMy(x, y) {
  return {
    x: clamp(x, PAD_R, W - PAD_R),
    y: clamp(y, H / 2 + PAD_R, H - PAD_R),
  };
}
function clampFoe(x, y) {
  return {
    x: clamp(x, PAD_R, W - PAD_R),
    y: clamp(y, PAD_R, H / 2 - PAD_R),
  };
}

function pointerPos(e) {
  const rect = cv.getBoundingClientRect();
  return { x: gx(e.clientX - rect.left), y: gy(e.clientY - rect.top) };
}

function onDown(e) {
  if (current !== 's-game') return;
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

function applyPointer(who, p) {
  if (who === 'me') {
    const c = clampMy(p.x, p.y);
    myPad.tx = c.x; myPad.ty = c.y;
  } else {
    const c = clampFoe(p.x, p.y);
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

const PAD_MAX_SPEED = 320;
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
  stepPad(myPad, dt);

  // Push my paddle target to the server at frame rate.
  if (myPad.tx !== lastSent.x || myPad.ty !== lastSent.y) {
    if (Net.send({ t: 'i', x: +myPad.tx.toFixed(2), y: +myPad.ty.toFixed(2) })) {
      lastSent.x = myPad.tx; lastSent.y = myPad.ty;
    }
  }

  const s = App.snap;
  if (!s) return;

  // Extrapolate the puck over the packet's age, then smooth out jitter.
  const age = Math.min((performance.now() - App.snapAt) / 1000, 0.14);
  const live = s.st === ST.PLAYING;
  const tpx = clamp(s.p[0] + (live ? s.p[2] * age : 0), -6, W + 6);
  const tpy = clamp(s.p[1] + (live ? s.p[3] * age : 0), -6, H + 6);

  const a = 1 - Math.exp(-42 * dt);
  R.puck.x += (tpx - R.puck.x) * a;
  R.puck.y += (tpy - R.puck.y) * a;
  R.foe.x += (s.o[0] - R.foe.x) * a;
  R.foe.y += (s.o[1] - R.foe.y) * a;

  // Gently reconcile my paddle with the server's authoritative copy.
  const b = 1 - Math.exp(-6 * dt);
  myPad.x += (s.m[0] - myPad.x) * b;
  myPad.y += (s.m[1] - myPad.y) * b;
  R.me.x = myPad.x; R.me.y = myPad.y;
}

function stepLocal(dt) {
  const g = App.game;
  if (!g) return;

  g.applyInput('a', myPad.tx, myPad.ty);
  g.setInput('b', foePad.tx, foePad.ty);

  const prevState = g.state;
  g.step(dt);

  for (const e of g.events) {
    const type = e[0], ey = e[2], inten = e[3];
    if (type === 0) { Snd.hit(inten); R.shake = Math.min(1, inten / 190) * 0.5; }
    else if (type === 1) Snd.wall(inten);
    else if (type === 2) {
      const bottomScored = ey < H / 2;
      Snd.goal(true);
      R.shake = 1;
      centerMsg(bottomScored ? 'OYUNCU 1' : 'OYUNCU 2', 'goal', 1200);
    }
  }
  g.clearEvents();

  if (g.state === ST.COUNTDOWN) {
    const n = Math.ceil(g.countdown / 1000);
    if (n !== App.lastCd && n > 0) { App.lastCd = n; Snd.count(n); centerMsg(String(n), '', 0); }
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
}

function render(dt) {
  cx.clearRect(0, 0, VIEW.w, VIEW.h);

  cx.save();
  if (R.shake > 0.01) {
    const s = R.shake * fs(1.4);
    cx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    R.shake *= Math.pow(0.0015, dt);
  } else R.shake = 0;

  drawRink();

  R.trail.push({ x: R.puck.x, y: R.puck.y });
  if (R.trail.length > 7) R.trail.shift();

  drawPaddle(R.foe, '#ff4d6d', App.mode === 'online' && !App.peerOn);
  drawPaddle(R.me, '#22d3ee', false);
  drawPuck(R.puck);

  cx.restore();
}

requestAnimationFrame(frame);

/* ============================ score picker ============================ */

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

let onlineTarget = 7;
let localTarget = 7;

wirePicker('pick-online', 't-online', (v) => { onlineTarget = v; syncChips('pick-online', 't-online', v); });
wirePicker('pick-local', 't-local', (v) => { localTarget = v; syncChips('pick-local', 't-local', v); });
wirePicker('pick-lobby', 't-lobby', (v) => {
  if (App.side !== 'a') return;
  App.target = v;
  syncChips('pick-lobby', 't-lobby', v);
  Net.send({ t: 'target', v });
});

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
  R.shake = 0;
  pointers.clear();
  App.lastCd = -1;
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
  App.lastState = -1;
  App.game = new Game(localTarget);
  App.game.startCountdown();
  $('hud-me').textContent = 'Oyuncu 1';
  $('hud-foe').textContent = 'Oyuncu 2';
  $('hud-target').textContent = localTarget;
  $('hud-ping').parentElement.style.display = 'none';
  enterGame();
}

function leaveGame() {
  releaseAwake();
  if (App.mode === 'online') { Net.send({ t: 'leave' }); Net.wantRoom = null; }
  App.mode = null;
  App.game = null;
  App.snap = null;
  hideOver();
  $('cmsg').classList.add('hidden');
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
  Net.send({ t: 'create', target: onlineTarget, name: App.myName });
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
Net.connect();
}());
