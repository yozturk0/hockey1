# CLAUDE.md — Air Hockey / Portal Sürümü

Bu dosya oturumlar arası hafızadır. Yeni bir oturum **önce bunu okur**, sonra
kaldığı yerden devam eder. Her önemli karardan sonra güncellenir.

Son güncelleme: 2026-08-27 · Dal: `feature/devre-temalar-sert-vurus`

---

## 1. Projenin amacı

Elde çalışan bir air hockey oyunu var (web + iOS + otoriter WebSocket sunucusu).
Hedef: **web sürümünü Poki ve CrazyGames'e gönderip kabul almak.**

Portal ürününün öncelikleri normal bir oyundan farklıdır:

| Eski öncelik | Portal önceliği |
|---|---|
| Arkadaşınla oda kodu paylaş | Tek başına gelen oyuncu 5 saniyede oynasın |
| Online öncelikli | Bot öncelikli, online bonus |
| Ayarlar zengin | Ayar yok denecek kadar az |
| Dil seçtir | Dil sorma, `navigator.language`'den al |

---

## 2. Hedef platformlar

| Platform | SDK | Build |
|---|---|---|
| **Poki** | `https://game-cdn.poki.com/scripts/v2/poki-sdk.js` | `portal/build/poki/` |
| **CrazyGames** | `https://sdk.crazygames.com/crazygames-sdk-v3.js` | `portal/build/crazygames/` |
| **itch.io** | yok | `portal/build/itch/itch-air-hockey.zip` |
| Kendi sitesi (Render) | yok | `portal/build/web/` veya doğrudan `web/` |
| iOS (App Store) | — | `ios/` · **bu işten etkilenmez, dokunulmadı** |

**Kritik:** İki portala aynı build gönderilemez. Her portal rakibinin SDK'sını
içeren build'i reddeder.

---

## 3. Teknoloji (değiştirilmeyecek)

- **Web istemcisi:** saf vanilla JS. Framework yok, runtime bundler yok.
- **Render:** tek `<canvas>` + 2D context. **Görsel asset sıfır** — her şey kodla çizilir.
- **Ses:** WebAudio prosedürel sentez (`web/sound.js`). **Ses dosyası sıfır.**
- **Fizik:** `web/engine.js` — istemci ve sunucu **aynı dosyayı** paylaşır (UMD).
- **Sunucu:** Node + `ws`. `server/server.js`. Statik site + `/ws`.
- **Saha:** kanonik 100 × 200 birim, origin sol-üst. A alttaki kaleyi savunur,
  B üsttekini. Sunucu B'ye 180° döndürülmüş snapshot yollar.
- **iOS:** SwiftUI. `Engine.swift` = `engine.js` ikizi, `Strings.swift` = `i18n.js` ikizi.

### Neden korunuyor
Vanilla JS + prosedürel asset = **24 KB brotli toplam.** Poki'nin tavsiye
ettiğinin ~1/100'ü. Motor değiştirmek bu tek en büyük avantajı yok eder.

---

## 4. Dosya haritası (yeni eklenenler ★)

```
web/
  index.html      tek sayfa, bütün ekranlar burada
  style.css       tema değişkenleri + bütün düzen
  engine.js       fizik (sunucu da kullanır) — DOKUNMA, iOS ikizi var
★ view.js         sahanın pencereye oturması + koordinat dönüşümleri
★ bot.js          bilgisayar rakip
★ sdk.js          Poki / CrazyGames köprüsü
  sound.js        WebAudio sentez
  i18n.js         TR/EN sözlük (iOS ikizi: Strings.swift)
  app.js          oyun döngüsü, ekranlar, ağ, girdi
server/server.js  otoriter sunucu + statik servis + /health + /ping
★ portal/build.js build betiği (üç hedef)
★ portal/build/   çıktı — .gitignore'da
test/
  engine.test.js  fizik
★ view.test.js    koordinat dönüşümleri (ileri/geri tam ters mi)
  server.test.js  uçtan uca soket
```

