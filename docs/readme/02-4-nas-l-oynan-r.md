<!-- split: part 2 of 3 of README.md | index: ../../README.md | added-lines: none -->

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

