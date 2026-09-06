# ARCHITECTURE — sistem nasıl çalışıyor

Okuma sırası: [`../HANDOFF.md`](../HANDOFF.md) → bu dosya → [`PORTAL.md`](PORTAL.md).

---

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

## 5. Ağ protokolü

WebSocket, `/ws` yolunda, JSON mesajlar, `t` alanı tip.

**İstemci → sunucu:** `create`, `join`, `target`, `opts`, `ready`, `i` (girdi),
`restart`, `leave`, `p` (ping).

**Sunucu → istemci:** `hello` (sürüm + saha sabitleri), `joined`, `peer`
(karşı koltuk geldi/gitti), `err` (dil anahtarı `k` taşır → istemci kendi
dilinde gösterir), snapshot'lar, `q` (pong).

### Koltuk sahipliği — kırılgan olan yer

Sunucu eskiden `join`'de **ilk boş koltuğu** veriyordu. Odayı kuran kişi
yenileyince kendi odasına **b** olarak dönüyor, host'luğu ve kural kontrolünü
kaybediyordu. Artık:

- İstemci kalıcı bir `pid`'i soket adresinde yollar: `/ws?pid=…`
- Sunucu `room.owners` ile kimin hangi koltukta olduğunu hatırlar ve dönen
  oyuncuya **kendi koltuğunu** geri verir.
- `peer` mesajı artık `broadcast` değil, **sadece karşı koltuğa** gider
  (eskiden odaya girenin kendisine de gidiyordu → kendi boş lobisine dönen
  oyuncuya "arkadaşın katıldı!" çıkıyordu).

`test/seat.test.js` bu iki davranışı kilitler.

### Uyuyan sunucu

Render ücretsiz katmanı 15 dk sonra uyur, ilk açılış ~30 sn.

- Sunucu tarafı: `/health` (platform checker) + `/ping` (harici uptime cron).
- İstemci tarafı: istek kuyruğa alınır, soket açılınca kendi gider. 1.2 sn
  sonra "sunucu uyanıyor" uyarısı + **"bu arada bilgisayara karşı oyna"** butonu.
- **Boot'ta `Net.connect()` çağrılmaz.** Solo oyuncu kullanmayacağı soketi
  beklemez; `connect()` yalnızca açık online eylemlerinde çağrılır.

## 6. Bot

Bot tek bir `skill` sayısıyla (0..1) yönetilir: tepki gecikmesi, sopa hızı,
nişan hatası, okuma mesafesi, üşengeçlik. Her golden sonra kendini ayarlar
(kaybedene yumuşar, kaçana sertleşir), **aralık 0.12–0.70'e kilitli** — daha
iyi bot daha iyi rakip değil, sadece bir duvar.

Bot `engine.js`'i istemcide sürer, sunucuya ihtiyaç duymaz, ve tıpkı bir parmak
gibi yalnızca `setInput` çağırır.

### Hareket katmanı (titremeyi çözen üç şey)

Bot eskiden piksel piksel titriyordu. Sebep zorluk değil hareketti: `plan()`
her yeniden nişanda taze rastgele sapma üretip anında uyguluyordu.

- **Nişan hatası sürüklenme oldu** — Ornstein-Uhlenbeck adımı (`WANDER_TAU`
  = 0.55 sn). Uzun vadeli yayılım aynı, ama sapma kareler arasında yürüyor.
- **Plana yumuşak geçiş** (`track`, 6–14 1/s) — el yeni plana ışınlanmaz.
- **Momentum** (`accel`, 8–21 1/s) + varış yavaşlaması (`ARRIVE` = 0.09 sn).

Ölçüm (600 sn başsız maç, kare başına ortalama ivme değişimi):
eski **28–46** → yeni **2–4** birim/s². Zorluk tablosu ve uyum bandı
değişmedi — bu bir denge ayarı değil, hareket düzeltmesi.

## 7. Dokunulmayacaklar

- ❌ Framework / bundler eklemek
- ❌ `web/engine.js` fiziğini tek taraflı değiştirmek (iOS ikizi bozulur)
- ❌ Ses dosyası veya görsel asset eklemek
- ❌ `localStorage`'ı try/catch'siz kullanmak (gizli sekmede fırlatır)
- ❌ `app.js` içinden doğrudan `PokiSDK.` / `CrazyGames.` çağırmak — sadece
  `AHPortal.*` (bkz. PORTAL.md)
- ❌ `PUCK_TEMPO`'yu kullanıcıya sormadan değiştirmek — gameplay kararı

## 8. Testler

```bash
npm test           # engine + view (50 test, hepsi geçer)
npm run test:server# seat + server (sunucu ayakta olmalı)
```

Yeni davranış eklerken: fizik değişikliği `engine.test.js`'e, koordinat
değişikliği `view.test.js`'e, koltuk/oda davranışı `seat.test.js`'e yazılır.
