#!/usr/bin/env node
/* Air Hockey — portal build.

   One source tree, three outputs. `web/` stays the thing you edit and the thing
   the plain website serves; this script reads it and writes a self-contained
   folder per target:

     portal/build/web/          no portal, minified — the plain site
     portal/build/poki/         Poki SDK
     portal/build/crazygames/   CrazyGames SDK
     portal/build/itch/         no portal — plus itch-air-hockey.zip to upload

   Poki and CrazyGames each refuse a build carrying the other's SDK, which is
   the whole reason this file exists rather than a single "production" folder.

   Every build except the plain site is served from a domain that is not the
   game server, so online mode needs to be told where the server lives:

     AH_WS=wss://your-app.onrender.com/ws node portal/build.js

   Without it those builds fall back to a same-origin socket, which on a portal
   or on itch.io means no online play. Solo and same-phone modes never need it.

   Usage:  node portal/build.js [target ...]      (default: all)
*/
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { minify } = require('terser');
const CleanCSS = require('clean-css');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'web');
const OUT = path.join(__dirname, 'build');

/* Load order matters: every file below hangs itself off `window`, and each one
   expects the ones above it to have run. sdk.js is first so the portal bridge
   exists before anything can report loading progress. */
const SCRIPTS = ['sdk.js', 'engine.js', 'view.js', 'bot.js', 'sound.js', 'i18n.js', 'app.js'];

const TARGETS = {
  web: {
    portal: 'none',
    sdk: null,
    /* Only the plain site is installable to a home screen; inside a portal
       frame a manifest and its icons are bytes nobody will ever use. */
    pwa: true,
  },
  poki: {
    portal: 'poki',
    sdk: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
    pwa: false,
  },
  crazygames: {
    portal: 'crazygames',
    sdk: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
    pwa: false,
  },
  /* itch.io serves the game from a sandboxed iframe on its own zone domain, so
     no portal SDK and no manifest — but it does want the whole thing as one
     zip with index.html at the root. */
  itch: {
    portal: 'none',
    sdk: null,
    pwa: false,
    zip: 'itch-air-hockey.zip',
  },
};

/* The absolute WebSocket URL of the game server, for the builds that are not
   served by it. Empty means "same origin", which is only correct for `web`. */
const WS = process.env.AH_WS || '';

const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

/* What the file actually costs a player, which is the compressed size — every
   host worth deploying to serves it that way. */
function weigh(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return {
    raw: b.length,
    gzip: zlib.gzipSync(b, { level: 9 }).length,
    br: zlib.brotliCompressSync(b).length,
  };
}

/* --------------------------------- html --------------------------------- */

/* Deliberately timid. Collapsing the whitespace *between* tags would save a
   little more and silently eat the spaces that separate inline elements, so
   this only drops comments and indentation and leaves every newline alone. */
function trimHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s+/, ''))
    .filter((l) => l.length)
    .join('\n');
}

function buildHtml(cfg) {
  let html = read('index.html');

  // Every script becomes the one bundle.
  for (const f of SCRIPTS) {
    html = html.replace(new RegExp('<script src="' + f + '"></script>\\n?', 'g'), '');
  }
  let head = '';
  if (cfg.sdk) head += '<script src="' + cfg.sdk + '"></script>\n';
  head += '<script>window.AH_PORTAL="' + cfg.portal + '";' +
          (cfg.pwa || !WS ? '' : 'window.AH_WS="' + WS + '";') + '</script>\n';
  html = html.replace('</body>', head + '<script src="game.js"></script>\n</body>');

  if (!cfg.pwa) {
    html = html
      .replace(/<link rel="manifest"[^>]*>\n?/g, '')
      .replace(/<link rel="apple-touch-icon"[^>]*>\n?/g, '')
      .replace(/<meta name="(mobile-web-app-capable|apple-mobile-web-app-[a-z-]+)"[^>]*>\n?/g, '');
  }
  return trimHtml(html);
}

/* --------------------------------- js ----------------------------------- */

async function buildJs() {
  // Concatenated rather than bundled: these files talk to each other through
  // `window`, so there is nothing for a module bundler to resolve, and a
  // bundler is a dependency this game has never needed.
  const src = {};
  for (const f of SCRIPTS) src[f] = read(f);

  const out = await minify(src, {
    compress: { passes: 2, drop_console: true, unsafe_arrows: true },
    // Each file is already sealed inside its own function, so the only names
    // left at the top level are the ones that must survive: window.AHEngine
    // and friends are property writes, which mangling never touches.
    mangle: { toplevel: true },
    format: { comments: false },
  });
  if (out.error) throw out.error;
  return out.code;
}

/* --------------------------------- run ---------------------------------- */

async function build(name) {
  const cfg = TARGETS[name];
  const dir = path.join(OUT, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const html = buildHtml(cfg);
  const js = await buildJs();
  const css = new CleanCSS({ level: 2 }).minify(read('style.css')).styles;

  fs.writeFileSync(path.join(dir, 'index.html'), html);
  fs.writeFileSync(path.join(dir, 'game.js'), js);
  fs.writeFileSync(path.join(dir, 'style.css'), css);

  const files = [['index.html', html], ['game.js', js], ['style.css', css]];
  if (cfg.pwa) {
    for (const f of ['manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-512.png']) {
      const buf = fs.readFileSync(path.join(SRC, f));
      fs.writeFileSync(path.join(dir, f), buf);
      files.push([f, buf]);
    }
  } else {
    // The favicon is one inline SVG and worth keeping; the PNGs are not.
    const svg = fs.readFileSync(path.join(SRC, 'icon.svg'));
    fs.writeFileSync(path.join(dir, 'icon.svg'), svg);
    files.push(['icon.svg', svg]);
  }

  if (cfg.zip) {
    // `zip` ships with macOS and every Linux image this would run on; -j keeps
    // index.html at the archive root, which is what itch.io requires.
    execFileSync('zip', ['-jq9', cfg.zip, ...files.map(([f]) => f)], { cwd: dir });
  }

  const total = files.reduce((a, [, c]) => {
    const w = weigh(c);
    return { raw: a.raw + w.raw, gzip: a.gzip + w.gzip, br: a.br + w.br };
  }, { raw: 0, gzip: 0, br: 0 });

  console.log('\n' + name + '  ->  portal/build/' + name);
  for (const [f, c] of files) {
    const w = weigh(c);
    console.log('   ' + f.padEnd(24) + kb(w.raw).padStart(9) +
                kb(w.gzip).padStart(10) + kb(w.br).padStart(10));
  }
  console.log('   ' + 'TOPLAM'.padEnd(24) + kb(total.raw).padStart(9) +
              kb(total.gzip).padStart(10) + kb(total.br).padStart(10));
  return total;
}

(async () => {
  const want = process.argv.slice(2).filter((a) => TARGETS[a]);
  const names = want.length ? want : Object.keys(TARGETS);
  console.log('  ' + 'dosya'.padEnd(26) + 'ham'.padStart(7) +
              'gzip'.padStart(10) + 'brotli'.padStart(10));
  for (const n of names) await build(n);
  console.log('\nBitti. Portala yuklenecek olan gzip/brotli sutunu.');
  console.log(WS ? 'Online sunucu: ' + WS
                 : 'AH_WS verilmedi — portal/itch build\'lerinde online mod kapali.');
  console.log('');
})().catch((e) => { console.error(e); process.exit(1); });