---

## 5. Mimari kararlar

### K1 — Portal kodu `web/` içinde, build tooling `portal/` içinde
İlk plan portal kodunu ayrı klasöre koymaktı; **vazgeçildi.** `sdk.js` oyunun
istemcisinin bir parçası ve portal-agnostik (hedefsizken tamamen no-op), o
yüzden `web/` içinde yaşıyor. `portal/` sadece build betiğini ve çıktıyı tutar.
Böylece tek kaynak ağacı var, `web/` hem geliştirme hem kaynak.

### K2 — Oyun kodu SDK'ları doğrudan çağırmaz
`app.js` asla `PokiSDK.` ya da `CrazyGames.` yazmaz. Sadece `AHPortal.*`.
Hedef `window.AH_PORTAL` ile build zamanında seçilir.

**İki kural köprüde zorlanır** (çağıranın iyi niyetine bırakılmaz, çünkü ikisi
de doğrudan red sebebi):
1. İlk maç bitmeden `commercialBreak()` hiçbir şey yapmaz.
2. Reklam boyunca ses kısılır, saha dondurulur.

SDK hiç yüklenmezse (adblock) her şey no-op olur, oyun aynen oynanır — iki
portal da bunu şart koşuyor.

### K3 — Bot birinci sınıf vatandaş
Menünün ilk butonu "Oyna" → kurulum ekranı yok, doğrudan bota karşı maç.
Bot `engine.js`'i istemcide sürer, sunucuya ihtiyaç duymaz.
Solo hedef **5 gol** (online 7) — portal oyuncusu tadına bakıyor.

Bot tek bir `skill` (0..1) sayısıyla yönetilir: tepki gecikmesi, sopa hızı,
nişan hatası, okuma mesafesi, üşengeçlik. Her golden sonra kendini ayarlar
(kaybedene yumuşar, kaçana sertleşir), **aralık 0.12–0.70'e kilitli** — daha
iyi bir bot daha iyi rakip değil, sadece bir duvar.

### K4 — Render uykusu: iki taraflı
- Sunucu: `/health` (platform checker) + `/ping` (harici uptime cron).
- İstemci: istek kuyruğa alınır, soket açılınca kendi gider. 1.2 sn sonra
  "sunucu uyanıyor" uyarısı + **"bu arada bilgisayara karşı oyna"** butonu.
- Oyuncu asla boş ekrana bakmaz.
- Boot'ta artık `Net.connect()` yok — solo oyuncu kullanmayacağı soketi beklemez.

### K5 — Yatay saha
Pencere enden genişse (`w > h`) saha çeyrek tur döner: oyuncunun kalesi alt
kenardan sol duvara geçer. **Fizik bunu hiç öğrenmez** — sadece `view.js`'deki
çizim ve dokunma eşlemesi bilir. `test/view.test.js` iki yönün birbirinin tam
tersi olduğunu 6 farklı pencere ölçüsünde doğrular.

### K6 — Dil kapısı kaldırıldı
`navigator.language` okunur; açık bir seçim (localStorage) her zaman kazanır.
Ayarlar'daki dil kartı yerinde.

