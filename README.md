# Air Hockey — Online (Türkçe)

Oda kodu paylaşarak oynanan gerçek zamanlı hava hokeyi. **Kayıt yok, hesap yok, indirme zorunluluğu yok.**
Web tarayıcısındaki bir oyuncu ile iPhone/iPad uygulamasındaki bir oyuncu **aynı maçta** oynayabilir.

```
hockey1/
├── server/server.js      Otoriter WebSocket sunucusu + statik site servisi
├── web/                  Tarayıcı istemcisi (site burası)
│   └── engine.js         Fizik motoru — sunucu da bu dosyayı kullanır
├── ios/                  Xcode projesi (SwiftUI; tek hedef, iPhone + iPad)
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

## 4. Nasıl oynanır

**Online:** Bir oyuncu *Online Oyna → Oda Oluştur* der, 4 haneli kodu alır ve arkadaşına
gönderir (Paylaş düğmesi hazır bir davet metni üretir). Diğeri kodu girip *Katıl* der.
İki taraf da kendi ekranının **alt yarısında** kendini görür — kimse ters oynamaz.

**Aynı telefonda 2 kişi:** Telefonu (ya da iPad'i) masaya koyun. Alt yarı bir oyuncunun,
üst yarı diğerinin. Aynı anda iki parmak çalışır.

### Modlar

| Mod | Ne değişir |
|---|---|
| **Klasik** | Kurallar maç boyunca sabit. Standart hava hokeyi. |
| **Şanslı** | Maç aynı sahada, aynı ayarlarla oynanır; arada küçük ve kısa süreli sürprizler çıkar. |

**Şanslı mod** ne yapar: oyun canlıyken yaklaşık 6,5–9 saniyede bir küçük bir olay
tetiklenir ve 6 saniye sürer.

- Bir oyuncunun sopası **%18 büyür** ya da **%15 küçülür**.
- Ya da **buz değişir**: kaygan buzda top daha uzun kayar, ağır buzda daha çabuk durur
  (bu ikisi iki oyuncuyu da eşit etkiler).

Kişisel etkiler karıştırılmış bir torbadan çekilir: her dört çekilişte **her oyuncu bir
büyüme ve bir küçülme** alır, yani şans uzun vadede kimseye yontmaz. Etkiler bilerek
küçük tutulmuştur — bir ralliyi renklendirir, maçı belirlemez. Her golden sonra bütün
etkiler sıfırlanır, yani hiçbir avantaj bir sonraki başlama vuruşuna taşınmaz.

Mod seçimi **hem aynı cihazda hem online** geçerlidir; online oyunda odayı kuran seçer
ve iki istemciye de bildirilir. Fizik sunucuda koştuğu için sopa boyutları her karede
anlık görüntüyle birlikte gelir — iki oyuncu asla farklı bir sopa görmez.

### Başlama vuruşu

Her başlama vuruşundan önce **3 – 2 – 1** sayımı akar (toplam 2,5 saniye) ve bu sürede
**iki sopa da kilitlidir**: sopalar kendi başlangıç noktalarında durur, girdi yok
sayılır. Böylece sayım sırasındaki kaydırmalar lag gibi görünmez ve top canlanır
canlanmaz tam hızda süzülen bir sopayla bedava şut atılamaz. Aynı sayım maç başında,
her golden sonra ve devre arasından dönüşte kullanılır.

**Bitiş skoru:** Maç başlamadan önce **5 / 6 / 7 / 8** seçebilir ya da kutuya
istediğin sayıyı (1–15) yazabilirsin. Online oyunda **bütün kuralları** (bitiş skoru,
mod, devre arası) oda sahibi belirler; lobide değiştirebilir, rakibe anında yansır ve
rakip aynı kuralları soluk (değiştirilemez) halde görür.
Seçtiğin skorun altında *"4 golde devre → 7 golde biter"* satırı, maçın nasıl
ilerleyeceğini önceden gösterir.

**Devre:** Açık olduğunda, önde giden oyuncu bitiş skorunun yarısına
(`ceil(hedef / 2)`) ulaştığında maç durur. Devre arası artık **iki modda da, hem aynı
cihazda hem online** çalışır ve kurulum ekranından kapatılabilir.

*Aynı cihazda:* **telefonu/iPad'i 180° çevirin** ekranı gelir. Uyarı ekranın iki ucuna
da basılır, böylece karşılıklı oturan iki oyuncu da düz okur. *Çevirdik, Devam* denince
saha da, skor tablosu da yarım tur döner: alt yarı yukarı, üst yarı aşağı geçer.
Böylece ekranın bir yanındaki dokunmatik farkları maçın tamamını etkilemez.

*Online:* çevrilecek bir cihaz yok, o yüzden devre sadece kısa bir moladır. İki oyuncu
da **Hazırım** deyince ikinci yarı başlar; biri masadan kalkarsa maç 25 saniye sonra
kendiliğinden devam eder, yani kimse diğerini rehin tutamaz.

Devre bir maçta bir kez olur.

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
aynı sopa/parmak ayarları, aynı modlar, aynı devre akışı. Uygulamada ana menünün
altındaki **Ayarlar** satırına dokun.

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
