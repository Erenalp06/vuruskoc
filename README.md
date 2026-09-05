# VuruşKoç

**AI destekli tenis vuruş koçu — analiz tamamen cihazında çalışır, video hiçbir yere yüklenmez.**

Bir vuruş videosu seç, tek vuruşu kes, analiz et: iskelet çıkarımı, eklem açıları,
temas anı, 0–100 SwingScore, Türkçe koçluk ve bir pro oyuncuyla hayalet-overlay
karşılaştırması — hepsi tarayıcıda, sunucusuz, çevrimdışı çalışabilir.

Canlı: **https://ai.vuruskoc.com**

![VuruşKoç — analiz sonucu ekranı](docs/result.png)

---

## Nasıl çalışıyor

```
Tarayıcı (React SPA)
  ├─ <video> seçili aralığı kare kare <canvas>'a çizer        (ffmpeg yok, upload yok)
  ├─ MediaPipe Pose Landmarker (WASM + GPU)  → 33 eklem
  └─ web/src/engine/  (Python pipeline'ın TS portu)
        bilek hızı → faz segmentasyonu → temas karesi
        → eklem açıları → THETIS-kalibreli skor → koçluk metni
        → işaretli video + pro hayalet-overlay  (canvas → webm)
  IndexedDB'de yerel geçmiş.  Sunucu yok.
```

`server/` (Go + Postgres) yalnızca yerel geliştirme ve ileride hesap / cihazlar-arası
senkron için opsiyonel bir katman; analiz yolu ona hiç dokunmaz.

## Özellikler

- **Cihaz-içi analiz** — video telefondan çıkmaz, offline çalışır, PWA olarak kurulur
- **Kes & analiz et** — zaman çizelgesinde tek vuruşu seç (filmstrip önizleme)
- **SwingScore + koçluk** — forehand / backhand / servis; TR / EN rapor
- **Öncelikli düzeltmeler** — her düzeltmeye ait yavaş çekim pro drill klibi
- **Pro ile karşılaştır** — kendi iskeletin + pronunki, kalçadan hizalı, temasta senkron
- **Yerel geçmiş** — güne göre gruplu, ilerleme grafiği

## Geliştirme

Gereksinimler: Node 18+ (build'de `--experimental-global-webcrypto`; Node 20+ ile gerekmez).

```bash
cd web
npm ci
npm run dev          # http://localhost:5180
npm run build        # -> web/dist  (prebuild wasm'ı kopyalar + modeli indirir)
```

Opsiyonel Go backend (yerel):

```bash
sudo -u postgres psql -c "create role vuruskoc login password 'vuruskoc_dev'"
sudo -u postgres psql -c "create database vuruskoc owner vuruskoc"
cd server && DATABASE_URL=postgres://vuruskoc:vuruskoc_dev@127.0.0.1:5432/vuruskoc go run .
```

Python tarafı (kalibrasyon / pro veri çıkarma / drill klipleri):

```bash
python -m venv venv && ./venv/bin/pip install -r requirements.txt
./venv/bin/python -m analyzer.run KLIP.mp4 --stroke forehand --lang tr
./venv/bin/python tools/calibrate.py --videos data/thetis --out calibration.csv
./venv/bin/python tools/extract_pro_keypoints.py --local KLIP.mp4 --name djokovic_forehand --contact 35
```

## Deploy

Statik PWA → herhangi bir HTTPS host. Ayrıntı: [`web/DEPLOY.md`](web/DEPLOY.md).
Cloudflare Pages / Netlify: build `npm --prefix web ci && npm --prefix web run build`,
output `web/dist`.

## Doğruluk / sınırlar

- Skor tek klipte **hassas bir not değil**, aggregate'te "iyiyi kötünün üstüne sıralar"
  (THETIS expert-vs-beginner AUC ~0.71). Birden çok vuruşun ortalamasına bak.
- Topsuz gölge vuruşlarda temas anı yalnızca kinematik bir tahmindir.
- Otomatik forehand/backhand ayrımı önden çekimde zayıf — `--stroke` / "Vuruş tipi" ile seç.
- Pro referans verisi düşük çözünürlüklü 2D koçluk kliplerinden çıkarıldı; kendi
  pipeline'ımızla aynı kısıtları taşır.

## Kredi

VuruşKoç, [SinbadSails/SwingForge](https://github.com/SinbadSails/SwingForge) (MIT)
projesinin bir fork'u olarak başladı; o da
[abdullahtarek/tennis_analysis](https://github.com/abdullahtarek/tennis_analysis)
üzerine kuruluydu. Eklenenler: cihaz-içi TS motoru, THETIS ile skor kalibrasyonu,
pro hayalet-overlay, PWA, yeni arayüz ve opsiyonel Go backend. Ayrıntı: [`NOTICE`](NOTICE).

## Lisans

[AGPL-3.0-or-later](LICENSE). Kullanabilir, değiştirebilir, kendin barındırabilirsin;
ancak değiştirilmiş bir sürümü **dağıtır ya da bir ağ servisi olarak çalıştırırsan**
kaynak kodunu aynı lisansla yayımlaman gerekir.
