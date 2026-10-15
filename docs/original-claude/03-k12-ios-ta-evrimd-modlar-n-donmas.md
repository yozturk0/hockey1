<!-- split: part 3 of 5 of ORIGINAL_CLAUDE.md | index: ../ORIGINAL_CLAUDE.md | added-lines: none -->

### K12 — iOS'ta çevrimdışı modların donması: Canvas yeniden çizilmiyordu
Bot ve aynı-cihaz maçları "3-2-1" biter bitmez **ekranda** donuyordu. Motor
donmuyordu: `tick` 60 fps koşuyor, puck ilerliyordu (log ile doğrulandı) —
çizilmiyordu.

Sebep: `GameView` sahayı `TimelineView(.animation) { _ in Canvas { … } }`
içinde çiziyor ve **timeline bağlamını kullanmıyordu**. `world` bilerek
`@Published` değil (K: kare başına yayın SwiftUI'yi boğar), dolayısıyla kapanışın
girdilerinin hiçbiri kareden kareye değişmiyor → SwiftUI `Canvas`'ı yeniden
çizmeye gerek duymuyor. **Online bunu gizliyordu:** `snap` @Published ve saniyede
onlarca kez geliyor, görünümü yeniden yayınlıyordu. Çevrimdışı modlar hiçbir şey
yayınlamadığı için saha ekranda kalakalıyordu.

Çözüm: `tl.date` çizim çağrısına `at:` olarak geçiriliyor. Değeri okunmuyor;
kapanışın her kare gerçekten farklı olmasını sağlamak için var. Bu, önceki
oturumdaki "5 fps" gözlemini de açıklıyor — kare hızı değil, seyrek geçersiz
kılmaydı.

### K13 — Solo maç da oyuncunun kurallarıyla oynanır
"Oyna" anında başlar (K3 korunuyor) ama artık sabit 5 gol / klasik değil:
`Prefs.soloTarget / soloMode / soloHalf` Ayarlar'daki **"Bilgisayara karşı"**
kartından seçilir ve hatırlanır. Varsayılanlar eskisiyle aynı (5 gol, klasik,
devre yok), yani kurulum ekranı olmadan da tek tuşla oynanır. Aynı-cihaz modu
zaten `LocalView` ile tam eşitti; bu, soloyu da o seviyeye çıkarıyor.
Çevrimdışı modların hiçbiri soket açmıyor — `net.connect()` yalnızca açık online
eylemlerinde çağrılıyor (doğrulandı).

### K14 — Bot bir imleç değil, bir kol (web + iOS)
Bot "piksel piksel" titriyordu. Sebep zorlukta değil, **hareket katmanındaydı**:
`plan()` her yeniden nişanda (~40-190 ms) **taze bir rastgele sapma** üretip
hedefe anında uyguluyordu; sopa da hedefe sabit hızla gidip **tam üstünde
duruyordu**. Yani her ~100 ms'de bir ışınlanma + tam duruş = görsel titreşim.

Üç değişiklik (ikisi de aynı sayılarla, `web/bot.js` ↔ `Bot.swift`):
- **Nişan hatası sürüklenme oldu.** Ornstein-Uhlenbeck adımı (`WANDER_TAU`
  = 0.55 sn). Uzun vadeli yayılım eskisiyle aynı, ama sapma kareler *arasında*
  yürüyor → yanlış tahmin "yanlış hamle" gibi görünüyor, "tik" gibi değil.
- **Plana yumuşak geçiş** (`track`, 6-14 1/s): el yeni plana ışınlanmaz, yaslanır.
- **Momentum** (`accel`, 8-21 1/s) + varış yavaşlaması (`ARRIVE` = 0.09 sn):
  sopa tek karede yön değiştiremez, hedefe çarparak durmaz.

Ölçüm (600 sn'lik başsız maç, kare başına ortalama ivme değişimi):
eski **28-46** → yeni **2-4** birim/s². Anlamlı yön dönüşü (>20 birim/s)
saniyede 0. Zorluk tablosu (`reactMs/speed/error/read/lazy`) ve 0.12-0.70
uyum bandı **değişmedi** — bu bir denge ayarı değil, hareket düzeltmesi.

### K15 — iOS 120 Hz: eksik olan tek şey plist anahtarıydı
`Ticker` zaten `CAFrameRateRange(60...120, preferred: 120)` istiyordu, ama
iOS bunu **`CADisableMinimumFrameDuration`** olmadan yok sayıp her uygulamayı
ProMotion cihazlarda 60 Hz'e kilitliyor. Anahtar `AirHockey-Info.plist`'e
eklendi (derlenmiş `.app`'in Info.plist'inde doğrulandı). Aynı anahtar
`TimelineView(.animation)` çizim zamanlayıcısını da 120'ye çıkarır — yani
hem fizik hem çizim: iPhone 13 Pro/Pro Max, 14 Pro/Pro Max, 15 Pro/Pro Max,
16 Pro/Pro Max ve 17 / 17 Pro ailesinin tamamı. ProMotion olmayan modeller
(13/14 standart, 15/16 standart) 60 Hz'de kalır — donanım sınırı.

Fizik zaten kare hızından bağımsız: `Engine.step(dt:)` sabit adım kullanmıyor,
alt-adım sayısını harekete göre seçiyor. 60 vs 120 Hz simülasyonu aynı maç
akışını verdi.

### K7 — Ödüllü reklam: sadece kozmetik
9 top renginden 4'ü serbest, 5'i bir video karşılığı açılır. **Oynanışa etkisi
yok** — "core gameplay'i ödüllü videonun arkasına koyma" kuralı gereği.
Portalsız build'de hepsi zaten açık (izlenecek video yok).

---

