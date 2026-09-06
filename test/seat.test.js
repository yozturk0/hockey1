/* Reconnecting to your own lobby must give you your seat back, and must not
   announce a friend who is not there. */
const WebSocket = require('ws');
/* Live integration test, same shape as server.test.js: assumes the server is
   already running. */
const URL = process.env.AH_URL || 'ws://localhost:8080/ws';
const base = URL + (URL.indexOf('?') === -1 ? '?' : '&') + 'pid=';

let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS', m)) : (fail++, console.log('  FAIL', m)); };

function open(pid) {
  const ws = new WebSocket(base + pid);
  ws.log = [];
  ws.on('message', (r) => ws.log.push(JSON.parse(r)));
  return new Promise((res) => ws.on('open', () => res(ws)));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const last = (ws, t) => [...ws.log].reverse().find((m) => m.t === t);

(async () => {
  const host = await open('hostpid123456');
  host.send(JSON.stringify({ t: 'create', target: 5, mode: 'klasik', half: true, name: 'Host' }));
  await wait(200);
  const j1 = last(host, 'joined');
  ok(j1 && j1.side === 'a', 'maker of the room sits in seat a');
  const code = j1.code;
  ok(!host.log.some((m) => m.t === 'peer'), 'making a room announces no opponent');

  // the refresh button: same install, brand new socket
  host.close();
  await wait(150);
  const again = await open('hostpid123456');
  again.send(JSON.stringify({ t: 'join', code, name: 'Host' }));
  await wait(250);
  const j2 = last(again, 'joined');
  ok(j2 && j2.side === 'a', 'reconnecting host gets seat a back, not b');
  ok(!again.log.some((m) => m.t === 'peer' && m.on), 'reconnecting announces no phantom friend');
  const r2 = last(again, 'room');
  ok(r2 && r2.a === true && r2.b === false, 'the room still shows one empty seat');

  // a real friend
  const guest = await open('guestpid123456');
  guest.send(JSON.stringify({ t: 'join', code, name: 'Guest' }));
  await wait(250);
  ok(last(guest, 'joined').side === 'b', 'the friend gets seat b');
  ok(!guest.log.some((m) => m.t === 'peer' && m.on), 'the arrival is not told about themselves');
  ok(again.log.some((m) => m.t === 'peer' && m.on), 'the host IS told the friend arrived');

  // the guest refreshes mid-match
  guest.close();
  await wait(150);
  const guest2 = await open('guestpid123456');
  guest2.send(JSON.stringify({ t: 'join', code, name: 'Guest' }));
  await wait(250);
  ok(last(guest2, 'joined').side === 'b', 'reconnecting guest stays the guest');

  again.close(); guest2.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
