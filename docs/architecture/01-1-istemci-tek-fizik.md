<!-- split: part 1 of 2 of ARCHITECTURE.md | index: ../ARCHITECTURE.md | added-lines: none -->

## 1. Üç istemci, tek fizik

```
web/engine.js  ──┬── tarayıcı istemcisi (web/app.js)
                 └── otoriter sunucu (server/server.js)   ← aynı dosya, UMD

ios/AirHockey/Engine.swift ── engine.js'in birebir Swift ikizi
```

Sunucu ve tarayıcı **aynı fizik dosyasını** çalıştırır; iOS onun elle
senkronlanan ikizini. Bu üçlünün ayrışması oyunun en pahalı hata sınıfıdır.

### Değiştirilmez ikiz çiftleri

| Web | iOS | Kural |
|---|---|---|
| `web/engine.js` | `ios/AirHockey/Engine.swift` | fizikte yapılan her değişiklik ikisine birden |
| `web/i18n.js` | `ios/AirHockey/Strings.swift` | metin eklerken/çıkarırken ikisi birlikte |
| `web/bot.js` | `ios/AirHockey/Bot.swift` | aynı sayılar, aynı 0.12–0.70 uyum bandı |

## 2. Saha ve koordinatlar

- Kanonik saha **100 × 200 birim**, origin sol-üst.
- **A** alttaki kaleyi savunur, **B** üsttekini.
- Sunucu B'ye **180° döndürülmüş** snapshot yollar → istemci hep "kendi kalem
  altta" varsayabilir.

Ekrana oturtma tamamen `web/view.js`'de. İki dönüş üst üste binebilir:

- **Çeyrek tur** — pencere enden genişse (`w > h`) saha yan yatar, oyuncunun
  kalesi sol duvara geçer. Portal iframe'i ve yatay telefon bu yolla çalışır.
- **Yarım tur** — aynı-cihaz maçının ikinci devresinde, telefon masada
  çevrildiği için.

**Fizik bu dönüşlerin hiçbirini bilmez.** Sadece çizim (`toScreen`) ve dokunma
eşlemesi (`toField`) bilir; `test/view.test.js` ikisinin 6 farklı pencere
ölçüsünde birbirinin tam tersi olduğunu doğrular. Sıfır boyutlu pencere
(gizli sekme, henüz yerleşmemiş iframe) için ölçek `1e-6`'ya sabitlenir —
aksi halde bütün koordinatlar NaN'a düşer ve bir daha geri dönmez.

## 3. Dosya haritası

```
web/
  index.html    tek sayfa — bütün ekranlar section olarak burada (s-menu, s-online,
                s-lobby, s-local, s-game …), show(id) ile değiştirilir
  style.css     tema değişkenleri + bütün düzen
  engine.js     fizik — sunucu da kullanır. DOKUNMA (iOS ikizi var)
  view.js       saha yerleşimi + ileri/geri koordinat dönüşümü
  bot.js        bilgisayar rakip
  sdk.js        Poki / CrazyGames köprüsü (AHPortal) — bkz. PORTAL.md
  sound.js      WebAudio prosedürel sentez — ses dosyası YOK
  i18n.js       TR/EN sözlük
  app.js        oyun döngüsü, ekranlar, ağ (Net), girdi, render (~1760 satır)
server/server.js  otoriter sunucu + statik servis + brotli/gzip + /health + /ping
portal/build.js   dört hedefli build betiği
portal/build/     çıktı — .gitignore'da
test/
  engine.test.js  fizik
  view.test.js    koordinat dönüşümleri
  seat.test.js    koltuk sahipliği + peer mesajının hedefi
  server.test.js  uçtan uca soket
ios/AirHockey/    SwiftUI uygulaması (Engine/Bot/Strings web'in ikizleri)
```

## 4. Render / çizim

Tek `<canvas>` + 2D context. **Görsel asset sıfır** — kale, sopa, top, saha,
neon parlaması: hepsi kodla çizilir. Ses de aynı şekilde prosedürel.

Bu bir estetik tercih değil, **en büyük rekabet avantajı**: portal build'i
brotli ile ~24 KB. Poki'nin tavsiye ettiği boyutun ~1/100'ü. Bir framework,
bundler, sprite atlası ya da ses dosyası eklemek bu avantajı tek hamlede yok
eder.

### iOS'a özgü iki tuzak (çözüldü, tekrar açılmasın)

- **Neon parlaması filtre değil halka.** SwiftUI `Canvas` içinde
  `addFilter(.shadow:)` her çağrıda offscreen buffer + Gaussian blur demek ve
  karede beş tane vardı. Yerine düz halka/kalın çizgi kondu.
- **`TimelineView` bağlamı kullanılmalı.** `world` bilerek `@Published` değil
  (kare başına yayın SwiftUI'yi boğar). `TimelineView(.animation) { tl in … }`
  içindeki `tl.date` çizim çağrısına `at:` olarak geçirilmezse SwiftUI kareyi
  yeniden çizmez ve **çevrimdışı modlar ekranda donar** (online, `snap`
  @Published olduğu için bunu gizler).
- **120 Hz için plist anahtarı şart:** `CADisableMinimumFrameDuration`.
  `CAFrameRateRange` tek başına yetmez.

