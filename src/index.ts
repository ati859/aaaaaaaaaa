// .env dosyasını en başta yükle
require('dotenv').config();

import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { logger } from './utils/logger';
import { CommandHandler } from './utils/commandHandler';
import { AudioService } from './services/audioService';
import { DataManager } from './utils/dataManager';
import { YouTubeService } from './integrations/youtube/youtubeService';
import { SpotifyService } from './integrations/spotify/spotifyService';
import path from 'path';
import fs from 'fs';

// Config'i dotenv'den sonra import et
import { config, validateConfig } from './config';

class DiscordMusicBot {
  public client: Client;
  public commands: Collection<string, any>;
  public audioService: AudioService;
  public dataManager: DataManager;
  public commandHandler!: CommandHandler;

  constructor() {
    // Discord client oluştur
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.commands = new Collection();
    const youtubeService = new YouTubeService(config.youtube.apiKey, config.youtube.cookies);
    const spotifyService = new SpotifyService(config.spotify.clientId, config.spotify.clientSecret);
    this.audioService = new AudioService(youtubeService, spotifyService);
    this.dataManager = new DataManager();
    // CommandHandler'ı komutlar yüklendikten sonra oluşturacağız
  }

  async initialize(): Promise<void> {
    try {
      // Konfigürasyonu doğrula
      validateConfig();
      logger.info('Konfigürasyon doğrulandı');

      // Spotify servisini başlat
      await this.audioService.spotifyService.initialize();
      logger.info('Spotify servisi başlatıldı');

      // Veri klasörünü oluştur
      await this.dataManager.initialize();
      logger.info('Veri yöneticisi başlatıldı');

      // Event handler'ları yükle
      await this.loadEvents();
      logger.info('Event handler\'ları yüklendi');

      // Komutları yükle
      await this.loadCommands();
      logger.info('Komutlar yüklendi');

      // CommandHandler'ı oluştur (komutlar yüklendikten sonra)
      this.commandHandler = new CommandHandler(this.client, this.commands);
      logger.info('Command handler başlatıldı');

      // Discord'a bağlan
      console.log(`DEBUG: Token uzunluğu: ${config.token ? config.token.length : 'undefined'}`);
      if (config.token) {
        console.log(`DEBUG: Token başlangıcı: ${config.token.substring(0, 10)}`);
      }
      await this.client.login(config.token);
      logger.info('Discord\'a başarıyla bağlanıldı');
    } catch (error) {
      logger.error('Bot başlatılırken hata oluştu:', error);
      process.exit(1);
    }
  }

  private async loadEvents(): Promise<void> {
    const eventsPath = path.join(__dirname, 'events');
    
    if (!fs.existsSync(eventsPath)) {
      logger.warn('Events klasörü bulunamadı');
      return;
    }

    const eventFiles = fs
      .readdirSync(eventsPath)
      .filter(file => file.endsWith('.ts') || file.endsWith('.js'));

    for (const file of eventFiles) {
      const filePath = path.join(eventsPath, file);
      const event = await import(filePath);
      
      if (event.default?.name) {
        if (event.default.once) {
          this.client.once(event.default.name, (...args) => 
            event.default.execute(...args, this)
          );
        } else {
          this.client.on(event.default.name, (...args) => 
            event.default.execute(...args, this)
          );
        }
        logger.debug(`Event yüklendi: ${event.default.name}`);
      }
    }
  }

  private async loadCommands(): Promise<void> {
    const commandsPath = path.join(__dirname, 'commands');
    
    if (!fs.existsSync(commandsPath)) {
      logger.warn('Commands klasörü bulunamadı');
      return;
    }

    await this.loadCommandsFromDirectory(commandsPath);
  }

  private async loadCommandsFromDirectory(dir: string): Promise<void> {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        // Alt klasörleri de tara
        await this.loadCommandsFromDirectory(itemPath);
      } else if (item.endsWith('.js') && !item.endsWith('.d.ts')) {
        try {
          const commandModule = await import(itemPath);
          
          // Default export veya named export'u kontrol et
          let command = commandModule.default || commandModule;
          
          // Eğer class ise instance oluştur
          if (typeof command === 'function' && command.prototype) {
            // Class constructor'ı ise, gerekli servisleri inject et
            try {
              const youtubeService = new YouTubeService(config.youtube.apiKey);
              const spotifyService = new SpotifyService(config.spotify.clientId, config.spotify.clientSecret);
              command = new command(this.audioService, youtubeService, spotifyService, this.dataManager);
            } catch (error) {
              logger.warn(`${itemPath} dosyasında komut instance oluşturulamadı: ${error}`);
              continue;
            }
          }
          
          if (command && 'data' in command && 'execute' in command) {
            this.commands.set(command.data.name, command);
            logger.debug(`Komut yüklendi: ${command.data.name}`);
          } else {
            logger.warn(`${itemPath} dosyasında geçerli komut bulunamadı`);
          }
        } catch (error) {
          logger.error(`Komut yüklenirken hata: ${itemPath}`, error);
        }
      }
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Bot kapatılıyor...');
    
    try {
      // Tüm ses bağlantılarını kapat
      await this.audioService.disconnectAll();
      
      // Verileri kaydet
      await this.dataManager.saveAll();
      
      // Discord bağlantısını kapat
      this.client.destroy();
      
      logger.info('Bot başarıyla kapatıldı');
    } catch (error) {
      logger.error('Bot kapatılırken hata oluştu:', error);
    }
  }
}

// Bot instance oluştur
const bot = new DiscordMusicBot();

// Graceful shutdown
process.on('SIGINT', async () => {
  await bot.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await bot.shutdown();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Botu başlat
bot.initialize().catch((error) => {
  logger.error('Bot başlatılamadı:', error);
  process.exit(1);
});

export default bot;