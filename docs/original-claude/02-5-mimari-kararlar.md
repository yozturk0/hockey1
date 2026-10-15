<!-- split: part 2 of 5 of ORIGINAL_CLAUDE.md | index: ../ORIGINAL_CLAUDE.md | added-lines: none -->

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

### K9b — Koltuk sahipliği istemci kimliğiyle
Sunucu `join`'de **boş olan ilk koltuğu** veriyordu. Odayı kuran kişi yenileme
tuşuna bastığında kendi odasına **b** olarak dönüyor, host'luğu ve kural
kontrolünü kaybediyordu. Artık istemci kalıcı bir `pid`'i soket adresinde
yolluyor (`/ws?pid=…`), sunucu `room.owners` ile kimin hangi koltukta olduğunu
hatırlıyor ve dönen oyuncuya **kendi koltuğunu** geri veriyor.

Aynı işte `peer` mesajı düzeltildi: eskiden `broadcast` ile **odaya giren
kişinin kendisine de** gidiyordu, bu yüzden kendi boş lobisine yeniden bağlanan
oyuncuya "arkadaşın katıldı!" çıkıyordu. Artık sadece karşı koltuğa gidiyor.
`test/seat.test.js` bu iki davranışı kilitliyor.

### K10 — iOS'ta bot (web ile eşitlik)
`web/bot.js` → `ios/AirHockey/Bot.swift` birebir portlandı (aynı sayılar, aynı
0.12–0.70 uyum bandı). iOS menüsünün ilk butonu artık web'deki gibi **"Oyna"**:
kurulum ekranı yok, doğrudan bota karşı 5 gollük maç. `Engine.swift` fiziğine
dokunulmadı — bot da tıpkı parmak gibi sadece `setInput` çağırıyor.

### K11 — Neon parlaması filtre değil, halka
SwiftUI `Canvas` içinde `addFilter(.shadow:)` **her çağrı için** ayrı bir
offscreen buffer + Gaussian blur demek, ve her karede beşi birden vardı
(iki kale, iki sopa, top). Yerine üç düz halka/kalın çizgi kondu; koyu temada
göz aynı şeyi görüyor, kare başına beş offscreen gitti. Sahanın iç yarı
tonlaması da `drawLayer`+`clip` yerine köşeleri yuvarlatılmış path'e çevrildi.

