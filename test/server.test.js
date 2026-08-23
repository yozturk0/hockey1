/* Live integration test: boots nothing, assumes `npm start` is already running.
   Verifies seating, mirroring, pause/rejoin, room-full rejection and restart. */
const WebSocket = require('ws');
const URL = process.env.AH_URL || 'ws://localhost:8080/ws';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  PASS', n)) : (fail++, console.log('  FAIL', n, x)); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function client(tag) {
  const ws = new WebSocket(URL);
  const c = { ws, tag, snaps: 0, last: null, side: null, code: null, err: null, peer: null };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 's') { c.snaps++; c.last = m; }
    else if (m.t === 'joined') { c.side = m.side; c.code = m.code; }
    else if (m.t === 'err') { c.err = m.m; }
    else if (m.t === 'peer') { c.peer = m.on; }
    else if (m.t === 'q') { c.rtt = Date.now() - m.c; }
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  c.open = new Promise(r => ws.on('open', r));
  return c;
}

(async () => {
  const A = client('A'), B = client('B');
  await Promise.all([A.open, B.open]);

  A.send({ t: 'create', target: 3, name: 'Ali' });
  await wait(350);
  ok('host is seated as side a', A.side === 'a', A.side);
  ok('room code is 4 characters', /^[A-Z0-9]{4}$/.test(A.code || ''), A.code);

  B.send({ t: 'join', code: A.code, name: 'Burak' });
  await wait(500);
  ok('guest is seated as side b', B.side === 'b', B.side);
  ok('both sides told the peer arrived', A.peer === true && B.peer === true);

  A.send({ t: 'p', c: Date.now() });
  const t0 = Date.now();
  const drive = setInterval(() => {
    for (const c of [A, B]) {
      if (!c.last) continue;
      const [px, py] = c.last.p;
      c.send({ t: 'i', x: Math.min(94.4, Math.max(5.6, px)),
                       y: Math.min(194.4, Math.max(105.6, py < 100 ? 150 : py + 8)) });
    }
  }, 16);
  await wait(5000);
  clearInterval(drive);

  const rate = A.snaps / ((Date.now() - t0) / 1000);
  ok('snapshot rate is at least 55/s', rate > 55, rate.toFixed(1));
  ok('ping round-trip answered', typeof A.rtt === 'number', A.rtt);

  const sa = A.last, sb = B.last;
  ok('puck mirrors between the two views',
     Math.abs(sa.p[0] + sb.p[0] - 100) < 3 && Math.abs(sa.p[1] + sb.p[1] - 200) < 6,
     `${sa.p} / ${sb.p}`);
  ok('scores mirror', sa.sm === sb.so && sa.so === sb.sm);
  ok('each player is in their own half', sa.m[1] > 100 && sb.m[1] > 100);

  B.ws.close();
  await wait(700);
  ok('losing a player pauses the match', A.last.st === 3, A.last.st);

  const B2 = client('B2');
  await B2.open;
  B2.send({ t: 'join', code: A.code, name: 'Burak' });
  await wait(900);
  ok('rejoining resumes the match', A.last.st === 1 || A.last.st === 2, A.last.st);

  const C = client('C');
  await C.open;
  C.send({ t: 'join', code: A.code });
  await wait(400);
  ok('a third player is turned away', /dolu/i.test(C.err || ''), C.err);

  C.send({ t: 'join', code: 'ZZZZ' });
  await wait(300);
  ok('an unknown code is rejected', /bulunamadi/i.test(C.err || ''), C.err);

  B2.send({ t: 'restart' });
  await wait(500);
  ok('either player can restart', A.last.sm === 0 && A.last.so === 0 && A.last.st === 1);

  [A, B2, C].forEach(c => c.ws.close());
  await wait(200);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
