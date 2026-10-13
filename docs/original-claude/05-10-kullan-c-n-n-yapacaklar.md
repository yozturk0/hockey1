<!-- split: part 5 of 5 of ORIGINAL_CLAUDE.md | index: ../ORIGINAL_CLAUDE.md | added-lines: none -->

## 10. Kullanıcının yapacakları

1. **Poki hesabı** — review'da. Onaydan sonra oyun kaydı açılınca SDK URL'si
   verilir; genel URL zaten build'de, oyuna özelse değiştirilecek.
2. **CrazyGames hesabı** — açılıyor.
3. **Render keep-alive** — cron-job.org'da 10 dk'da bir `GET /ping`.
4. **Kapak görseli** 1600×900 + kare, 2-4 ekran görüntüsü.
5. **İsim kararı** (öneriler final raporda).
6. **Poki başvurusunda multiplayer alan adı whitelist talebi** (bkz. 8.1).

---

## 11. Komutlar

```bash
npm start          # dev sunucu → http://localhost:8080
npm test           # motor + koordinat testleri
npm run test:server# uçtan uca soket + koltuk testleri (sunucu ayakta olmalı)
npm run build      # dört build (web/poki/crazygames/itch) + boyut raporu
npm run build:itch # sadece itch.io zip'i
node portal/build.js poki    # tek hedef

# online modun portal/itch build'inde çalışması için:
AH_WS=wss://senin-app.onrender.com/ws npm run build
```

---

## 12. Karar günlüğü

- **2026-08-27** — Repo okundu. Ses/görsel sıkıştırma ve texture atlas işleri
  **konusuz** çıktı: projede hiç ses/görsel asset yok. Boyut hedefi zaten
  ~80 kat aşılmıştı. 1. işin kapsamı minification + build sistemine daraltıldı.
- **2026-08-27** — Gerçek red riskinin boyut değil **onboarding** olduğu
  tespit edildi (dil pop-up'ı, oda kodu duvarı, tek oyunculu mod yok).
  Öncelik sırası buna göre yeniden dizildi ve kullanıcı onayladı.
- **2026-08-27** — K1 revize: portal kodu ayrı klasör yerine `web/sdk.js`.
- **2026-08-27** — Poki + CrazyGames resmi dokümantasyonu okundu, API'ler
  doğrulandı. Poki'nin "harici istekler varsayılan olarak engelli" kuralı
  keşfedildi → 8.1 açık konusu.
- **2026-08-27** — Bot adaptif zorluk aralığı 0.12–0.70'e kilitlendi; üst uçta
  maçlar kilitleniyordu.
- **2026-08-27** — itch.io dördüncü hedef olarak eklendi (zip çıktısı). Aynı
  işte online modun portal build'lerinde de kırık olduğu fark edildi: soket
  adresi aynı-origin tahmin ediliyordu → `AH_WS` build değişkeni (K8).
- **2026-08-28** — Çevrimdışı modların donması **render katmanında** çıktı,
  fizikte veya botta değil: 40 maçlık başsız `Engine`+`Bot` simülasyonu tek bir
  kilitlenme veya çökme vermedi. Asıl kanıt `simctl` ekran görüntülerinin
  bayt bayt aynı çıkması + `tick`'in 60 fps loglaması oldu (K12).
- **2026-08-27** — Fizik temposuna **dokunulmadı**: gameplay kararı, kullanıcıya
  bırakıldı (8.2).
