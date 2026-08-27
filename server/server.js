'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Game, ST, CONST, MODES } = require('../web/engine.js');

const PORT = process.env.PORT || 8080;
const WEB_DIR = path.join(__dirname, '..', 'web');
const TICK_HZ = 60;
const SEND_HZ = 60;
const ROOM_TTL_MS = 90_000;      // empty room survives this long so players can rejoin
const LOBBY_TTL_MS = 15 * 60_000;
const MAX_MSG_PER_SEC = 150;
/* Nobody should be able to hold the other player in the half-time break; if
   one of them wanders off, the second half starts by itself. */
const HALFTIME_AUTO_MS = 25_000;

/* ---------------- room registry ---------------- */

const CODE_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY34679'; // no look-alikes
const rooms = new Map();

function newCode() {
  for (let attempt = 0; attempt < 60; attempt++) {
    let c = '';
    for (let i = 0; i < 4; i++) {
      c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!rooms.has(c)) return c;
  }
  return null;
}

function createRoom(opts) {
  const code = newCode();
  if (!code) return null;
  const room = {
    code,
    game: new Game(opts),
    seats: { a: null, b: null },
    names: { a: 'Oyuncu 1', b: 'Oyuncu 2' },
    ready: { a: false, b: false },
    halfSince: 0,
    emptySince: Date.now(),
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

/* The lobby is the only place the match rules can change. */
function readOpts(m) {
  return {
    target: Math.min(15, Math.max(1, parseInt(m.target, 10) || 7)),
    mode: m.mode === MODES.LUCKY ? MODES.LUCKY : MODES.CLASSIC,
    halftime: !!m.half,
  };
}

function occupancy(room) {
  return (room.seats.a ? 1 : 0) + (room.seats.b ? 1 : 0);
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (_) { /* socket died mid-write */ }
  }
}

function broadcast(room, obj) {
  send(room.seats.a, obj);
  send(room.seats.b, obj);
}

function roomInfo(room) {
  return {
    t: 'room',
    code: room.code,
    target: room.game.target,
    pad: room.game.padR,
    mode: room.game.mode,
    half: room.game.halfAt,
    names: room.names,
    a: !!room.seats.a,
    b: !!room.seats.b,
  };
}

/* Who has tapped "ready" during the break. */
function halfInfo(room) {
  return { t: 'hr', a: room.ready.a, b: room.ready.b };
}

function beginHalftime(room) {
  room.ready.a = false;
  room.ready.b = false;
  room.halfSince = Date.now();
  broadcast(room, halfInfo(room));
}

function endHalftime(room) {
  room.ready.a = false;
  room.ready.b = false;
  room.halfSince = 0;
  room.game.resumeHalftime();
  broadcast(room, halfInfo(room));
}

function leaveRoom(ws) {
  const room = ws.room;
  if (!room) return;
  if (room.seats[ws.side] === ws) {
    room.seats[ws.side] = null;
    if (room.game.state === ST.PLAYING || room.game.state === ST.COUNTDOWN ||
        room.game.state === ST.HALFTIME) {
      // A break nobody can walk out of would strand the player who stayed.
      room.ready.a = false;
      room.ready.b = false;
      room.halfSince = 0;
      room.game.pause();
    }
    if (occupancy(room) === 0) room.emptySince = Date.now();
    broadcast(room, roomInfo(room));
    broadcast(room, { t: 'peer', on: false });
  }
  ws.room = null;
  ws.side = null;
}

/* ---------------- static site ---------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);

  if (p === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size, up: Math.floor(process.uptime()) }));
  }

  if (p === '/') p = '/index.html';
  const file = path.join(WEB_DIR, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(WEB_DIR)) {
    res.writeHead(403);
    return res.end('forbidden');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Bulunamadi');
    }
    // The page, its script and its stylesheet must never outlive a deploy -
    // a stale app.js against a fresh engine.js is a very confusing bug.
    const ext = path.extname(file);
    const versioned = ext === '.html' || ext === '.js' || ext === '.css' || ext === '.webmanifest';
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': versioned ? 'no-cache' : 'public, max-age=86400',
    });
    res.end(data);
  });
});

/* ---------------- websocket ---------------- */

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  ws.room = null;
  ws.side = null;
  ws.alive = true;
  ws.msgCount = 0;
  ws.msgWindow = Date.now();

  send(ws, { t: 'hello', v: 1, field: CONST });

  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', (raw) => {
    // Cheap flood guard
    const now = Date.now();
    if (now - ws.msgWindow > 1000) { ws.msgWindow = now; ws.msgCount = 0; }
    if (++ws.msgCount > MAX_MSG_PER_SEC) return;

    let m;
    try { m = JSON.parse(raw); } catch (_) { return; }
    if (!m || typeof m.t !== 'string') return;

    switch (m.t) {
      case 'p':
        send(ws, { t: 'q', c: m.c });
        break;

      case 'create': {
        leaveRoom(ws);
        // Mallet size is no longer a preference: every room is played with the
        // engine's one size, whatever an older client may still be asking for.
        const room = createRoom(readOpts(m));
        if (!room) return send(ws, { t: 'err', k: 'create', m: 'Oda olusturulamadi, tekrar dene.' });
        room.seats.a = ws;
        if (typeof m.name === 'string' && m.name.trim()) {
          room.names.a = m.name.trim().slice(0, 14);
        }
        ws.room = room;
        ws.side = 'a';
        send(ws, { t: 'joined', code: room.code, side: 'a', target: room.game.target,
                   pad: room.game.padR, mode: room.game.mode, half: room.game.halfAt });
        broadcast(room, roomInfo(room));
        break;
      }

      case 'join': {
        const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
        const room = rooms.get(code);
        if (!room) return send(ws, { t: 'err', k: 'notFound', m: 'Bu kodla bir oda bulunamadi.' });

        let side = null;
        if (!room.seats.b) side = 'b';
        else if (!room.seats.a) side = 'a';
        if (!side) return send(ws, { t: 'err', k: 'full', m: 'Bu oda dolu.' });

        leaveRoom(ws);
        room.seats[side] = ws;
        if (typeof m.name === 'string' && m.name.trim()) {
          room.names[side] = m.name.trim().slice(0, 14);
        }
        ws.room = room;
        ws.side = side;
        send(ws, { t: 'joined', code: room.code, side, target: room.game.target,
                   pad: room.game.padR, mode: room.game.mode, half: room.game.halfAt });
        broadcast(room, roomInfo(room));
        broadcast(room, { t: 'peer', on: true });
        if (room.game.state === ST.HALFTIME) send(ws, halfInfo(room));

        if (occupancy(room) === 2) {
          if (room.game.state === ST.PAUSED) room.game.resume();
          else if (room.game.state === ST.LOBBY) room.game.startCountdown();
        }
        break;
      }

      case 'target': {
        // Only the host may change the winning score, and only before kickoff.
        const room = ws.room;
        if (!room || ws.side !== 'a') return;
        if (room.game.state !== ST.LOBBY && room.game.state !== ST.OVER) return;
        room.game.setTarget(m.v);
        broadcast(room, roomInfo(room));
        break;
      }

      case 'opts': {
        // Mode and the half-time break, likewise host-only and pre-kickoff.
        const room = ws.room;
        if (!room || ws.side !== 'a') return;
        if (room.game.state !== ST.LOBBY && room.game.state !== ST.OVER) return;
        const o = readOpts({ target: room.game.target, mode: m.mode, half: m.half });
        room.game.setMode(o.mode);
        room.game.setHalftime(o.halftime);
        broadcast(room, roomInfo(room));
        break;
      }

      case 'ready': {
        // Half-time break: the second half starts once both players tap.
        const room = ws.room;
        if (!room || room.game.state !== ST.HALFTIME) return;
        room.ready[ws.side] = true;
        broadcast(room, halfInfo(room));
        if (room.ready.a && room.ready.b) endHalftime(room);
        break;
      }

      case 'i': {
        const room = ws.room;
        if (!room) return;
        const x = +m.x, y = +m.y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        room.game.applyInput(ws.side, x, y);
        break;
      }

      case 'restart': {
        const room = ws.room;
        if (!room) return;
        if (occupancy(room) < 2) return;
        room.ready.a = false;
        room.ready.b = false;
        room.halfSince = 0;
        room.game.restart();
        break;
      }

      case 'leave':
        leaveRoom(ws);
        break;
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

/* Drop half-open sockets (mobile clients that vanish without a FIN). */
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.alive) return ws.terminate();
    ws.alive = false;
    try { ws.ping(); } catch (_) { /* already gone */ }
  });
}, 15_000);

