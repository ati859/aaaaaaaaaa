import { BotConfig } from '../types';

// Çevre değişkenlerinden konfigürasyon yükleme
export const config: BotConfig = {
  token: process.env['DISCORD_TOKEN'] || '',
  clientId: process.env['DISCORD_CLIENT_ID'] || '',
  spotify: {
    clientId: process.env['SPOTIFY_CLIENT_ID'] || '',
    clientSecret: process.env['SPOTIFY_CLIENT_SECRET'] || '',
  },
  youtube: {
    apiKey: process.env['YOUTUBE_API_KEY'] || '',
    cookies: process.env['YOUTUBE_COOKIES'] || '',
  },
  defaultSettings: {
    language: 'tr',
    autoplay: false,
    quality: 'medium',
    notifications: true,
    volume: 50,
  },
};

// Konfigürasyon doğrulama
export function validateConfig(): void {
  const requiredEnvVars = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
    'YOUTUBE_API_KEY',
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Eksik çevre değişkenleri: ${missingVars.join(', ')}\n` +
        'Lütfen .env dosyasını oluşturun ve gerekli değişkenleri ekleyin.'
    );
  }
}

// Veri dosyası yolları
export const DATA_PATHS = {
  users: './data/users.json',
  playlists: './data/playlists.json',
  guilds: './data/guilds.json',
} as const;

// Bot ayarları
export const BOT_SETTINGS = {
  maxQueueSize: 100,
  maxPlaylistSize: 500,
  searchResultLimit: 10,
  defaultVolume: 50,
  maxVolume: 100,
  commandCooldown: 2000, // 2 saniye
  maxConcurrentConnections: 10,
} as const;

// Platform ayarları
export const PLATFORM_SETTINGS = {
  spotify: {
    searchLimit: 20,
    rateLimitDelay: 100,
  },
  youtube: {
    searchLimit: 20,
    rateLimitDelay: 200,
    maxDuration: 3600, // 1 saat (saniye)
  },
} as const;

// Hata mesajları
export const ERROR_MESSAGES = {
  tr: {
    notInVoiceChannel: '❌ Bir ses kanalında olmalısınız!',
    botNotInVoiceChannel: '❌ Bot bir ses kanalında değil!',
    differentVoiceChannel: '❌ Bot ile aynı ses kanalında olmalısınız!',
    noPermission: '❌ Bu komutu kullanma izniniz yok!',
    queueEmpty: '❌ Çalma kuyruğu boş!',
    trackNotFound: '❌ Şarkı bulunamadı!',
    playlistNotFound: '❌ Playlist bulunamadı!',
    invalidUrl: '❌ Geçersiz URL!',
    rateLimited: '❌ Çok hızlı komut gönderiyorsunuz! Lütfen bekleyin.',
    internalError: '❌ Bir hata oluştu! Lütfen daha sonra tekrar deneyin.',
    noResults: '❌ Sonuç bulunamadı!',
    alreadyPaused: '⏸️ Müzik zaten duraklatılmış.',
    alreadyPlaying: '▶️ Müzik zaten çalıyor.',
    playbackFailed: '❌ Şarkı çalınamadı.',
    voiceConnectionFailed: '❌ Ses kanalına bağlanılamadı.',
    searchFailed: '❌ Arama başarısız oldu.',
    nothingPlaying: '❌ Şu anda çalan bir şarkı yok.',
  },
  en: {
    notInVoiceChannel: '❌ You must be in a voice channel!',
    botNotInVoiceChannel: '❌ Bot is not in a voice channel!',
    differentVoiceChannel: '❌ You must be in the same voice channel as the bot!',
    noPermission: '❌ You do not have permission to use this command!',
    queueEmpty: '❌ The queue is empty!',
    trackNotFound: '❌ Track not found!',
    playlistNotFound: '❌ Playlist not found!',
    invalidUrl: '❌ Invalid URL!',
    rateLimited: '❌ You are sending commands too fast! Please wait.',
    internalError: '❌ An error occurred! Please try again later.',
    noResults: '❌ No results found!',
    alreadyPaused: '⏸️ Music is already paused.',
    alreadyPlaying: '▶️ Music is already playing.',
  },
} as const;

// Başarı mesajları
export const SUCCESS_MESSAGES = {
  tr: {
    trackAdded: '✅ Şarkı kuyruğa eklendi',
    playlistCreated: '✅ Playlist oluşturuldu',
    playlistDeleted: '✅ Playlist silindi',
    settingsUpdated: '✅ Ayarlar güncellendi',
    trackSkipped: '⏭️ Şarkı atlandı',
    queueCleared: '🗑️ Kuyruk temizlendi',
  },
  en: {
    trackAdded: '✅ Track added to queue',
    playlistCreated: '✅ Playlist created',
    playlistDeleted: '✅ Playlist deleted',
    settingsUpdated: '✅ Settings updated',
    trackSkipped: '⏭️ Track skipped',
    queueCleared: '🗑️ Queue cleared',
  },
} as const;

// Tüm mesajları birleştir
export const MESSAGES = {
  errors: ERROR_MESSAGES,
  success: SUCCESS_MESSAGES,
} as const;