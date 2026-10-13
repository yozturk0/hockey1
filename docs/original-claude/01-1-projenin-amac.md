<!-- split: part 1 of 5 of ORIGINAL_CLAUDE.md | index: ../ORIGINAL_CLAUDE.md | added-lines: none -->

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

