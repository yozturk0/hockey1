# HANDOFF — yeni Claude hesabı buradan başlar

Bu dosya **devir teslim tutanağıdır**. Projeyi hiç görmemiş bir Claude Code
oturumu (ya da yeni bir geliştirici) şu üç dosyayı bu sırayla okuyunca tam
resmi görür:

1. **`HANDOFF.md`** (bu dosya) — proje nedir, nerede duruyor, sırada ne var,
   neyi insan yapmalı.
2. **`docs/ARCHITECTURE.md`** — kod nasıl çalışıyor, hangi kurallar
   kırılmamalı, hangi dosyaya neden dokunulmaz.
3. **`docs/PORTAL.md`** — Poki / CrazyGames / itch.io kuralları, build sistemi,
   başvuru kontrol listesi.

`CLAUDE.md` bunların üstüne gelen **oturum günlüğüdür** (karar tarihçesi, K1–K15
mimari kararları). Detay gerekirse oraya bakılır; ama yukarıdaki üç dosya
tek başına yeterlidir.

---

## 1. Proje tek cümlede

Vanilla JS ile yazılmış, sıfır asset içeren bir hava hokeyi oyunu:
tarayıcıda oynanır, iOS uygulaması vardır, otoriter bir WebSocket sunucusu
üzerinden iki cihaz aynı maçta buluşur. **Şu anki hedef: web sürümünü Poki ve
CrazyGames'e gönderip kabul almak.**

## 2. İlk 5 dakika — çalıştığını doğrula

```bash
npm install
```

```bash
npm test
```

Beklenen: `50 passed, 0 failed` (fizik + koordinat testleri).

```bash
npm start
```

`http://localhost:8080` açılır. Sunucu ayaktayken ikinci bir terminalde:

```bash
npm run test:server
```

> Bilinen durum: `test/server.test.js` içindeki **"the break happens online
> too"** testi kalır. Bu bir gerileme değil — sentetik oyuncular 90 saniyede
> devre arası tetikleyecek kadar gol atamıyor (bkz. §5.2).

Portal çıktılarını üret:

```bash
npm run build
```

Dört hedef `portal/build/` altına yazılır ve ham/gzip/brotli tablosu basılır.
Beklenen toplam: portal hedefleri **~24 KB brotli**.

## 3. Ortam ve servisler (yeni hesabın devralacağı şeyler)

| Şey | Durum | Not |
|---|---|---|
| Node | ≥ 18 | tek runtime bağımlılığı `ws` |
| Dev sunucu | `npm start`, port 8080 | `.claude/launch.json` içinde `hockey` ve `itch` profilleri hazır |
| Render (canlı sunucu) | `https://airhockey-eu.onrender.com` | **eski sürüm koşuyor**, bkz. §5.4 |
| Poki hesabı | review'da | onaydan sonra oyuna özel SDK URL'si gelirse `portal/build.js` içindeki genel URL değişir |
| CrazyGames hesabı | açılıyor | — |
| itch.io | hesap gerekmiyor, zip yükleniyor | `npm run build:itch` |
| Xcode projesi | `ios/` | bu iş kapsamında değil, ama bot ve 120 Hz düzeltmeleri portlandı |

Dış bağımlılık, API anahtarı, ödeme entegrasyonu, analytics **yok**. Devir
sırasında taşınacak gizli bir değer yok; tek build değişkeni `AH_WS`:

```bash
AH_WS=wss://senin-app.onrender.com/ws npm run build
```

Verilmezse portal/itch build'lerinde online mod kapalı kalır (solo ve
aynı-cihaz modları etkilenmez — onlar hiç soket açmaz).

## 4. Nerede kaldık

