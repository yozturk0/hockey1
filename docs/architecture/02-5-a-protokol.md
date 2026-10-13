<!-- split: part 2 of 2 of ARCHITECTURE.md | index: ../ARCHITECTURE.md | added-lines: none -->

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
