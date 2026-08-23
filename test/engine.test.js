const { Game, ST, CONST } = require('../web/engine.js');
const { W, H, GX0, GX1, PUCK_R, PAD_R } = CONST;
let pass = 0, fail = 0;
const ok = (name, cond, extra='') => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name, extra)); };

console.log('goal detection');
{
  const g = new Game(3); g.state = ST.PLAYING;
  g.puck.x = W/2; g.puck.y = 6; g.puck.vx = 0; g.puck.vy = -120;
  g.padA.x = 5; g.padA.y = 190; g.padB.x = 5; g.padB.y = 10;
  for (let i = 0; i < 30 && g.scoreA === 0; i++) g.step(1/60);
  ok('puck through the top mouth scores for A', g.scoreA === 1, `scoreA=${g.scoreA}`);
  ok('goal event emitted', g.events.some(e => e[0] === 2));
}
{
  const g = new Game(3); g.state = ST.PLAYING;
  g.puck.x = W/2; g.puck.y = H-6; g.puck.vy = 120;
  g.padA.x = 5; g.padA.y = 190; g.padB.x = 5; g.padB.y = 10;
  for (let i = 0; i < 30 && g.scoreB === 0; i++) g.step(1/60);
  ok('puck through the bottom mouth scores for B', g.scoreB === 1, `scoreB=${g.scoreB}`);
}

console.log('walls and posts');
{
  const g = new Game(3); g.state = ST.PLAYING;
  g.puck.x = GX0 - 6; g.puck.y = 5; g.puck.vy = -140; g.puck.vx = 0;
  g.padA.x = 5; g.padA.y = 190; g.padB.x = 5; g.padB.y = 10;
  g.step(1/60);
  ok('puck outside the mouth bounces, no goal', g.scoreA === 0 && g.puck.vy > 0, `vy=${g.puck.vy}`);
}
{
  const g = new Game(3); g.state = ST.PLAYING;
  g.puck.x = 1; g.puck.vx = -150; g.puck.y = 100;
  g.padA.x = 5; g.padA.y = 190; g.padB.x = 5; g.padB.y = 10;
  g.step(1/60);
  ok('side wall reflects', g.puck.vx > 0 && g.puck.x >= PUCK_R - 0.01, `vx=${g.puck.vx} x=${g.puck.x}`);
}

console.log('paddle physics');
{
  const g = new Game(3); g.state = ST.PLAYING;
  g.puck.x = 50; g.puck.y = 150; g.puck.vx = 0; g.puck.vy = 0;
  g.padA.x = 50; g.padA.y = 150 + PUCK_R + PAD_R - 1; g.padA.vx = 0; g.padA.vy = -250;
  g.padB.x = 5; g.padB.y = 10;
  g.collidePaddle(g.puck, g.padA);
  ok('a moving paddle launches a dead puck', g.puck.vy < -30, `vy=${g.puck.vy}`);
  ok('hit event carries speed', g.events.some(e => e[0] === 0 && e[3] > 30));
}
{
  const g = new Game(3); g.state = ST.PLAYING;
  const before = { x: 50, y: 150 };
  g.puck.x = before.x; g.puck.y = before.y; g.puck.vx = 200; g.puck.vy = 200;
  g.padA.x = 5; g.padA.y = 190; g.padB.x = 5; g.padB.y = 10;
  for (let i = 0; i < 600; i++) { g.step(1/60); if (g.state === ST.COUNTDOWN) break; }
  const sp = Math.hypot(g.puck.vx, g.puck.vy);
  ok('puck speed stays clamped', sp <= 191, `speed=${sp}`);
}

console.log('paddle containment');
{
  const g = new Game(3); g.state = ST.PLAYING;
  g.applyInput('a', 50, 10);      // A tries to invade the top half
  g.applyInput('b', 50, 190);     // B tries to invade the bottom half
  for (let i = 0; i < 120; i++) g.step(1/60);
  ok('A cannot cross to the top half', g.padA.y >= H/2 + PAD_R - 0.01, `y=${g.padA.y}`);
  ok('B cannot cross to the bottom half', g.padB.y <= H/2 - PAD_R + 0.01, `y=${g.padB.y}`);
}

console.log('match end');
{
  const g = new Game(2); g.state = ST.PLAYING;
  g.padA.x = 5; g.padA.y = 190; g.padB.x = 5; g.padB.y = 10;
  for (let n = 0; n < 2; n++) {
    g.state = ST.PLAYING;
    g.puck.x = W/2; g.puck.y = 6; g.puck.vx = 0; g.puck.vy = -120;
    const before = g.scoreA;
    for (let i = 0; i < 30 && g.scoreA === before; i++) g.step(1/60);
  }
  ok('reaching the target ends the match', g.state === ST.OVER, `state=${g.state}`);
  ok('winner recorded', g.winner === 'a', `winner=${g.winner}`);
  ok('puck frozen at centre', g.puck.vx === 0 && g.puck.vy === 0);
}

console.log('face-off possession');
{
  for (const [scorer, expect] of [['a', -1], ['b', 1]]) {
    const g = new Game(9); g.state = ST.PLAYING;
    g.score(scorer);
    ok(`${scorer} scores -> puck goes to the conceder`,
       Math.sign(g.puck.vy) === expect, `vy=${g.puck.vy}`);
  }
}

console.log('anti-stall');
{
  const g = new Game(3); g.state = ST.PLAYING;
  g.puck.x = 8; g.puck.y = 100; g.puck.vx = 0.2; g.puck.vy = 0.2;
  g.padA.x = 50; g.padA.y = 190; g.padB.x = 50; g.padB.y = 10;
  for (let i = 0; i < 60 * 6; i++) g.step(1/60);
  ok('a parked puck gets nudged back into play',
     Math.hypot(g.puck.vx, g.puck.vy) > 5, `speed=${Math.hypot(g.puck.vx,g.puck.vy)}`);
}

console.log('mirroring');
{
  const g = new Game(5); g.state = ST.PLAYING;
  g.puck.x = 30; g.puck.y = 60; g.puck.vx = 12; g.puck.vy = -40;
  g.scoreA = 2; g.scoreB = 1;
  const a = g.snapshot('a'), b = g.snapshot('b');
  ok('puck mirrors exactly', Math.abs(a.p[0]+b.p[0]-W) < 1e-6 && Math.abs(a.p[1]+b.p[1]-H) < 1e-6);
  ok('velocity mirrors', a.p[2] === -b.p[2] && a.p[3] === -b.p[3]);
  ok('scores swap', a.sm === b.so && a.so === b.sm);
  ok('each player sees themselves at the bottom', a.m[1] > H/2 && b.m[1] > H/2, `${a.m[1]} ${b.m[1]}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
