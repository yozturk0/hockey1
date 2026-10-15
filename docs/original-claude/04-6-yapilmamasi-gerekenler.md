<!-- split: part 4 of 5 of ORIGINAL_CLAUDE.md | index: ../ORIGINAL_CLAUDE.md | added-lines: none -->

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
4. **Render'daki sunucu eski.** `https://airhockey-eu.onrender.com` ayakta
   ama `/ping` 404 veriyor ve `/health` içinde `players` alanı yok — yani
   `5b1a7b2` öncesi bir sürüm çalışıyor. Bu daldaki sunucu değişiklikleri
   (koltuk sahipliği, `peer` hedefi, brotli, `/ping`) **deploy edilene kadar
   canlıda yok.** iOS uygulaması varsayılan olarak bu adrese bağlanıyor.
5. **Simülatör paneli hâlâ çökük**, ama artık engel değil: uygulama
   `xcrun simctl launch` + `simctl io screenshot` ile başsız sürülüp
   doğrulandı (donma bu yolla yakalandı ve düzeltildiği bu yolla kanıtlandı).
   Yine de gerçek cihazda kare hızı ölçülmedi — simülatördeki Debug derlemesi
   yazılımla çiziyor.
6. **(eski 5) Simülatör paneli önceki oturumda da çökük.** Derleme başarılı (headless
   `xcodebuild`), ama uygulama çalışır halde görülemedi: kare hızı düzeltmesi
   ve bot dengesi gerçek cihazda ölçülmeyi bekliyor. Ayrıca simülatördeki
   Debug derlemesi yazılımla çiziyor — 5 fps orada beklenen bir şey, cihazdaki
   sayı ayrı ölçülmeli.
6. **Gerçek cihazda oynanış testi yapılmadı.** Bu oturumda tarayıcı paneli
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
| 19 | Bot hareketi: sürüklenen hata + momentum (K14) | ✅ ölçüldü |
| 20 | iOS 120 Hz / ProMotion (K15) | ✅ cihazda doğrulanmalı |
| 17 | iOS çevrimdışı mod donması (K12) | ✅ simülatörde doğrulandı |
| 18 | Solo maç kuralları + Ayarlar kartı (K13) | ✅ |
| 13 | Hayalet "arkadaşın katıldı" + koltuk kaybı (K9b) | ✅ testli |
| 14 | iOS render maliyeti (K11) + sesi ana iş parçacığından çıkarma | ✅ |
| 15 | iOS bot / tek kişilik mod (K10) | ✅ cihazda denenmeli |
| 16 | Render'a güncel sunucuyu deploy et | ⬜ **kullanıcı** |

---

