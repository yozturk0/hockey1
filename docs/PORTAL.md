# PORTAL — Poki, CrazyGames, itch.io

Okuma sırası: [`../HANDOFF.md`](../HANDOFF.md) → [`ARCHITECTURE.md`](ARCHITECTURE.md) → bu dosya.

---

## 1. Portal ürünü normal oyundan farklıdır

| Eski öncelik | Portal önceliği |
|---|---|
| Arkadaşınla oda kodu paylaş | Tek başına gelen oyuncu **5 saniyede** oynasın |
| Online öncelikli | **Bot öncelikli**, online bonus |
| Ayar zengin | Ayar yok denecek kadar az |
| Dil seçtir | Dil sorma — `navigator.language` |

Bu yüzden menünün ilk butonu **"Oyna"** ve doğrudan bota karşı maç açar;
kurulum ekranı yoktur. Solo hedef 5 gol (online 7).

Gerçek red riski boyut değil **onboarding**'dir. Dil pop-up'ı, oda kodu duvarı
ve tek oyunculu modun yokluğu bu yüzden ilk elde temizlendi.

## 2. Hedefler

| Platform | SDK | Çıktı |
|---|---|---|
| **Poki** | `https://game-cdn.poki.com/scripts/v2/poki-sdk.js` | `portal/build/poki/` |
| **CrazyGames** | `https://sdk.crazygames.com/crazygames-sdk-v3.js` | `portal/build/crazygames/` |
| **itch.io** | yok | `portal/build/itch/itch-air-hockey.zip` |
| Kendi sitesi (Render) | yok | `portal/build/web/` veya doğrudan `web/` |
| iOS | — | `ios/` · bu işten etkilenmez |

**Kritik:** İki portala aynı build gönderilemez. Her portal, rakibinin SDK'sını
içeren build'i reddeder.

**itch.io özel:** oyunu kendi zone alan adında sandbox'lı iframe'de servis eder.
Portal SDK'sı yok (iki portalın da markası yok → temiz), PWA manifest'i anlamsız
(build onu ve apple meta etiketlerini söker). Build, `index.html` kökte olacak
şekilde zip'i kendisi üretir.

## 3. Köprü — `web/sdk.js`

`app.js` **asla** `PokiSDK.` ya da `CrazyGames.` yazmaz. Sadece `AHPortal.*`.
Hedef build zamanında `window.AH_PORTAL` tanımlanarak seçilir; hedefsizken
(kendi sitesi) her çağrı no-op'tur.

İki portal da aynı beş olguyu ister, farklı yazar: yükleme başladı, yükleme
bitti, maç başladı, maç bitti, reklam için iyi an. Köprü bunu tercüme eder.

### Köprüde zorlanan iki kural

Çağıranın iyi niyetine bırakılmaz, çünkü ikisi de doğrudan red sebebidir:

1. **İlk maç bitmeden `commercialBreak()` hiçbir şey yapmaz.**
2. **Reklam boyunca ses kısılır, saha dondurulur** (`hooks.pause/resume/mute/unmute`).

### SDK hiç yüklenmezse

Adblock, CDN hatası, yavaş ağ — hepsinde her şey no-op olur ve oyun aynen
oynanır. **İki portal da bunu şart koşar**; "SDK yok" burada normal bir durum,
hata değil.

Sıra farkı da köprüde: Poki yükleme sinyalini `init()`'ten **önce** alır,
CrazyGames kendi `init()`'i çözülene kadar **hiçbir çağrıyı** kabul etmez.

### Ödüllü reklam: sadece kozmetik

9 top renginden 4'ü serbest, 5'i bir video karşılığı açılır. **Oynanışa etkisi
yok** — "core gameplay'i ödüllü videonun arkasına koyma" kuralı gereği.
Portalsız build'de hepsi zaten açık (izlenecek video yok).

## 4. Yasaklar — ihlal = red

- ❌ Kendi reklam ağı (AdSense / AdMob / herhangi bir tag)
- ❌ Oyun içinden dış link — Poki'de zorunluysa `PokiSDK.openExternalLink()`
- ❌ Kendi IAP / ödeme akışı
- ❌ Giriş / kayıt / e-posta duvarı
- ❌ Başka portalın markası, logosu, SDK'sı
- ❌ **İlk maçtan önce reklam** — en sık red sebebi
- ❌ Harici analytics (GA, Mixpanel…)
- ❌ SDK dışında harici istek — Poki hepsini varsayılan olarak engeller

Tarama yapıldı, ihlal bulunmadı. Yeni bir özellik eklerken bu liste tekrar
gözden geçirilmeli.

## 5. Build sistemi

```bash
npm run build                # dört hedef + boyut raporu
npm run build:itch           # sadece itch zip'i
node portal/build.js poki    # tek hedef
```

Tek kaynak ağacı: `web/` hem geliştirme hem kaynak. `portal/` yalnızca build
betiğini ve çıktıyı tutar. Portal kodu (`sdk.js`) `web/` içinde yaşar çünkü
oyunun istemcisinin parçasıdır ve hedefsizken tamamen no-op'tur.

### Online sunucu adresi build zamanında verilir

`web/` dışındaki her build **başka birinin alan adından** servis edilir (portal
CDN'i, `html-classic.itch.zone`), yani aynı-origin soket tahmini yanlış hedefe
gider. Çözüm sırası: `?server=` → `window.AH_WS` → aynı origin.

```bash
AH_WS=wss://senin-app.onrender.com/ws npm run build
```

`AH_WS` verilmezse portal/itch build'lerinde online mod çalışmaz; solo ve
aynı-cihaz modları etkilenmez (hiç soket açmıyorlar).

## 6. Ölçümler

Başlangıç (değişiklik öncesi, minify yok, sunucuda sıkıştırma yok):
ham ~125 KB / gzip ~37 KB.

Şimdi (`npm run build`):

| Hedef | Ham | gzip | brotli |
|---|---:|---:|---:|
| poki | 86.7 KB | **27.6 KB** | **24.3 KB** |
| crazygames | 86.7 KB | 27.6 KB | 24.3 KB |
| itch | 86.7 KB | 27.6 KB | 24.3 KB |
| web (PWA ikonları dahil) | ~109 KB | ~49 KB | ~46 KB |

Portala yüklenen sütun gzip/brotli'dir. Poki hedefi "10 saniyenin altında
yüklensin"; 24 KB yavaş 3G'de bile 1 saniyenin altında. Boyut hedefi
(<5 MB, ideal <3 MB) ~125 kat aşıldı.

Sunucu ayrıca brotli/gzip uyguluyor: `app.js` 53.7 KB → 14.5 KB.

## 7. Başvuru öncesi kontrol listesi

- [ ] `npm test` temiz (50/50)
- [ ] `npm run build` boyut tablosu beklenen aralıkta
- [ ] Doğru hedefin build'i gönderiliyor — rakip SDK yok
- [ ] `AH_WS` verildi (online modun çalışması isteniyorsa)
- [ ] İlk maçtan önce reklam çıkmıyor (adblock açıkken de test et)
- [ ] SDK engellenmişken oyun tam oynanıyor
- [ ] Dış link, giriş duvarı, analytics yok
- [ ] **Poki:** multiplayer alan adı whitelist talebi başvuru metnine yazıldı
- [ ] Kapak görseli 1600×900 + kare, 2–4 ekran görüntüsü hazır
- [ ] Gerçek cihazda oynanış denendi (açık iş #12)
