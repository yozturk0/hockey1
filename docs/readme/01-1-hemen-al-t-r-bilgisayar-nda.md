<!-- split: part 1 of 3 of README.md | index: ../../README.md | added-lines: none -->

## 1. Hemen çalıştır (bilgisayarında)

```bash
npm install
```

```bash
npm start
```

Tarayıcıdan `http://localhost:8080` — açılır. Aynı Wi-Fi'daki telefonundan denemek için
bilgisayarının yerel IP'siyle aç: `http://192.168.1.20:8080` gibi.

Testler:

```bash
npm test && npm run test:server
```

---

## 2. Yayına alma — herkesin girebileceği bir adres

> **Önemli:** Netlify / Vercel / GitHub Pages **işe yaramaz.** Bunlar yalnızca statik dosya
> sunar; bu oyunun sürekli çalışan bir WebSocket sunucusuna ihtiyacı var. Daha önce
> takıldığın nokta tam olarak buydu.

Aşağıdakilerden **birini** seç. Üçü de ücretsiz katmanda WebSocket destekler.

### Render (en kolay, hazır yapılandırma var)

1. Projeyi bir GitHub deposuna yükle.
2. [render.com](https://render.com) → **New → Blueprint** → depoyu seç.
3. `render.yaml` otomatik okunur, **Apply** de.
4. `https://air-hockey-xxxx.onrender.com` adresin hazır.

Ücretsiz katman 15 dakika hareketsizlikten sonra uyur; ilk açılış ~30 saniye sürer.

**Güncellemeler nasıl yayına çıkar:** Render, bağlı olduğun dalı (varsayılan `main`)
izler. O dala her `git push`'ta yeni sürümü kendisi derleyip yayına alır — ayrıca bir
şey yapmana gerek yok. Yani bir dalda çalışıp PR açtıysan, **PR'ı `main`'e merge
ettiğin an** dağıtım kendiliğinden başlar; Render panosundaki *Events* sekmesinden
ilerlemesini izleyebilirsin (~1-2 dakika). Otomatik dağıtımı kapattıysan aynı panodan
*Manual Deploy → Deploy latest commit* de diyebilirsin.

Yeni sürüm çıktığında tarayıcıda eski dosyaların takılı kalmaması için `index.html`,
`app.js` ve `style.css` `no-cache` ile sunulur; sayfayı yenilemek yeterlidir.

### Fly.io (uykuya dalmaz, Frankfurt bölgesi = Türkiye'ye düşük ping)

```bash
fly launch --copy-config --now
```

### Railway

Depoyu bağla; kökteki `package.json` otomatik algılanır, ek ayar gerekmez.

### Kendi sunucun (Docker)

```bash
docker build -t air-hockey . && docker run -p 8080:8080 air-hockey
```

Kendi sunucunda çalıştırıyorsan **mutlaka HTTPS/`wss://`** kullan (Caddy veya Nginx ile).
Tarayıcılar `https://` sayfadan `ws://` bağlantısına izin vermez.

---

## 3. iPhone / iPad uygulaması

```bash
open ios/AirHockey.xcodeproj
```

1. **Signing & Capabilities** → *Team* olarak kendi Apple ID'ni seç.
   (`PRODUCT_BUNDLE_IDENTIFIER` çakışırsa `com.airhockey.tr` yerine kendine ait bir şey yaz.)
2. Üstten cihazını seç (iPhone ya da iPad — tek hedef ikisini de derler), **⌘R**.
3. Uygulamada ana menünün altındaki **Ayarlar** satırına dokun → **Sunucu** alanına yayına
   aldığın adresi yaz (`https://air-hockey-xxxx.onrender.com`) → **Kaydet**.

Varsayılan adres `http://localhost:8080`'dir; Xcode simülatöründe hiçbir şey değiştirmeden çalışır.
Gerçek telefonda aynı Wi-Fi'daki bilgisayarını test etmek için `http://192.168.1.20:8080` yazabilirsin —
`Info.plist` yerel ağ için gerekli izni içeriyor. **Genel internete açık sunucun `https://` olmalı.**

Paylaşılan davet linkleri (`airhockey://oda/ABCD`) uygulamayı doğrudan o odada açar.

**iPad:** Hedef `TARGETED_DEVICE_FAMILY = "1,2"` ile derlenir; ayrı bir proje ya da ayrı
bir derleme yok — aynı ikili iPhone'da da iPad'de de çalışır. Uygulama iPad'de menü
sütununu genişletir, yazıları biraz büyütür ve metinleri cihaza göre söyler
("Aynı iPad'de 2 Kişi", "iPad'i 180° çevirin"). Saha 100×200 birimlik dikey bir
dikdörtgen olduğu için uygulama iPad'de de yalnızca dikey çalışır — büyük ekranda
gerçek bir masa boyutunda saha çıkar. Derlemeyi doğrulamak için:

```bash
xcodebuild -project ios/AirHockey.xcodeproj -scheme AirHockey -destination 'generic/platform=iOS' -configuration Release CODE_SIGNING_ALLOWED=NO build
```

---

