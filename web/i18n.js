/* Air Hockey — language support.
   Turkish is the original text, kept word for word. English is written to be
   plain and easy: short sentences, everyday words, nothing fancy. */
(function () {
'use strict';

const LANGS = ['en', 'tr'];
const LANG_NAMES = { en: 'English', tr: 'Türkçe' };

const STR = {
  tr: {
    /* ---- app chrome ---- */
    'doc.title':        'Air Hockey — Online',
    'doc.desc':         'Hızlı hava hokeyi. Bilgisayara karşı, aynı telefonda iki kişi ya da arkadaşınla online oyna. Kayıt yok, kurulum yok.',

    /* ---- first-run language picker ---- */
    'lang.pick':        'Dil / Language',
    'lang.sub':         'Hangi dilde oynamak istersin?',
    'lang.go':          'Devam',
    'lang.title':       'Dil',
    'lang.hint':        'Dili istediğin zaman buradan değiştirebilirsin.',

    /* ---- menu ---- */
    'menu.tagline':     'Dokun ve oyna.<br>Kayıt yok, indirme yok, kurulum yok.',
    'menu.online':      'Online Oyna',
    'menu.onlineSub':   'Arkadaşınla, uzaktan',
    'menu.play':        'Oyna',
    'menu.playSub':     'Bilgisayara karşı, hemen',
    'menu.local':       'Aynı Telefonda 2 Kişi',
    'menu.localSub':    'Tek ekran, çift dokunuş',
    'menu.name':        'Adın',
    'menu.namePh':      'Oyuncu',
    'menu.settings':    'Ayarlar',

    /* ---- shared bits ---- */
    'com.back':         '← Geri',
    'com.target':       'Kaç golde biter?',
    'com.mode':         'Oyun modu',
    'com.classic':      'Klasik',
    'com.classicSub':   'Kurallar sabit',
    'com.lucky':        'Şanslı',
    'com.luckySub':     'Sopalar büyür, buz değişir',
    'com.half':         'Devre arası',
    'com.halfSub':      'Yarı yolda kısa mola',
    'plan.goals':       'golde',
    'plan.half':        'devre',
    'plan.end':         'biter',

    /* ---- online setup ---- */
    'on.title':         'Online Oyna',
    'on.create':        'Oda Oluştur',
    'on.createHint':    'Sen kur, kodu arkadaşına gönder.',
    'on.createBtn':     'Oda Oluştur',
    'on.join':          'Odaya Katıl',
    'on.joinHint':      'Arkadaşının gönderdiği 4 haneli kodu gir.',
    'on.joinBtn':       'Katıl',

    /* ---- lobby ---- */
    'lob.title':        'Oda Kodu',
    'lob.copy':         'Kodu Kopyala',
    'lob.share':        'Paylaş',
    'lob.p1':           'Oyuncu 1',
    'lob.you':          'Sen',
    'lob.waiting':      'Bekleniyor…',
    'lob.shareCode':    'Kodu paylaş',
    'lob.ready':        'Hazır',
    'lob.hostNote':     'Kuralları sen belirliyorsun. Rakip katılınca oyun başlar.',
    'lob.guestNote':    'Oda sahibi kuralları belirledi.',
    'lob.leave':        '← Odadan Çık',

    /* ---- same-phone setup ---- */
    'loc.title':        'Aynı Telefonda 2 Kişi',
    'loc.tagline':      'Telefonu aranıza koyun.<br><b class="c-me">Alt yarı</b> bir oyuncunun, <b class="c-foe">üst yarı</b> diğerinin.',
    'loc.halfSub':      'Yarı yolda telefonu çevirin',
    'loc.halfHint':     'Devrede telefonu 180° çevirirsiniz — herkes bir yarıyı da diğer taraftan oynar.',
    'loc.start':        'Başlat',

    /* ---- settings ---- */
    'set.title':        'Ayarlar',
    'set.floor':        'Zemin',
    'set.floorHint':    'Çocuklar için açık ve sade zeminler daha rahat görünür.',
    'set.puck':         'Top Rengi',
    'set.puckHint':     'Tema, sahaya uygun olanı seçer.',

    'theme.krem':       'Krem',
    'theme.buz':        'Buz',
    'theme.cim':        'Çim',
    'theme.gece':       'Gece',

    'puck.tema':        'Tema',
    'puck.siyah':       'Siyah',
    'puck.kirmizi':     'Kırmızı',
    'puck.turuncu':     'Turuncu',
    'puck.sari':        'Sarı',
    'puck.yesil':       'Yeşil',
    'puck.mavi':        'Mavi',
    'puck.mor':         'Mor',
    'puck.beyaz':       'Beyaz',

    /* ---- match screen ---- */
    'game.me':          'Sen',
    'game.foe':         'Rakip',
    'game.p1':          'Oyuncu 1',
    'game.p2':          'Oyuncu 2',
    'game.exit':        'Çık',
    'game.reconnect':   'Sunucuya yeniden bağlan',
    'game.goal':        'GOL!',
    'game.foeGoal':     'Rakip Attı',
    'game.go':          'BAŞLA!',
    'game.waitFoe':     'Rakip bekleniyor…',
    'hud.lucky':        'ŞANSLI',
    'hud.half':         'DEVRE',
    'hud.goals':        'GOL',

    /* ---- lucky twists ---- */
    'fx.p1':            'OYUNCU 1',
    'fx.p2':            'OYUNCU 2',
    'fx.mine':          'SOPAN',
    'fx.theirs':        'RAKİP',
    'fx.grow':          ' BÜYÜDÜ',
    'fx.shrink':        ' KÜÇÜLDÜ',
    'fx.fast':          'BUZ KAYGAN',
    'fx.slow':          'BUZ AĞIR',

    /* ---- half time ---- */
    'half.word':        'DEVRE',
    'half.turn':        'Telefonu 180° çevirin',
    'half.noteTurn':    'Alt taraf yukarı, üst taraf aşağı.<br>Böylece herkes ekranın iki yanını da kullanır.',
    'half.noteWait':    'İkiniz de hazır deyince ikinci yarı başlar.',
    'half.btnTurn':     'Çevirdik, Devam',
    'half.btnReady':    'Hazırım',
    'half.waitFoe':     'Rakip bekleniyor…',

    /* ---- game over ---- */
    'over.win':         'Kazandın!',
    'over.lose':        'Kaybettin',
    'over.p1Win':       'Oyuncu 1 Kazandı!',
    'over.p2Win':       'Oyuncu 2 Kazandı!',
    'over.sub':         'Tekrar oyna dersen maç yeniden başlar.',
    'over.again':       'Tekrar Oyna',
    'over.menu':        'Ana Menü',

    /* ---- connection + toasts ---- */
    'net.connecting':   'Bağlanıyor…',
    'net.ok':           'Sunucuya bağlı',
    'net.lost':         'Bağlantı koptu',
    'net.lostRetry':    'Bağlantı koptu, yeniden deneniyor…',
    'net.again':        'Sunucuya yeniden bağlanılıyor…',
    'net.wait':         'Sunucuya bağlanılıyor, bir saniye…',
    'net.peerIn':       'Rakip bağlandı!',
    'net.peerOut':      'Rakip ayrıldı — bekleniyor…',
    'net.badCode':      '4 haneli oda kodunu gir.',
    'net.copied':       'Kod kopyalandı: ',
    'net.code':         'Kod: ',
    'net.inviteCopied': 'Davet kopyalandı',
    'net.invite':       'Air Hockey oynayalım! Oda kodum: {code}\nLinke dokun, direkt odaya gir:\n{url}',

    /* ---- server-sent errors ---- */
    'game.bot':         'Bilgisayar',
    'skin.locked':      'Kilitli renk',
    'skin.offer':       'Kısa bir video izle, bütün top renkleri açılsın.',
    'skin.watch':       'Videoyu İzle',
    'skin.no':          'Şimdi Değil',
    'skin.done':        'Bütün renkler açıldı!',
    'skin.fail':        'Video yüklenemedi, sonra tekrar dene.',
    'over.soloWin':     'Kazandın!',
    'over.soloLose':    'Bilgisayar kazandı',
    'over.soloAgain':   'Bir Daha',

    'err.create':       'Oda oluşturulamadı, tekrar dene.',
    'err.notFound':     'Bu kodla bir oda bulunamadı.',
    'err.full':         'Bu oda dolu.',
    'err.timeout':      'Oda zaman aşımına uğradı.',
  },

  en: {
    'doc.title':        'Air Hockey — Online',
    'doc.desc':         'Fast air hockey. Play the computer, share one phone with a friend, or play online. No sign up, no setup.',

    'lang.pick':        'Language / Dil',
    'lang.sub':         'Which language do you want to play in?',
    'lang.go':          'Go',
    'lang.title':       'Language',
    'lang.hint':        'You can change the language here any time.',

    'menu.tagline':     'Tap and play.<br>No sign up, no download, no setup.',
    'menu.online':      'Play Online',
    'menu.onlineSub':   'With a friend, far away',
    'menu.play':        'Play',
    'menu.playSub':     'Against the computer, right now',
    'menu.local':       '2 Players on One Phone',
    'menu.localSub':    'One screen, two fingers',
    'menu.name':        'Your name',
    'menu.namePh':      'Player',
    'menu.settings':    'Settings',

    'com.back':         '← Back',
    'com.target':       'How many goals to win?',
    'com.mode':         'Game type',
    'com.classic':      'Classic',
    'com.classicSub':   'Rules stay the same',
    'com.lucky':        'Lucky',
    'com.luckySub':     'Paddles grow, ice changes',
    'com.half':         'Half time',
    'com.halfSub':      'A short break in the middle',
    'plan.goals':       'goals',
    'plan.half':        'half time',
    'plan.end':         'game ends',

    'on.title':         'Play Online',
    'on.create':        'Make a Room',
    'on.createHint':    'You make the room, then send the code to your friend.',
    'on.createBtn':     'Make Room',
    'on.join':          'Join a Room',
    'on.joinHint':      'Type the 4-letter code your friend sent you.',
    'on.joinBtn':       'Join',

    'lob.title':        'Room Code',
    'lob.copy':         'Copy Code',
    'lob.share':        'Share',
    'lob.p1':           'Player 1',
    'lob.you':          'You',
    'lob.waiting':      'Waiting…',
    'lob.shareCode':    'Share the code',
    'lob.ready':        'Ready',
    'lob.hostNote':     'You pick the rules. The game starts when your friend joins.',
    'lob.guestNote':    'The person who made the room picked the rules.',
    'lob.leave':        '← Leave Room',

    'loc.title':        '2 Players on One Phone',
    'loc.tagline':      'Put the phone between you.<br><b class="c-me">The bottom half</b> is for one player, <b class="c-foe">the top half</b> for the other.',
    'loc.halfSub':      'Turn the phone around in the middle',
    'loc.halfHint':     'At half time you turn the phone around 180° — so you both get to play from each side.',
    'loc.start':        'Start',

    'set.title':        'Settings',
    'set.floor':        'Floor',
    'set.floorHint':    'Light, simple floors are easier for kids to see.',
    'set.puck':         'Puck Colour',
    'set.puckHint':     '"Theme" picks the colour that fits the floor.',

    'theme.krem':       'Cream',
    'theme.buz':        'Ice',
    'theme.cim':        'Grass',
    'theme.gece':       'Night',

    'puck.tema':        'Theme',
    'puck.siyah':       'Black',
    'puck.kirmizi':     'Red',
    'puck.turuncu':     'Orange',
    'puck.sari':        'Yellow',
    'puck.yesil':       'Green',
    'puck.mavi':        'Blue',
    'puck.mor':         'Purple',
    'puck.beyaz':       'White',

    'game.me':          'You',
    'game.foe':         'Player 2',
    'game.p1':          'Player 1',
    'game.p2':          'Player 2',
    'game.exit':        'Leave',
    'game.reconnect':   'Connect to the server again',
    'game.goal':        'GOAL!',
    'game.foeGoal':     'THEY SCORED',
    'game.go':          'GO!',
    'game.waitFoe':     'Waiting for the other player…',
    'hud.lucky':        'LUCKY',
    'hud.half':         'HALF',
    'hud.goals':        'GOALS',

    'fx.p1':            'PLAYER 1',
    'fx.p2':            'PLAYER 2',
    'fx.mine':          'YOUR PADDLE',
    'fx.theirs':        'THEIR PADDLE',
    'fx.grow':          ' GOT BIGGER',
    'fx.shrink':        ' GOT SMALLER',
    'fx.fast':          'ICE IS SLIPPERY',
    'fx.slow':          'ICE IS SLOW',

    'half.word':        'HALF TIME',
    'half.turn':        'Turn the phone around',
    'half.noteTurn':    'The bottom player goes up, the top player goes down.<br>That way you both use each side of the screen.',
    'half.noteWait':    'The second half starts when you are both ready.',
    'half.btnTurn':     'We turned it, go on',
    'half.btnReady':    'I am ready',
    'half.waitFoe':     'Waiting for the other player…',

    'over.win':         'You Won!',
    'over.lose':        'You Lost',
    'over.p1Win':       'Player 1 Won!',
    'over.p2Win':       'Player 2 Won!',
    'over.sub':         'Tap Play Again to start a new game.',
    'over.again':       'Play Again',
    'over.menu':        'Main Menu',

    'net.connecting':   'Connecting…',
    'net.ok':           'Connected to the server',
    'net.lost':         'Connection lost',
    'net.lostRetry':    'Connection lost. Trying again…',
    'net.again':        'Connecting to the server again…',
    'net.wait':         'Connecting to the server, one second…',
    'net.peerIn':       'Your friend joined!',
    'net.peerOut':      'Your friend left — waiting…',
    'net.badCode':      'Type the 4-letter room code.',
    'net.copied':       'Code copied: ',
    'net.code':         'Code: ',
    'net.inviteCopied': 'Invite copied',
    'net.invite':       "Let's play Air Hockey! My room code is: {code}\nTap the link to jump right in:\n{url}",

    'game.bot':         'Computer',
    'skin.locked':      'Locked colour',
    'skin.offer':       'Watch a short video to unlock every puck colour.',
    'skin.watch':       'Watch Video',
    'skin.no':          'Not Now',
    'skin.done':        'All colours unlocked!',
    'skin.fail':        'The video could not load. Try again later.',
    'over.soloWin':     'You Won!',
    'over.soloLose':    'The computer won',
    'over.soloAgain':   'Again',

    'err.create':       'The room could not be made. Please try again.',
    'err.notFound':     'No room was found with that code.',
    'err.full':         'This room is full.',
    'err.timeout':      'The room was closed because nobody played for a while.',
  },
};

let lang = 'en';

/* Whether the player has ever answered the language question. The first-run
   pop-up keys off this, so it shows exactly once. */
function chosen() {
  try { return LANGS.indexOf(localStorage.getItem('ah_lang')) >= 0; }
  catch (_) { return false; }
}

/* What the browser says the player reads, if we speak it. This is what the
   first-run pop-up used to ask for — asking was a screen between the player
   and the game, and the answer was already sitting in navigator.language. */
function detect() {
  try {
    const tags = navigator.languages || [navigator.language || ''];
    for (const tag of tags) {
      const base = String(tag).toLowerCase().split('-')[0];
      if (LANGS.indexOf(base) >= 0) return base;
    }
  } catch (_) {}
  return 'en';
}

function load() {
  lang = detect();
  try {
    const v = localStorage.getItem('ah_lang');
    if (LANGS.indexOf(v) >= 0) lang = v;   // an explicit choice always wins
  } catch (_) { /* first run, or storage blocked */ }
}

function set(v, remember) {
  lang = LANGS.indexOf(v) >= 0 ? v : 'en';
  if (remember !== false) {
    try { localStorage.setItem('ah_lang', lang); } catch (_) {}
  }
  apply();
}

function t(key, vars) {
  const table = STR[lang] || STR.en;
  let s = table[key];
  if (s == null) s = STR.en[key];
  if (s == null) return key;
  if (vars) {
    for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  }
  return s;
}

/* Paints every element that carries a translation attribute. Called on start
   and again whenever the language changes, so the switch is instant. */
function apply() {
  document.documentElement.lang = lang;
  document.title = t('doc.title');
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', t('doc.desc'));

  const set1 = (attr, fn) => {
    document.querySelectorAll('[' + attr + ']').forEach((el) => {
      fn(el, t(el.getAttribute(attr)));
    });
  };
  set1('data-i18n',       (el, s) => { el.textContent = s; });
  set1('data-i18n-html',  (el, s) => { el.innerHTML = s; });
  set1('data-i18n-ph',    (el, s) => { el.setAttribute('placeholder', s); });
  set1('data-i18n-aria',  (el, s) => { el.setAttribute('aria-label', s); });
  set1('data-i18n-title', (el, s) => { el.setAttribute('title', s); });

  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

load();

window.AHI18n = {
  t, set, apply, chosen,
  langs: LANGS,
  names: LANG_NAMES,
  get current() { return lang; },
};
}());
