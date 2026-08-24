# Air Hockey — Online (Türkçe)

Oda kodu paylaşarak oynanan gerçek zamanlı hava hokeyi. **Kayıt yok, hesap yok, indirme zorunluluğu yok.**
Web tarayıcısındaki bir oyuncu ile iPhone uygulamasındaki bir oyuncu **aynı maçta** oynayabilir.

```
hockey1/
├── server/server.js      Otoriter WebSocket sunucusu + statik site servisi
├── web/                  Tarayıcı istemcisi (site burası)
│   └── engine.js         Fizik motoru — sunucu da bu dosyayı kullanır
├── ios/                  Xcode projesi (SwiftUI, yerel)
├── test/                 Motor + sunucu testleri
└── Dockerfile, fly.toml, render.yaml
```

---

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

## 3. iPhone uygulaması

```bash
open ios/AirHockey.xcodeproj
```

1. **Signing & Capabilities** → *Team* olarak kendi Apple ID'ni seç.
   (`PRODUCT_BUNDLE_IDENTIFIER` çakışırsa `com.airhockey.tr` yerine kendine ait bir şey yaz.)
2. Üstten telefonunu seç, **⌘R**.
3. Uygulamada ana menüdeki **⚙️** simgesine dokun → **Sunucu adresi** alanına yayına aldığın
   adresi yaz (`https://air-hockey-xxxx.onrender.com`) → **Kaydet**.

Varsayılan adres `http://localhost:8080`'dir; Xcode simülatöründe hiçbir şey değiştirmeden çalışır.
Gerçek telefonda aynı Wi-Fi'daki bilgisayarını test etmek için `http://192.168.1.20:8080` yazabilirsin —
`Info.plist` yerel ağ için gerekli izni içeriyor. **Genel internete açık sunucun `https://` olmalı.**

Paylaşılan davet linkleri (`airhockey://oda/ABCD`) uygulamayı doğrudan o odada açar.

---

## 4. Nasıl oynanır

**Online:** Bir oyuncu *Online Oyna → Oda Oluştur* der, 4 haneli kodu alır ve arkadaşına
gönderir (Paylaş düğmesi hazır bir davet metni üretir). Diğeri kodu girip *Katıl* der.
İki taraf da kendi ekranının **alt yarısında** kendini görür — kimse ters oynamaz.

**Aynı telefonda 2 kişi:** Telefonu masaya koyun. Alt yarı bir oyuncunun, üst yarı diğerinin.
Aynı anda iki parmak çalışır.

**Bitiş skoru:** Maç başlamadan önce **5 / 6 / 7 / 8** seçebilir ya da kutuya
istediğin sayıyı (1–15) yazabilirsin. Online oyunda skoru oda sahibi belirler.
Seçtiğin skorun altında *"4 golde devre → 7 golde biter"* satırı, maçın nasıl
ilerleyeceğini önceden gösterir.

**Devre:** Aynı telefondaki maçlarda, önde giden oyuncu bitiş skorunun yarısına
(`ceil(hedef / 2)`) ulaştığında maç durur ve **telefonu 180° çevirin** ekranı gelir.
Uyarı ekranın iki ucuna da basılır, böylece karşılıklı oturan iki oyuncu da düz okur.
*Çevirdik, Devam* denince saha da, skor tablosu da yarım tur döner: alt yarı yukarı,
üst yarı aşağı geçer. Böylece ekranın bir yanındaki dokunmatik farkları maçın
tamamını etkilemez — herkes iki tarafı da oynar. Devre bir maçta bir kez olur.

**Ayarlar (⚙️):**

| Ayar | Ne işe yarar |
|---|---|
| **Zemin** | Krem · Buz · Çim · Gece. İlk üçü açık ve sade — çocuklar için daha rahat okunur. Gece, eski neon görünüm. |
| **Top rengi** | Tema · Siyah · Kırmızı · Turuncu · Sarı · Yeşil · Mavi · Mor · Beyaz. *Tema*, seçtiğin sahaya uygun olanı kullanır. Top hangi renkte olursa olsun ince bir kontur alır, böylece koyu sahada siyah top da kaybolmaz. |
| **Sopa boyutu** | Mini / Küçük / Orta / Büyük. Parmağın sopayı tamamen kapatıyorsa küçült. Online oyunda odayı kuranın seçimi iki oyuncu için de geçerlidir. |
| **Parmak boşluğu** | Sopa, parmağının biraz ilerisinde durur; parmağın altında kaybolmaz. Kapalı / Az / Orta / Çok. |

Ayarlardaki önizlemede parmağını sürükleyerek dene: kesikli daire parmağının
gerçek temas alanını gösterir.

Topun arkasındaki hareket hüzmesi, **topa en son vuran sopanın rengini** alır ve
toptan çok daha saydamdır — havadaki şutun kimin olduğu bir bakışta okunur.

Bütün bunlar **iOS uygulamasında da aynen** var: aynı zeminler, aynı top renkleri,
aynı sopa/parmak ayarları, aynı devre akışı. Uygulamada ana menünün altındaki
⚙️ satırına dokun.

Rakip bağlantısı koparsa maç duraklar, skorlar korunur ve aynı kodla geri dönebilir.

---

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

Sopa yarıçapı artık maça özeldir (`new Game({ target, padR, halftime })`); sunucu
oda kurulurken oda sahibinden alır ve iki istemciye de bildirir.

---

## 6. Takılırsan

| Belirti | Sebebi |
|---|---|
| "Sunucuya bağlanılıyor…" hiç geçmiyor | Sunucu çalışmıyor ya da adres yanlış. `/health` adresini aç. |
| `https://` sayfada bağlanmıyor | Sunucun `wss://` desteklemiyor. TLS şart. |
| iPhone yerel IP'ye bağlanmıyor | Telefon ile bilgisayar aynı Wi-Fi'da mı? Güvenlik duvarı 8080'i kapatıyor olabilir. |
| Oda kodu bulunamıyor | Odalar boş kaldıktan 90 sn sonra silinir; kurulan ama girilmeyen odalar 15 dk sonra. |
| Ping yüksek | Sunucu bölgesini oyuncularına yakın seç (Fly.io için `fra`). |
