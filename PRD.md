# Discord Müzik Botu - Ürün Gereksinim Dokümanı (PRD)

## 1. Proje Özeti ve Hedefler

### 1.1 Proje Özeti
TypeScript kullanılarak geliştirilecek Discord müzik botu, kullanıcıların Discord sunucularında müzik dinleme deneyimini geliştirecek kapsamlı bir çözümdür. Bot, Spotify ve YouTube platformlarıyla tam entegrasyon sağlayarak, yaş kısıtlamalı içerikler dahil olmak üzere geniş bir müzik kütüphanesine erişim imkanı sunacaktır.

### 1.2 Ana Hedefler
- **Platform Entegrasyonu**: Spotify ve YouTube ile sorunsuz entegrasyon
- **Kullanıcı Deneyimi**: Sezgisel komut yapısı ve hızlı yanıt süreleri
- **Çalma Listesi Yönetimi**: Kullanıcı dostu playlist oluşturma ve yönetim sistemi
- **Performans**: Lavalink kullanmadan yüksek performanslı ses aktarımı
- **Güvenilirlik**: 7/24 kesintisiz hizmet sunumu

### 1.3 Başarı Kriterleri
- %99.9 uptime oranı
- 2 saniyeden az komut yanıt süresi
- 100+ eşzamanlı sunucu desteği
- Günlük 10,000+ müzik çalma isteği kapasitesi

## 2. Fonksiyonel Gereksinimler

### 2.1 Temel Müzik Komutları
- `/play [şarkı/URL]` - Müzik çalma
- `/pause` - Müziği duraklat
- `/resume` - Müziği devam ettir
- `/stop` - Müziği durdur ve kuyruğu temizle
- `/skip` - Sonraki şarkıya geç
- `/queue` - Çalma kuyruğunu görüntüle
- `/nowplaying` - Şu anda çalan şarkı bilgisi
- `/volume [0-100]` - Ses seviyesi ayarla
- `/seek [zaman]` - Şarkıda belirli bir zamana git

### 2.2 Playlist Yönetimi
- `/playlist create [isim]` - Yeni playlist oluştur
- `/playlist add [playlist] [şarkı]` - Playlist'e şarkı ekle
- `/playlist remove [playlist] [şarkı]` - Playlist'ten şarkı çıkar
- `/playlist play [playlist]` - Playlist'i çal
- `/playlist list` - Kullanıcının playlist'lerini listele
- `/playlist share [playlist] [kullanıcı]` - Playlist'i paylaş
- `/playlist import [platform] [URL]` - Harici platform'dan playlist içe aktar

### 2.3 Arama ve Keşif
- `/search [platform] [arama terimi]` - Belirli platformda arama
- `/trending [platform]` - Trend müzikler
- `/recommendations` - Kişiselleştirilmiş öneriler
- `/lyrics [şarkı]` - Şarkı sözlerini görüntüle

### 2.4 Kullanıcı Ayarları
- `/settings language [dil]` - Bot dilini ayarla
- `/settings autoplay [on/off]` - Otomatik çalma
- `/settings quality [low/medium/high]` - Ses kalitesi
- `/settings notifications [on/off]` - Bildirim ayarları

## 3. Teknik Mimari

### 3.1 Genel Mimari
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Discord API   │◄──►│   Bot Core      │◄──►│   Audio Engine  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Database      │
                    │   (MongoDB)     │
                    └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   External APIs │
                    │ (Spotify/YouTube)│
                    └─────────────────┘
```

### 3.2 Teknoloji Stack
- **Runtime**: Node.js 18+
- **Dil**: TypeScript 5.0+
- **Discord Kütüphanesi**: discord.js v14
- **Ses İşleme**: @discordjs/voice
- **Veri Depolama**: JSON dosyaları (basit ve hızlı)
- **HTTP İstemcisi**: Axios
- **Logging**: Winston
- **Test Framework**: Jest
- **Linting**: ESLint + Prettier

### 3.3 Modül Yapısı
```
src/
├── commands/           # Slash komutları
│   ├── music/
│   ├── playlist/
│   └── settings/
├── services/           # İş mantığı servisleri
│   ├── audioService.ts
│   ├── playlistService.ts
│   └── searchService.ts
├── integrations/       # Platform entegrasyonları
│   ├── spotify/
│   └── youtube/
├── models/            # Veritabanı modelleri
├── utils/             # Yardımcı fonksiyonlar
├── events/            # Discord event handlers
└── config/            # Konfigürasyon dosyaları
```

### 3.4 Veri Yapısı
```typescript
// User Interface
interface User {
  discordId: string;
  playlists: string[]; // playlist ID'leri
  settings: {
    language: string;
    autoplay: boolean;
    quality: 'low' | 'medium' | 'high';
    notifications: boolean;
  };
  createdAt: string;
  lastActive: string;
}

// Playlist Interface
interface Playlist {
  id: string;
  name: string;
  owner: string; // Discord user ID
  tracks: Track[];
  isPublic: boolean;
  sharedWith: string[]; // Discord user ID'leri
  createdAt: string;
  updatedAt: string;
}