### K8 — Online sunucu adresi build zamanında verilir
`web/` dışındaki her build başka birinin alan adından servis edilir (portal
CDN'i, `html-classic.itch.zone`), yani aynı-origin soket tahmini yanlış
hedefe gider. Sıra: `?server=` → `window.AH_WS` → aynı origin.

```bash
AH_WS=wss://senin-app.onrender.com/ws npm run build
```

`AH_WS` verilmezse portal/itch build'lerinde online mod çalışmaz; solo ve
aynı-cihaz modları etkilenmez (hiç soket açmıyorlar — tarayıcıda doğrulandı).

### K9 — itch.io: SDK yok, manifest yok, zip var
itch.io oyunu kendi zone alan adında sandbox'lı iframe'de servis ediyor.
Portal SDK'sı yok (iki portalın da markası yok → temiz), PWA manifest'i
anlamsız. Build `index.html` kökte olacak şekilde zip'i kendisi üretiyor.

### K7 — Ödüllü reklam: sadece kozmetik
9 top renginden 4'ü serbest, 5'i bir video karşılığı açılır. **Oynanışa etkisi
yok** — "core gameplay'i ödüllü videonun arkasına koyma" kuralı gereği.
Portalsız build'de hepsi zaten açık (izlenecek video yok).

---

## 6. YAPILMAMASI gerekenler

### Portal kuralları (ihlal = red)
- ❌ Kendi reklam ağı (AdSense/AdMob/herhangi bir tag)
- ❌ Oyun içinden dış link — Poki'de zorunluysa `PokiSDK.openExternalLink()`
- ❌ Kendi IAP / ödeme akışı
- ❌ Giriş / kayıt / e-posta duvarı
- ❌ Başka portalın markası, logosu, SDK'sı
- ❌ **İlk maçtan önce reklam** (en sık red sebebi)
- ❌ Harici analytics (GA, Mixpanel…)
- ❌ SDK dışında harici istek — Poki hepsini varsayılan olarak engeller

### Teknik
- ❌ Framework/bundler eklemek
- ❌ `web/engine.js` fiziğini değiştirmek (iOS ikizi bozulur)
- ❌ `ios/` altına dokunmak (kapsam dışı)
- ❌ Ses dosyası / görsel asset eklemek
- ❌ `localStorage`'ı try/catch'siz kullanmak (gizli sekme)

---

## 7. Ölçümler

### Başlangıç (2026-08-27, değişiklik öncesi)
İlk ekran, minify yok, sunucuda sıkıştırma **yok**: ham ~125 KB / gzip ~37 KB.

### Şimdi (`npm run build`)
| Hedef | Ham | gzip | brotli |
|---|---:|---:|---:|
| poki | 85.7 KB | **27.3 KB** | **24.0 KB** |
| crazygames | 85.7 KB | 27.3 KB | 24.0 KB |
| web (PWA ikonları dahil) | 109.0 KB | 49.3 KB | 46.0 KB |

Poki hedefi "10 saniyenin altında yüklensin". 24 KB, yavaş 3G'de bile
1 saniyenin altında. Hedef (<5 MB, ideal <3 MB) ~125 kat aşıldı.

Sunucu artık brotli/gzip uyguluyor: `app.js` 53.7 KB → 14.5 KB.

---

## 8. Bilinen açık konular

1. **Poki harici istek engeli.** Online mod Render'a WebSocket açar. Poki
   varsayılan olarak bütün harici istekleri engeller — **başvuruda multiplayer
   alan adının whitelist'e alınmasını istemek gerekiyor.** Çözülene kadar
   Poki build'i pratikte solo + aynı-cihaz moduyla değerlendirilecektir.
2. **Maç süresi.** Fizik bilerek yavaşlatılmış (`PUCK_TEMPO = 0.7`, önceki bir
   commit'te "çocuklar için"). Bot-vs-bot simülasyonunda 5 gollük maç 500-600 sn
   sürüyor; gerçek insan daha hızlı skor yapar ama portal için hâlâ uzun
   olabilir. **Tek knob: `engine.js` içindeki `PUCK_TEMPO`.** Gameplay kararı
   olduğu için tek taraflı değiştirilmedi — gerçek cihazda oynanıp karar verilmeli.
3. **`test/server.test.js` içindeki "the break happens online too"** testi
   kalıyor. **Bu değişikliklerden önce de kalıyordu** (baseline'da doğrulandı),
   sebebi 2. maddeyle aynı: sentetik oyuncular 90 sn'de 2 gol atamıyor.
4. **Gerçek cihazda oynanış testi yapılmadı.** Bu oturumda tarayıcı paneli
   görünür olmadı; mantık, SDK yaşam döngüsü ve koordinat matematiği testlerle
   ve konsol üzerinden doğrulandı, ama "eliyle oynayınca nasıl hissettiriyor"
   doğrulanmadı. Bot zorluğu ve maç temposu buna göre son ayarını bekliyor.

---

## 9. İş planı ve ilerleme

| # | İş | Durum |
|---|---|---|
| 0 | Repoyu oku, raporla | ✅ |
| 1 | Bot + anında oynanabilirlik | ✅ |
| 2 | Dil kapısı kaldır, onboarding | ✅ |
| 3 | Poki SDK | ✅ tarayıcıda doğrulandı |
| 4 | CrazyGames SDK (ayrı build) | ✅ tarayıcıda doğrulandı |
| 5 | Render uykusu → kuyruk + bot fallback + /ping | ✅ |
| 6 | Yatay saha, safe area, visibilitychange | ✅ |
| 7 | Portal yasakları taraması | ✅ ihlal bulunmadı |
| 8 | Aynı cihazda 2 kişi doğrulaması | ✅ |
| 9 | Minification + build sistemi + ölçüm | ✅ |
| 10 | Başvuru metni, isim, metrikler | ✅ |
| 11 | itch.io hedefi + build zamanı sunucu adresi | ✅ |
| 12 | Gerçek cihazda oynanış + denge ayarı | ⬜ **sıradaki** |

---

## 10. Kullanıcının yapacakları

1. **Poki hesabı** — review'da. Onaydan sonra oyun kaydı açılınca SDK URL'si
   verilir; genel URL zaten build'de, oyuna özelse değiştirilecek.
2. **CrazyGames hesabı** — açılıyor.
3. **Render keep-alive** — cron-job.org'da 10 dk'da bir `GET /ping`.
4. **Kapak görseli** 1600×900 + kare, 2-4 ekran görüntüsü.
5. **İsim kararı** (öneriler final raporda).
6. **Poki başvurusunda multiplayer alan adı whitelist talebi** (bkz. 8.1).

---

## 11. Komutlar

```bash
npm start          # dev sunucu → http://localhost:8080
npm test           # motor + koordinat testleri
npm run test:server# uçtan uca soket testleri (sunucu ayakta olmalı)
npm run build      # dört build (web/poki/crazygames/itch) + boyut raporu
npm run build:itch # sadece itch.io zip'i
node portal/build.js poki    # tek hedef

# online modun portal/itch build'inde çalışması için:
AH_WS=wss://senin-app.onrender.com/ws npm run build
```

---

## 12. Karar günlüğü

- **2026-08-27** — Repo okundu. Ses/görsel sıkıştırma ve texture atlas işleri
  **konusuz** çıktı: projede hiç ses/görsel asset yok. Boyut hedefi zaten
  ~80 kat aşılmıştı. 1. işin kapsamı minification + build sistemine daraltıldı.
- **2026-08-27** — Gerçek red riskinin boyut değil **onboarding** olduğu
  tespit edildi (dil pop-up'ı, oda kodu duvarı, tek oyunculu mod yok).
  Öncelik sırası buna göre yeniden dizildi ve kullanıcı onayladı.
- **2026-08-27** — K1 revize: portal kodu ayrı klasör yerine `web/sdk.js`.
- **2026-08-27** — Poki + CrazyGames resmi dokümantasyonu okundu, API'ler
  doğrulandı. Poki'nin "harici istekler varsayılan olarak engelli" kuralı
  keşfedildi → 8.1 açık konusu.
- **2026-08-27** — Bot adaptif zorluk aralığı 0.12–0.70'e kilitlendi; üst uçta
  maçlar kilitleniyordu.
- **2026-08-27** — itch.io dördüncü hedef olarak eklendi (zip çıktısı). Aynı
  işte online modun portal build'lerinde de kırık olduğu fark edildi: soket
  adresi aynı-origin tahmin ediliyordu → `AH_WS` build değişkeni (K8).
- **2026-08-27** — Fizik temposuna **dokunulmadı**: gameplay kararı, kullanıcıya
  bırakıldı (8.2).