/* ---------------- simulation loop ---------------- */

let lastTick = Date.now();
let sendAccum = 0;
let simAccum = 0;
const SEND_INTERVAL = 1000 / SEND_HZ;
const FIXED_DT = 1 / TICK_HZ;
/* A shared-CPU host can stall the timer for a while. Feeding the whole gap to
   the physics as one enormous step is how a puck ends up on the far side of a
   mallet, so the backlog is replayed as fixed 1/60 steps instead, and anything
   past a quarter second is written off rather than fast-forwarded. */
const MAX_CATCHUP = 15;

setInterval(() => {
  const now = Date.now();
  let dt = (now - lastTick) / 1000;
  lastTick = now;
  if (dt > 0.25) dt = 0.25; // never let a stalled loop teleport the puck

  sendAccum += dt * 1000;
  let doSend = false;
  if (sendAccum >= SEND_INTERVAL - 1.5) {
    doSend = true;
    // Carry the remainder instead of dropping it, or we silently lose frames.
    sendAccum = Math.min(sendAccum - SEND_INTERVAL, SEND_INTERVAL);
    if (sendAccum < 0) sendAccum = 0;
  }

  simAccum += dt;
  let steps = Math.floor(simAccum / FIXED_DT);
  if (steps > MAX_CATCHUP) steps = MAX_CATCHUP;
  simAccum -= steps * FIXED_DT;
  if (simAccum > FIXED_DT) simAccum = FIXED_DT;

  for (const room of rooms.values()) {
    const g = room.game;
    const before = g.state;
    for (let i = 0; i < steps; i++) {
      if (g.state !== ST.PLAYING && g.state !== ST.COUNTDOWN) break;
      g.step(FIXED_DT);
    }
    if (g.state === ST.HALFTIME && before !== ST.HALFTIME) beginHalftime(room);
    else if (g.state === ST.HALFTIME && room.halfSince &&
             now - room.halfSince > HALFTIME_AUTO_MS) endHalftime(room);
    if (!doSend) continue;                 // events keep piling up until the next send
    if (room.seats.a) send(room.seats.a, g.snapshot('a'));
    if (room.seats.b) send(room.seats.b, g.snapshot('b'));
    g.clearEvents();
  }
}, 1000 / TICK_HZ);

/* ---------------- housekeeping ---------------- */

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (occupancy(room) === 0 && now - room.emptySince > ROOM_TTL_MS) {
      rooms.delete(code);
    } else if (room.game.state === ST.LOBBY && now - room.createdAt > LOBBY_TTL_MS) {
      broadcast(room, { t: 'err', k: 'timeout', m: 'Oda zaman asimina ugradi.' });
      rooms.delete(code);
    }
  }
}, 20_000);

httpServer.listen(PORT, () => {
  console.log(`Air Hockey sunucusu calisiyor -> http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
});