// Track Interface
interface Track {
  title: string;
  artist: string;
  duration: number;
  platform: 'spotify' | 'youtube';
  platformId: string;
  url: string;
  thumbnail: string;
}
```

## 4. Entegrasyon Detayları

### 4.1 Spotify Entegrasyonu
- **API**: Spotify Web API
- **Kimlik Doğrulama**: Client Credentials Flow
- **Özellikler**:
  - Track arama ve metadata
  - Playlist içe aktarma
  - Kullanıcı kütüphanesi erişimi
  - Yaş kısıtlamalı içerik desteği
- **Rate Limiting**: 100 requests/second

### 4.2 YouTube Entegrasyonu
- **API**: YouTube Data API v3 + youtube-dl-exec
- **Kimlik Doğrulama**: API Key
- **Özellikler**:
  - Video arama ve metadata
  - Ses stream URL'leri
  - Playlist içe aktarma
  - Yaş kısıtlamalı video desteği
- **Rate Limiting**: 10,000 units/day

### 4.3 Discord Entegrasyonu
- **API**: Discord API v10
- **Kimlik Doğrulama**: Bot Token
- **Özellikler**:
  - Slash komutları
  - Ses kanalı bağlantısı
  - Embed mesajları
  - Buton etkileşimleri

## 5. Test Senaryoları

### 5.1 Birim Testleri
- **Audio Service**: Ses stream yönetimi
- **Playlist Service**: CRUD operasyonları
- **Search Service**: Platform arama fonksiyonları
- **Command Handlers**: Komut işleme mantığı

### 5.2 Entegrasyon Testleri
- **Spotify API**: Arama ve metadata çekme
- **YouTube API**: Video bilgileri ve stream URL'leri
- **Discord API**: Komut kayıt ve yanıt
- **Database**: Veri okuma/yazma operasyonları

### 5.3 End-to-End Testleri
- **Müzik Çalma**: Tam çalma döngüsü testi
- **Playlist Yönetimi**: Oluşturma, düzenleme, paylaşma
- **Platform Geçişi**: Spotify'dan YouTube'a geçiş
- **Eşzamanlı Kullanım**: Çoklu sunucu testi

### 5.4 Performans Testleri
- **Yük Testi**: 100 eşzamanlı bağlantı
- **Stres Testi**: Maksimum kapasite belirleme
- **Bellek Kullanımı**: Memory leak kontrolü
- **Yanıt Süresi**: Komut işleme hızı

## 6. Dağıtım Planı

### 6.1 Geliştirme Ortamı
- **Platform**: Local development
- **Database**: MongoDB Community
- **Monitoring**: Console logging

### 6.2 Test Ortamı
- **Platform**: Docker containers
- **Veri Depolama**: Local JSON files
- **Monitoring**: Basic health checks

### 6.3 Üretim Ortamı
- **Platform**: AWS EC2 / DigitalOcean Droplet
- **Veri Depolama**: JSON files with backup system
- **Monitoring**: Winston + CloudWatch
- **Load Balancer**: Nginx
- **SSL**: Let's Encrypt

### 6.4 CI/CD Pipeline
```yaml
# GitHub Actions Workflow
name: Deploy Bot
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - Checkout code
      - Setup Node.js
      - Install dependencies
      - Run tests
      - Run linting
  
  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - Build Docker image
      - Push to registry
      - Deploy to production
      - Health check
```

## 7. Sürüm Takvimi

### 7.1 Faz 1: Temel Özellikler (4 hafta)
**Hafta 1-2: Altyapı**
- Discord bot kurulumu
- Temel komut yapısı
- Veritabanı şeması
- YouTube entegrasyonu

**Hafta 3-4: Temel Müzik Özellikleri**
- Play, pause, stop, skip komutları
- Kuyruk yönetimi
- Ses kalitesi optimizasyonu

### 7.2 Faz 2: Platform Entegrasyonu (3 hafta)
**Hafta 5-6: Spotify Entegrasyonu**
- Spotify API entegrasyonu
- Arama ve metadata
- Yaş kısıtlamalı içerik desteği

**Hafta 7: Platform Geçişi**
- Spotify-YouTube arası geçiş
- Akıllı arama algoritması

### 7.3 Faz 3: Playlist Sistemi (3 hafta)
**Hafta 8-9: Playlist CRUD**
- Playlist oluşturma/düzenleme
- Kullanıcı arayüzü
- Veritabanı optimizasyonu

**Hafta 10: Paylaşım Özellikleri**
- Playlist paylaşımı
- İçe/dışa aktarma
- Platformlar arası sync

### 7.4 Faz 4: Gelişmiş Özellikler (2 hafta)
**Hafta 11-12: İyileştirmeler**
- Kullanıcı ayarları
- Öneri sistemi
- Performans optimizasyonu
- Kapsamlı test

### 7.5 Faz 5: Dağıtım ve İzleme (1 hafta)
**Hafta 13: Production**
- Üretim ortamı kurulumu
- Monitoring sistemi
- Dokümantasyon
- Beta test

## 8. Risk Analizi ve Azaltma Stratejileri

### 8.1 Teknik Riskler
- **API Rate Limiting**: Önbellek stratejileri ve alternatif endpoint'ler
- **Ses Kalitesi**: Adaptif bitrate ve codec optimizasyonu
- **Ölçeklenebilirlik**: Mikroservis mimarisi geçiş planı

### 8.2 Yasal Riskler
- **Telif Hakkı**: Sadece metadata kullanımı, stream'ler platform'lardan
- **Yaş Kısıtlaması**: Kullanıcı doğrulama mekanizmaları
- **GDPR Uyumluluğu**: Minimal veri toplama ve şeffaflık

### 8.3 Operasyonel Riskler
- **Sunucu Kesintileri**: Multi-region deployment
- **Veri Kaybı**: Otomatik backup stratejisi
- **Güvenlik**: Regular security audit ve penetration testing

---

**Doküman Versiyonu**: 1.0  
**Son Güncelleme**: 2024  
**Hazırlayan**: Discord Müzik Botu Geliştirme Ekibi