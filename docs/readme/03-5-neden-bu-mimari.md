<!-- split: part 3 of 3 of README.md | index: ../../README.md | added-lines: none -->

## 5. Neden bu mimari?

Fizik **yalnızca sunucuda** koşar; istemciler kendi sopalarının konumunu gönderir ve
saniyede 60 kez durum anlık görüntüsü alır.

- **İki oyuncu asla farklı bir oyun görmez.** Eşler arası (P2P) çözümlerde kaçınılmaz olan
  "top ışınlanması" ve skor uyuşmazlığı ortadan kalkar.
- **Kendi sopan asla gecikmeli hissettirmez:** yerel olarak anında çizilir, sunucunun
  otoriter konumuna yumuşakça yaklaştırılır.
- **Top akıcı görünür:** paketin yaşı kadar ileri sarılır (en fazla 140 ms) ve titreme
  üstel yumuşatmayla temizlenir.
- **Sesler sunucudan tetiklenir**, böylece iki oyuncu da vuruşu aynı anda duyar. Ses
  tamamen sentezlenir — hiçbir ses dosyası yok, hiçbir yükleme beklemesi yok.
- **iOS ve web aynı fiziği paylaşır:** `web/engine.js` ile `ios/AirHockey/Engine.swift`
  birebir aynı davranışa sahiptir (aynı telefonda 2 kişi modu için).

**Vuruş sertliği:** Topun tepe hızı `PUCK_MAX` (255 — saha ~0,8 saniyede geçilir),
sopanın *pasif* sekme katsayısı `PAD_REST`. Sopa topun içine doğru sürüldüğünde
sekme katsayısı `SMASH_BONUS` kadar artar (`SMASH_REF` hızında tavana vurur) —
yani sert bir vuruş gerçekten patlar, ama topun önüne park edilen sopa hâlâ sadece
blok yapar, enerji üretmez. Sopa hızının topa aktarımı normal boyunca
`PAD_TRANSFER`, teğet boyunca `PAD_DRAG`.

Şu anki eğri: hafif dokunuş ~45, orta vuruş ~140, tam vuruş 255 birim/sn.
Hepsi `web/engine.js` dosyasının en üstündeki sabitlerden ayarlanabilir ve
`ios/AirHockey/Engine.swift` içindeki `Field` ile birebir aynı tutulmalıdır.

Maç kuralları oyuna özeldir (`new Game({ target, padR, halftime, mode })`); sunucu
oda kurulurken oda sahibinden alır ve iki istemciye de bildirir. Şanslı modda sopa
yarıçapı ralli içinde değiştiği için her anlık görüntü iki yarıçapı da taşır
(`rm` = benimki, `ro` = rakibinki) — istemci hiçbir şey tahmin etmez.

Sayım sırasında `setInput` hiç kabul edilmez, yani sopa kilidi de otoriter taraftadır;
istemcideki dondurma yalnızca görüntüyü sunucuyla aynı tutmak içindir.

---

## 6. Takılırsan

| Belirti | Sebebi |
|---|---|
| "Sunucuya bağlanılıyor…" hiç geçmiyor | Sunucu çalışmıyor ya da adres yanlış. `/health` adresini aç. |
| `https://` sayfada bağlanmıyor | Sunucun `wss://` desteklemiyor. TLS şart. |
| iPhone yerel IP'ye bağlanmıyor | Telefon ile bilgisayar aynı Wi-Fi'da mı? Güvenlik duvarı 8080'i kapatıyor olabilir. |
| Oda kodu bulunamıyor | Odalar boş kaldıktan 90 sn sonra silinir; kurulan ama girilmeyen odalar 15 dk sonra. |
| Ping yüksek | Sunucu bölgesini oyuncularına yakın seç (Fly.io için `fra`). |

---

## Portal sürümü (Poki / CrazyGames)

Oyunun web sürümü iki oyun portalına gönderilebilecek şekilde paketlenir.
Kaynak tektir (`web/`), çıktı üçtür.

```bash
npm run build
```

| Çıktı | Ne için | Boyut (brotli) |
|---|---|---|
| `portal/build/poki/` | Poki'ye yüklenecek zip'in içeriği | ~24 KB |
| `portal/build/crazygames/` | CrazyGames'e yüklenecek zip'in içeriği | ~24 KB |
| `portal/build/web/` | Kendi siten — PWA manifest'i ve ikonlar dahil | ~46 KB |

Tek bir hedef için: `node portal/build.js poki`

**İki portala aynı build gönderilemez.** Her portal, rakibinin SDK'sını taşıyan
bir build'i reddeder. Build betiği bu yüzden hedefe göre farklı bir SDK etiketi
ve `window.AH_PORTAL` değeri gömer.

### Oyun kodu SDK'ları doğrudan çağırmaz

`app.js` içinde `PokiSDK.` ya da `CrazyGames.` geçmez — sadece `AHPortal.*`.
Köprü `web/sdk.js`'te ve iki kuralı çağıranın iyi niyetine bırakmaz, kendisi
zorlar (ikisi de doğrudan red sebebi):

1. İlk maç bitmeden `commercialBreak()` hiçbir reklam istemez.
2. Reklam boyunca ses kısılır, saha dondurulur; reklam bitince geri açılır.

SDK hiç yüklenmezse (reklam engelleyici) her çağrı no-op olur ve oyun aynen
oynanır. İki portal da bunu şart koşuyor.

### Yerelde denemek

```bash
node portal/build.js poki
```

```bash
cd portal/build/poki && python3 -m http.server 8099
```

Tarayıcı konsolunda SDK'nın yaşam döngüsünü görürsün:
`loading start → init → loading finished → gameplay start → gameplay stop`.

### Sunucu uykusu

Ücretsiz katman 15 dakika hareketsizlikten sonra uyur. İki tarafta da önlem var:

- Sunucuda `/ping` — harici bir uptime cron'u (cron-job.org gibi) 10 dakikada
  bir buraya istek atsın.
- İstemcide, soket hazır değilken istek kuyruğa alınır ve açılınca kendi gider;
  1.2 saniye sonra "sunucu uyanıyor" uyarısı ve **"bu arada bilgisayara karşı
  oyna"** butonu çıkar. Oyuncu boş ekranda beklemez.

### Bilinen açık konu

Poki harici istekleri varsayılan olarak engeller. Online mod Render'a WebSocket
açtığı için **başvuruda multiplayer alan adının whitelist'e alınması talep
edilmelidir.** O olana kadar Poki build'i solo ve aynı-cihaz modlarıyla
değerlendirilir; ikisi de sunucusuz çalışır.
