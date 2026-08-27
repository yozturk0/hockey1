/* Air Hockey — game portal bridge.

   Poki and CrazyGames both want the same five facts from a game (loading
   started, loading finished, a match began, a match ended, now would be a good
   moment for an ad) but they spell them differently, and neither will accept a
   build carrying the other's SDK. So the game speaks to this file, and only
   this file knows which portal it is standing in.

   The target is chosen at build time by defining `window.AH_PORTAL` before this
   script runs. With no target — the plain website build — every call below is a
   no-op, which is also exactly what happens when a portal's own SDK is blocked
   by an ad blocker. Both portals require the game to stay fully playable in
   that case, so "the SDK is missing" is a normal state here, never an error.

   Two rules are enforced *here* rather than trusted to callers, because both
   are outright rejection reasons:

     1. No ad may ever be shown before the player has finished some gameplay.
     2. The game is muted and paused for the whole duration of an ad.
*/
(function (root) {
'use strict';

const TARGET = root.AH_PORTAL || 'none';

/* Filled in by the game (app.js) so the bridge can silence and freeze the
   rink around an ad without knowing anything about how either works. */
const hooks = { pause: null, resume: null, mute: null, unmute: null };

let ready = false;
let playing = false;      // gameplayStart has fired and not yet been stopped
let playedOnce = false;   // at least one match has actually been played
let adOpen = false;

const call = (fn) => { try { if (fn) fn(); } catch (_) {} };

/* Portal SDKs live on someone else's CDN and can fail, be blocked, or simply
   be slow. Nothing they do is allowed to take the game down with them. */
function guard(fn, fallback) {
  try { return fn(); } catch (_) { return fallback; }
}

function before() {
  adOpen = true;
  call(hooks.mute);
  call(hooks.pause);
}

function after() {
  adOpen = false;
  call(hooks.unmute);
  call(hooks.resume);
}

/* ------------------------- per-portal back ends ------------------------- */

const backends = {
  none: {
    init: () => Promise.resolve(),
    loadingStart() {}, loadingFinished() {},
    gameplayStart() {}, gameplayStop() {}, happyTime() {},
    commercial: () => Promise.resolve(),
    rewarded: () => Promise.resolve(false),
  },

  poki: {
    init() {
      const sdk = root.PokiSDK;
      if (!sdk) return Promise.reject(new Error('no PokiSDK'));
      // Poki resolves this even when things go wrong; the catch is for the
      // case where the call itself throws.
      return guard(() => sdk.init(), Promise.reject(new Error('init threw')));
    },
    loadingStart() {
      // Older SDK builds do not carry this one; it is optional either way.
      guard(() => root.PokiSDK.gameLoadingStart && root.PokiSDK.gameLoadingStart());
    },
    loadingFinished() { guard(() => root.PokiSDK.gameLoadingFinished()); },
    gameplayStart() { guard(() => root.PokiSDK.gameplayStart()); },
    gameplayStop() { guard(() => root.PokiSDK.gameplayStop()); },
    happyTime() { guard(() => root.PokiSDK.happyTime && root.PokiSDK.happyTime(1)); },
    commercial() {
      return guard(() => root.PokiSDK.commercialBreak(before).then(after, after),
                   Promise.resolve());
    },
    rewarded() {
      return guard(
        () => root.PokiSDK.rewardedBreak(before).then(
          (ok) => { after(); return !!ok; },
          () => { after(); return false; }),
        Promise.resolve(false));
    },
  },

  crazygames: {
    init() {
      const sdk = root.CrazyGames && root.CrazyGames.SDK;
      if (!sdk) return Promise.reject(new Error('no CrazyGames SDK'));
      return guard(() => Promise.resolve(sdk.init()),
                   Promise.reject(new Error('init threw')));
    },
    loadingStart() { guard(() => root.CrazyGames.SDK.game.loadingStart()); },
    loadingFinished() { guard(() => root.CrazyGames.SDK.game.loadingStop()); },
    gameplayStart() { guard(() => root.CrazyGames.SDK.game.gameplayStart()); },
    gameplayStop() { guard(() => root.CrazyGames.SDK.game.gameplayStop()); },
    happyTime() { guard(() => root.CrazyGames.SDK.game.happytime()); },
    /* CrazyGames reports ads through callbacks rather than a promise, so both
       kinds are wrapped back into one. `settled` matters: an SDK that calls
       both adError and adFinished must not unpause the rink twice. */
    ad(kind) {
      return new Promise((resolve) => {
        let settled = false;
        const done = (ok) => {
          if (settled) return;
          settled = true;
          after();
          resolve(ok);
        };
        const started = () => before();
        const ok = guard(() => {
          root.CrazyGames.SDK.ad.requestAd(kind, {
            adStarted: started,
            adFinished: () => done(true),
            adError: () => done(false),
          });
          return true;
        }, false);
        if (!ok) done(false);
        // An SDK that never calls back would freeze the game forever.
        setTimeout(() => done(false), 45000);
      });
    },
    commercial() { return this.ad('midgame').then(() => undefined); },
    rewarded() { return this.ad('rewarded'); },
  },
};

const be = backends[TARGET] || backends.none;

/* --------------------------- public surface --------------------------- */

/* Both portals cap how often a midgame ad may run, and both say to let their
   own system decide. This is only a floor under that, so a player who
   restarts three matches in a minute is not handed three breaks. */
const AD_GAP_MS = 90000;
let lastAd = 0;

const P = {
  get target() { return TARGET; },
  get ready() { return ready; },
  get adOpen() { return adOpen; },

  /* The game hands over the four things an ad needs to be able to do. */
  connect(h) {
    hooks.pause = h.pause; hooks.resume = h.resume;
    hooks.mute = h.mute; hooks.unmute = h.unmute;
  },

  /* Resolves either way — the game must start whether or not the portal
     answered. Never rejects, on purpose. */
  init() {
    return be.init().then(
      () => { ready = true; },
      () => { ready = false; });
  },

  loadingStart() { be.loadingStart(); },
  loadingFinished() { be.loadingFinished(); },

  gameplayStart() {
    if (playing) return;          // duplicate events are a review finding
    playing = true;
    be.gameplayStart();
  },

  gameplayStop() {
    if (!playing) return;
    playing = false;
    playedOnce = true;            // an ad becomes permissible from here on
    be.gameplayStop();
  },

  /* A win, a comeback, something worth the site celebrating with the player. */
  happyTime() { be.happyTime(); },

  /* Between matches. Resolves when the game may carry on — with or without an
     ad having played, and even if the whole thing failed. */
  commercialBreak() {
    if (!playedOnce || adOpen) return Promise.resolve();
    const now = Date.now();
    if (now - lastAd < AD_GAP_MS) return Promise.resolve();
    lastAd = now;
    return be.commercial().then(() => undefined, () => { after(); });
  },

  /* Only ever from an explicit "watch an ad for X" tap. Resolves true when the
     reward was earned. */
  rewardedBreak() {
    if (adOpen) return Promise.resolve(false);
    return be.rewarded().then((ok) => !!ok, () => { after(); return false; });
  },

  /* Poki requires external links to go through its own opener; CrazyGames and
     the plain build have no such rule. The game does not link out at all
     today — this exists so that if one is ever added, it is already legal. */
  openExternalLink(url) {
    if (TARGET === 'poki') {
      return guard(() => root.PokiSDK.openExternalLink(url));
    }
    return guard(() => root.open(url, '_blank', 'noopener'));
  },
};

root.AHPortal = P;
}(window));
