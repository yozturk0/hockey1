'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Game, ST, CONST } = require('../web/engine.js');

const PORT = process.env.PORT || 8080;
const WEB_DIR = path.join(__dirname, '..', 'web');
const TICK_HZ = 60;
const SEND_HZ = 60;
const ROOM_TTL_MS = 90_000;      // empty room survives this long so players can rejoin
const LOBBY_TTL_MS = 15 * 60_000;
const MAX_MSG_PER_SEC = 150;

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

function createRoom(target) {
  const code = newCode();
  if (!code) return null;
  const room = {
    code,
    game: new Game(target),
    seats: { a: null, b: null },
    names: { a: 'Oyuncu 1', b: 'Oyuncu 2' },
    emptySince: Date.now(),
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
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
    names: room.names,
    a: !!room.seats.a,
    b: !!room.seats.b,
  };
}

function leaveRoom(ws) {
  const room = ws.room;
  if (!room) return;
  if (room.seats[ws.side] === ws) {
    room.seats[ws.side] = null;
    if (room.game.state === ST.PLAYING || room.game.state === ST.COUNTDOWN) {
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
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
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
        const target = Math.min(15, Math.max(1, parseInt(m.target, 10) || 7));
        const room = createRoom(target);
        if (!room) return send(ws, { t: 'err', m: 'Oda olusturulamadi, tekrar dene.' });
        room.seats.a = ws;
        if (typeof m.name === 'string' && m.name.trim()) {
          room.names.a = m.name.trim().slice(0, 14);
        }
        ws.room = room;
        ws.side = 'a';
        send(ws, { t: 'joined', code: room.code, side: 'a', target: room.game.target });
        broadcast(room, roomInfo(room));
        break;
      }

      case 'join': {
        const code = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
        const room = rooms.get(code);
        if (!room) return send(ws, { t: 'err', m: 'Bu kodla bir oda bulunamadi.' });

        let side = null;
        if (!room.seats.b) side = 'b';
        else if (!room.seats.a) side = 'a';
        if (!side) return send(ws, { t: 'err', m: 'Bu oda dolu.' });

        leaveRoom(ws);
        room.seats[side] = ws;
        if (typeof m.name === 'string' && m.name.trim()) {
          room.names[side] = m.name.trim().slice(0, 14);
        }
        ws.room = room;
        ws.side = side;
        send(ws, { t: 'joined', code: room.code, side, target: room.game.target });
        broadcast(room, roomInfo(room));
        broadcast(room, { t: 'peer', on: true });

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
        room.game.target = Math.min(15, Math.max(1, parseInt(m.v, 10) || 7));
        broadcast(room, roomInfo(room));
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
const SEND_INTERVAL = 1000 / SEND_HZ;

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

  for (const room of rooms.values()) {
    const g = room.game;
    if (g.state === ST.PLAYING || g.state === ST.COUNTDOWN) g.step(dt);
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
      broadcast(room, { t: 'err', m: 'Oda zaman asimina ugradi.' });
      rooms.delete(code);
    }
  }
}, 20_000);

httpServer.listen(PORT, () => {
  console.log(`Air Hockey sunucusu calisiyor -> http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/ws`);
});
