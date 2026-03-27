# Instagram Tool

`instagrapi` kütüphanesi üzerine inşa edilmiş FastAPI backend + Web Dashboard + Chrome uzantısı.

---

## Proje Yapısı

```
instagrapi/
├── .venv/                         ← sanal ortam (paylaşımlı)
└── instagram-tool/
    ├── run.py                     ← tek komutla başlatıcı
    ├── backend/
    │   ├── main.py                # FastAPI sunucusu
    │   ├── requirements.txt       # Python bağımlılıkları
    │   ├── session.json           # Oturum bilgisi (otomatik oluşur)
    │   ├── publish_queue.json     # Zamanlı paylaşım kuyruğu
    │   └── uploads/               # Geçici yükleme klasörü
    ├── web/
    │   ├── index.html
    │   ├── app.js
    │   └── style.css
    └── extension/
        ├── manifest.json
        ├── background.js
        ├── popup.html
        ├── popup.js
        ├── content.js
        └── insta.png
```

---

## Başlatma

```bash
python3 instagrapi/instagram-tool/run.py
```

`run.py` otomatik olarak:
1. `instagrapi/.venv` sanal ortamını kontrol eder, yoksa oluşturur
2. Gerekli paketleri kurar
3. Boşta olan bir port bulur (8000–9000 arası)
4. FastAPI sunucusunu başlatır
5. Tarayıcıda web arayüzünü otomatik açar

---

## Chrome Uzantısı Kurulumu

1. Chrome'da `chrome://extensions` adresine git
2. Sağ üstten **Developer mode**'u aç
3. **Load unpacked** butonuna tıkla
4. `instagrapi/instagram-tool/extension` klasörünü seç

Uzantı, backend portu değişse bile otomatik olarak doğru portu bulur (8000–8010 arası tarar).

---

## Web Dashboard Sayfaları

### Dashboard
- Takipçi, takip, gönderi istatistik kartları
- Akıllı arama: URL / `@kullanıcı` / `#hashtag` / konum

### Profil Ara
- Kullanıcı adı ile profil arama
- Takip et / Takibi bırak / Takipçileri Gör / Takip Ettikleri

### İndir
- Post / Reel / Video / Albüm / Story indirme
- URL girilince otomatik önizleme kartı
- Hashtag ve konum bazlı medya arama
- Son indirilenler bölümü

### İndirilenler
- Tüm indirilen dosyalar thumbnail, boyut, tarih ile listelenir
- Fotoğraf / Video filtresi
- Klasörde göster (Finder) ve dosya silme

### Kayıtlılar
- Kayıtlı gönderiler ve koleksiyon sekmeleri
- Çek dropdown: 20 / 50 / 100 / 200 / Hepsini
- Toplu indirme ve kayıtlıdan kaldırma

### Takipçiler
- Takipçilerim / Takip Ettiklerim / Geri Takip Etmeyenler / Karşılıklı sekmeleri
- CSV'den toplu takipten çıkarma
- Filtreleme, sıralama, CSV dışa aktarma

### Keşfet
- `#hashtag`, `@kullanıcı`, konum adı ile arama ve medya grid

### Mesajlar
- DM gönder, gelen kutusunu görüntüle

### Zamanlayıcı
- Belirli kullanıcılar için otomatik story indirme
- Dakika bazlı aralık ayarı

### Paylaş
- **Medya tipleri:** Fotoğraf, Video, Reel, Albüm (maks 10), Story Foto, Story Video
- Drag & drop veya tıkla dosya yükleme, anlık önizleme
- Caption editörü (2200 karakter limiti)
- Konum arama ve etiketleme
- Kullanıcı etiketleme (@mention)
- **Zamanlı paylaşım:** tarih/saat seç, arka planda otomatik paylaşılır
- Paylaşım kuyruğu: durum takibi (Zamanlandı / Paylaşıldı / Hata)

---

## Chrome Uzantısı Özellikleri

- Akıllı arama: URL / `@kullanıcı` / `#hashtag` / konum
- URL girilince otomatik önizleme kartı
- Kayıtlı gönderileri görüntüle ve indir
- İndirilen dosyalar listesi
- Instagram sayfasında indirme butonu:
  - Feed: her post'un action bar'ında ⬇ butonu
  - Post/Reel modal: bookmark yanında ⬇ butonu
  - Reels sayfası: video üzerinde sağ alt köşede ⬇ overlay

---

## API Endpoint'leri

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | `/login` | Giriş yap |
| POST | `/logout` | Çıkış yap |
| GET | `/me` | Oturum bilgisi |
| POST | `/challenge/submit` | 2FA/challenge kodu doğrula |
| GET | `/profile/{username}` | Profil bilgisi |
| GET | `/friendship/{username}` | Takip durumu |
| POST | `/follow` | Takip et |
| POST | `/unfollow` | Takibi bırak |
| POST | `/remove-follower` | Takipçiyi çıkar |
| GET | `/followers/{username}` | Takipçi listesi |
| GET | `/following/{username}` | Takip listesi |
| POST | `/followers/page` | Sayfalı takipçi çekme |
| POST | `/following/page` | Sayfalı takip çekme |
| POST | `/download/post` | Post / Reel / Albüm indir |
| GET | `/download/stories/{username}` | Story indir |
| POST | `/media/info` | Medya önizleme bilgisi |
| GET | `/saved` | Kayıtlıları listele |
| GET | `/saved/collections` | Koleksiyonları listele |
| GET | `/saved/collection/{pk}` | Koleksiyon medyaları |
| POST | `/download/saved` | Kayıtlıyı indir |
| POST | `/unsave` | Kayıtlıdan kaldır |
| GET | `/search/users/{query}` | Kullanıcı ara |
| POST | `/search/hashtag` | Hashtag ara |
| GET | `/search/location/{query}` | Konum ara |
| GET | `/location/medias/{pk}` | Konuma ait medyalar |
| GET | `/downloads/list` | İndirilen dosyaları listele |
| DELETE | `/downloads/file/{path}` | İndirilen dosyayı sil |
| GET | `/downloads/open-folder` | Klasörü Finder'da aç |
| GET | `/inbox` | Gelen kutusu |
| POST | `/dm/send` | DM gönder |
| POST | `/schedulers` | Zamanlayıcı ekle |
| GET | `/schedulers` | Zamanlayıcıları listele |
| DELETE | `/schedulers/{username}` | Zamanlayıcı sil |
| POST | `/publish/upload` | Tekli dosya yükle |
| POST | `/publish/upload-album` | Albüm dosyaları yükle |
| POST | `/publish/now` | Hemen paylaş |
| POST | `/publish/schedule` | Zamanlı paylaşım ekle |
| GET | `/publish/queue` | Paylaşım kuyruğunu listele |
| DELETE | `/publish/queue/{id}` | Kuyruktan sil |
| GET | `/proxy/image` | Instagram CDN resim proxy |

---

## İndirme Klasörleri

```
~/Downloads/instagram/
├── (post ve reeller)
├── stories/
├── saved/
└── scheduled/{username}/
```

---

## Notlar

- `run.py` her çalıştırmada boşta port arar — sabit port gerekmez
- Instagram challenge / 2FA gelirse giriş ekranında otomatik doğrulama kutusu açılır
- Çok fazla istek atılırsa Instagram geçici olarak hesabı kısıtlayabilir
- Zamanlı paylaşım worker'ı 30 saniyede bir kuyruğu kontrol eder
