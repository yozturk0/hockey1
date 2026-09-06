/* Live integration test: boots nothing, assumes `npm start` is already running.
   Verifies seating, mirroring, the countdown freeze, room rules, lucky-mode
   twists, the half-time break, pause/rejoin, room-full rejection and restart. */
const WebSocket = require('ws');
const URL = process.env.AH_URL || 'ws://localhost:8080/ws';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? (pass++, console.log('  PASS', n)) : (fail++, console.log('  FAIL', n, x)); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

function client(tag) {
  const ws = new WebSocket(URL);
  const c = { ws, tag, snaps: 0, last: null, side: null, code: null, err: null,
              peer: null, joined: null, room: null, hr: null, fx: [] };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 's') {
      c.snaps++; c.last = m;
      for (const e of m.e) if (e[0] === 3) c.fx.push(e);
    }
    else if (m.t === 'joined') { c.side = m.side; c.code = m.code; c.joined = m; }
    else if (m.t === 'room') { c.room = m; }
    else if (m.t === 'hr') { c.hr = m; }
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

  A.send({ t: 'create', target: 3, mode: 'sansli', half: true, name: 'Ali' });
  await wait(350);
  ok('host is seated as side a', A.side === 'a', A.side);
  ok('room code is 4 characters', /^[A-Z0-9]{4}$/.test(A.code || ''), A.code);
  ok('the room keeps the mode it was made with', A.joined.mode === 'sansli', A.joined.mode);
  ok('and the half-time break', A.joined.half === 2, A.joined.half);

  A.send({ t: 'opts', mode: 'klasik', half: false });
  await wait(200);
  ok('the host can change the rules', A.room.mode === 'klasik' && A.room.half === 0,
     `${A.room.mode}/${A.room.half}`);
  A.send({ t: 'opts', mode: 'sansli', half: true });
  await wait(200);

  B.send({ t: 'join', code: A.code, name: 'Burak' });
  await wait(500);
  ok('guest is seated as side b', B.side === 'b', B.side);
  /* Only the player who was already sitting there is told. Sending it to the
     arrival as well is what used to pop "your friend joined" up in front of
     someone reconnecting to their own empty lobby. */
  ok('the waiting player is told the peer arrived', A.peer === true);
  ok('the arrival is not told about themselves', B.peer === null);
  ok('the guest is told the rules', B.joined.mode === 'sansli', B.joined.mode);

  B.send({ t: 'opts', mode: 'klasik', half: false });
  await wait(250);
  ok('the guest cannot change them', A.room.mode === 'sansli', A.room.mode);

  // Kickoff is a countdown, and nothing moves during it however hard we push.
  ok('a full room kicks off with a countdown', A.last.st === 1, A.last.st);
  const home = A.last.m.slice();
  const shove = setInterval(() => { A.send({ t: 'i', x: 94, y: 110 }); }, 16);
  await wait(1200);
  ok('mallets are frozen during the countdown',
     Math.abs(A.last.m[0] - home[0]) < 0.01 && Math.abs(A.last.m[1] - home[1]) < 0.01,
     `${A.last.m} vs ${home}`);
  await wait(1800);
  clearInterval(shove);
  ok('the puck goes live after ~2.5 s', A.last.st === 2, A.last.st);
  ok('every frame carries both mallet radii', A.last.rm > 0 && A.last.ro > 0,
     `${A.last.rm}/${A.last.ro}`);

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

  ok('lucky twists reach both clients',
     A.fx.length > 0 && A.fx.length === B.fx.length, `${A.fx.length}/${B.fx.length}`);

  const rate = A.snaps / ((Date.now() - t0) / 1000);
  ok('snapshot rate is at least 55/s', rate > 55, rate.toFixed(1));
  ok('ping round-trip answered', typeof A.rtt === 'number', A.rtt);

  const sa = A.last, sb = B.last;
  ok('puck mirrors between the two views',
     Math.abs(sa.p[0] + sb.p[0] - 100) < 3 && Math.abs(sa.p[1] + sb.p[1] - 200) < 6,
     `${sa.p} / ${sb.p}`);
  ok('scores mirror', sa.sm === sb.so && sa.so === sb.sm);
  ok('each player is in their own half', sa.m[1] > 100 && sb.m[1] > 100);

  // Half time: target 3 means the break lands on the second goal, so both
  // sides now play for real. Each winds back to its own goal, then drives
  // through the puck - a mallet parked *on* the puck just pins it against a
  // board, and two of them deadlock on the centre line.
  let beat = 0;
  const play = setInterval(() => {
    beat++;
    const swinging = (beat % 24) < 12;
    for (const c of [A, B]) {
      if (!c.last) continue;
      const [px, py] = c.last.p;
      if (swinging && py > 104) c.send({ t: 'i', x: px, y: py });
      else c.send({ t: 'i', x: 50, y: 190 });
    }
  }, 25);
  const halfDeadline = Date.now() + 90000;
  while (Date.now() < halfDeadline && A.last.st !== 5) await wait(120);
  clearInterval(play);
  ok('the break happens online too', A.last.st === 5,
     `st=${A.last.st} score=${A.last.sm}-${A.last.so}`);

  if (A.last.st === 5) {
    A.send({ t: 'ready' });
    await wait(350);
    ok('one player ready is not enough',
       A.last.st === 5 && A.hr.a === true && A.hr.b === false, JSON.stringify(A.hr));
    B.send({ t: 'ready' });
    await wait(450);
    ok('both ready starts the second half', A.last.st === 1, A.last.st);
  }

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
