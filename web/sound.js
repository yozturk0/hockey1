/* Tiny WebAudio synth — no asset files, no loading, works offline.
   Every puck interaction gets a pitched "thock" whose brightness and
   punch scale with how hard the puck was hit. */
(function (root) {
  'use strict';

  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let enabled = true;

  function build() {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // 0.3s of white noise, reused for every transient
    const n = Math.floor(ctx.sampleRate * 0.3);
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  /* iOS will not start an AudioContext outside a user gesture. */
  function unlock() {
    if (!ctx && !build()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  const now = () => ctx.currentTime;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  function tone(opts) {
    if (!ctx || !enabled) return;
    const t0 = now() + (opts.delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(opts.f0, t0);
    if (opts.f1 && opts.f1 !== opts.f0) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.f1), t0 + opts.dur);
    }
    const peak = Math.max(0.0001, opts.gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);

    let node = o;
    if (opts.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.cutoff;
      o.connect(f); node = f;
    }
    node.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + opts.dur + 0.03);
  }

  function noise(opts) {
    if (!ctx || !enabled) return;
    const t0 = now() + (opts.delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opts.filter || 'bandpass';
    f.frequency.value = opts.freq;
    f.Q.value = opts.q || 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0001, opts.gain), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0);
    s.stop(t0 + opts.dur + 0.02);
  }

  function buzz(ms) {
    if (root.navigator && navigator.vibrate) { try { navigator.vibrate(ms); } catch (_) {} }
  }

  /* A puck squeezed between a mallet and a wall - or head-butted at a shallow
     angle - can legitimately register several contacts in a few hundredths of a
     second. Physically that is right, but four clacks stacked on top of one
     another just sound broken, so a burst is heard as the single hit it is. */
  const HIT_GAP = 0.09;
  let lastHit = -1, lastWall = -1;

  const S = {
    unlock,
    get on() { return enabled; },
    set on(v) { enabled = !!v; },

    /* Puck meets paddle. speed is in field units/sec (0..PUCK_MAX). */
    hit(speed) {
      if (!ctx) return;
      if (now() - lastHit < HIT_GAP) return;
      lastHit = now();
      const t = clamp01((speed || 60) / 178);
      const base = 300 + t * 480;
      tone({ type: 'triangle', f0: base * 1.9, f1: base * 0.72, dur: 0.085 + t * 0.05, gain: 0.20 + t * 0.20 });
      tone({ type: 'sine', f0: base * 0.55, f1: base * 0.3, dur: 0.12, gain: 0.13 + t * 0.12, cutoff: 1400 });
      noise({ freq: 1700 + t * 2600, q: 0.9, dur: 0.035, gain: 0.10 + t * 0.14 });
      buzz(t > 0.55 ? 22 : 11);
    },

    /* Puck meets a wall or a goalpost — duller, quieter. */
    wall(speed) {
      if (!ctx) return;
      const t = clamp01((speed || 40) / 178);
      if (t < 0.06) return;
      if (now() - lastWall < HIT_GAP) return;
      lastWall = now();
      tone({ type: 'sine', f0: 190 + t * 150, f1: 90, dur: 0.075, gain: 0.09 + t * 0.11, cutoff: 900 });
      noise({ freq: 700 + t * 800, q: 1.6, dur: 0.03, gain: 0.045 + t * 0.07 });
    },

    goal(mine) {
      buzz(mine ? [18, 50, 90] : 40);
      const seq = mine ? [523.25, 659.25, 783.99, 1046.5] : [440, 349.23, 293.66];
      seq.forEach((f, i) => {
        tone({ type: 'triangle', f0: f, f1: f, dur: 0.19, gain: 0.24, delay: i * 0.075 });
        tone({ type: 'sine', f0: f / 2, f1: f / 2, dur: 0.24, gain: 0.11, delay: i * 0.075 });
      });
      noise({ freq: 2600, q: 0.6, dur: 0.16, gain: 0.09 });
    },

    /* Half-time whistle — two short blasts, unmistakably "stop and turn". */
    half() {
      buzz([40, 90, 40, 90, 160]);
      [0, 0.24].forEach((d) => {
        tone({ type: 'square', f0: 1180, f1: 1240, dur: 0.2, gain: 0.11, cutoff: 3000, delay: d });
        tone({ type: 'sine', f0: 1760, f1: 1820, dur: 0.2, gain: 0.07, delay: d });
      });
    },

    count(n) {
      const f = n <= 1 ? 900 : 560;
      tone({ type: 'square', f0: f, f1: f, dur: n <= 1 ? 0.2 : 0.1, gain: 0.14, cutoff: 2400 });
    },

    over(win) {
      const seq = win ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [392, 349.23, 311.13, 261.63];
      seq.forEach((f, i) => {
        tone({ type: 'triangle', f0: f, f1: f, dur: 0.34, gain: 0.2, delay: i * 0.13 });
      });
      buzz(win ? [30, 60, 30, 60, 120] : 200);
    },

    ui() {
      tone({ type: 'sine', f0: 660, f1: 880, dur: 0.055, gain: 0.10 });
      buzz(8);
    },

    join() {
      [587.33, 880].forEach((f, i) =>
        tone({ type: 'triangle', f0: f, f1: f, dur: 0.16, gain: 0.17, delay: i * 0.09 }));
      buzz([16, 40, 16]);
    },
  };

  root.Snd = S;
}(window));