Bitmiş işler (özet; tam liste `CLAUDE.md` §9'da):

- Bot ve anında oynanabilirlik — menünün ilk butonu doğrudan maç başlatır.
- Dil kapısı kaldırıldı, `navigator.language` okunuyor.
- Poki ve CrazyGames SDK köprüsü (`web/sdk.js`), tarayıcıda doğrulandı.
- Uyuyan Render sunucusu için istek kuyruğu + "bu arada bota karşı oyna" çıkışı.
- Yatay saha, safe-area, sekme gizlenince duraklatma.
- Portal yasakları taraması — ihlal bulunmadı.
- Minification + dört hedefli build sistemi + boyut raporu.
- itch.io hedefi ve build zamanında sunucu adresi.
- Koltuk sahipliği hatası (yenileyince host'luğun kaybı) — `test/seat.test.js` kilitliyor.
- iOS: bot portu, çevrimdışı modların donması, render maliyeti, 120 Hz.

**Sıradaki iş — #12: gerçek cihazda oynanış ve denge ayarı.** Mantık, SDK yaşam
döngüsü ve koordinat matematiği testlerle doğrulandı; "eliyle oynayınca nasıl
hissettiriyor" doğrulanmadı. Bot zorluğu ve maç temposu bu ölçüme bağlı.

## 5. Açık konular (yeni oturumun bilmesi şart)

1. **Poki harici istek engeli.** Poki varsayılan olarak bütün harici istekleri
   engeller; online mod Render'a WebSocket açıyor. Başvuruda **multiplayer alan
   adının whitelist'e alınması** istenmeli. Çözülene kadar Poki build'i pratikte
   solo + aynı-cihaz moduyla değerlendirilir.
2. **Maç süresi.** Fizik bilerek yavaş (`PUCK_TEMPO = 0.7`, "çocuklar için"
   kararı). Bot-vs-bot simülasyonunda 5 gollük maç 500–600 sn sürüyor. Tek knob
   `web/engine.js` içindeki `PUCK_TEMPO`. **Gameplay kararı olduğu için tek
   taraflı değiştirilmedi** — gerçek cihazda oynanıp karar verilmeli.
3. **`test/server.test.js` devre testi kalıyor** — 2. maddenin sonucu, baseline'da
   da kalıyordu.
4. **Render'daki sunucu eski.** `/ping` 404 veriyor, `/health` içinde `players`
   alanı yok → `5b1a7b2` öncesi bir sürüm koşuyor. Bu daldaki sunucu
   değişiklikleri (koltuk sahipliği, `peer` hedefi, brotli, `/ping`) **deploy
   edilene kadar canlıda yok.** iOS uygulaması varsayılan olarak bu adrese
   bağlanıyor.
5. **Simülatör paneli çökük.** Engel değil: uygulama `xcrun simctl launch` +
   `simctl io screenshot` ile başsız sürülüp doğrulandı. Ama gerçek cihazda kare
   hızı ölçülmedi (simülatördeki Debug derlemesi yazılımla çiziyor).

## 6. İnsanın yapacakları (Claude yapamaz)

1. **Poki hesabı** — onay bekleniyor; oyun kaydı açılınca SDK URL'si doğrulanmalı.
2. **CrazyGames hesabı** — açılışı tamamla.
3. **Render keep-alive** — cron-job.org'da 10 dakikada bir `GET /ping`.
4. **Güncel sunucuyu Render'a deploy et** (§5.4) — `main`'e merge yeterli.
5. **Kapak görseli** 1600×900 + kare, 2–4 ekran görüntüsü.
6. **İsim kararı.**
7. **Poki başvurusunda multiplayer alan adı whitelist talebi** (§5.1).
8. **Gerçek cihazda oynama** — bot zorluğu ve tempo bu geri bildirime bağlı.

## 7. Depo durumu (devir anı)

Dal: `feature/devre-temalar-sert-vurus` · son commit `d44e149`.
Commit edilmemiş çalışma var (iOS bot + koltuk testi + sunucu değişiklikleri).
Yeni hesapta ilk iş: `git status` ile bu değişiklikleri gözden geçirip commit'lemek.

`portal/build/` ve `node_modules/` `.gitignore`'da — devir sırasında taşınmalarına
gerek yok, `npm install && npm run build` ikisini de yeniden üretir.
