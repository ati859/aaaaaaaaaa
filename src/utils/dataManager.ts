import fs from 'fs/promises';
import path from 'path';
import { User, Playlist, GuildMusicData } from '../types';
import { DATA_PATHS } from '../config';
import { logger } from './logger';

export class DataManager {
  private users: Map<string, User> = new Map();
  private playlists: Map<string, Playlist> = new Map();
  private guilds: Map<string, GuildMusicData> = new Map();
  private saveInterval: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    try {
      // Data klasörünü oluştur
      const dataDir = path.dirname(DATA_PATHS.users);
      await fs.mkdir(dataDir, { recursive: true });

      // Mevcut verileri yükle
      await this.loadAllData();

      // Otomatik kaydetme başlat (her 5 dakikada bir)
      this.startAutoSave();

      logger.info('Veri yöneticisi başarıyla başlatıldı');
    } catch (error) {
      logger.error('Veri yöneticisi başlatılırken hata oluştu:', error);
      throw error;
    }
  }

  private async loadAllData(): Promise<void> {
    await Promise.all([
      this.loadUsers(),
      this.loadPlaylists(),
      this.loadGuilds(),
    ]);
  }

  private async loadUsers(): Promise<void> {
    try {
      const data = await fs.readFile(DATA_PATHS.users, 'utf-8');
      const users: User[] = JSON.parse(data);
      
      this.users.clear();
      users.forEach(user => {
        this.users.set(user.discordId, user);
      });
      
      logger.info(`${users.length} kullanıcı yüklendi`);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        logger.info('Kullanıcı dosyası bulunamadı, yeni dosya oluşturulacak');
        await this.saveUsers();
      } else {
        logger.error('Kullanıcılar yüklenirken hata oluştu:', error);
      }
    }
  }

  private async loadPlaylists(): Promise<void> {
    try {
      const data = await fs.readFile(DATA_PATHS.playlists, 'utf-8');
      const playlists: Playlist[] = JSON.parse(data);
      
      this.playlists.clear();
      playlists.forEach(playlist => {
        this.playlists.set(playlist.id, playlist);
      });
      
      logger.info(`${playlists.length} playlist yüklendi`);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        logger.info('Playlist dosyası bulunamadı, yeni dosya oluşturulacak');
        await this.savePlaylists();
      } else {
        logger.error('Playlistler yüklenirken hata oluştu:', error);
      }
    }
  }

  private async loadGuilds(): Promise<void> {
    try {
      const data = await fs.readFile(DATA_PATHS.guilds, 'utf-8');
      const guilds: GuildMusicData[] = JSON.parse(data);
      
      this.guilds.clear();
      guilds.forEach(guild => {
        // Geçici verileri temizle (queue, currentTrack vb.)
        const cleanGuild: GuildMusicData = {
          ...guild,
          queue: [],
          currentTrack: null,
          isPlaying: false,
          isPaused: false,
        };
        this.guilds.set(guild.guildId, cleanGuild);
      });
      
      logger.info(`${guilds.length} guild yüklendi`);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        logger.info('Guild dosyası bulunamadı, yeni dosya oluşturulacak');
        await this.saveGuilds();
      } else {
        logger.error('Guild\'ler yüklenirken hata oluştu:', error);
      }
    }
  }

  // User operations
  getUser(discordId: string): User | undefined {
    return this.users.get(discordId);
  }

  async createUser(discordId: string): Promise<User> {
    const user: User = {
      discordId,
      playlists: [],
      settings: {
        language: 'tr',
        autoplay: false,
        quality: 'medium',
        notifications: true,
        volume: 50,
      },
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };

    this.users.set(discordId, user);
    await this.saveUsers();
    
    logger.info(`Yeni kullanıcı oluşturuldu: ${discordId}`);
    return user;
  }

  async updateUser(user: User): Promise<void> {
    user.lastActive = new Date().toISOString();
    this.users.set(user.discordId, user);
    await this.saveUsers();
  }

  async deleteUser(discordId: string): Promise<boolean> {
    const deleted = this.users.delete(discordId);
    if (deleted) {
      await this.saveUsers();
      logger.info(`Kullanıcı silindi: ${discordId}`);
    }
    return deleted;
  }

  // Playlist operations
  getPlaylist(id: string): Playlist | undefined {
    return this.playlists.get(id);
  }

  getUserPlaylists(userId: string): Playlist[] {
    return Array.from(this.playlists.values())
      .filter(playlist => playlist.owner === userId);
  }

  getSharedPlaylists(userId: string): Playlist[] {
    return Array.from(this.playlists.values())
      .filter(playlist => playlist.sharedWith.includes(userId));
  }

  async createPlaylist(playlist: Omit<Playlist, 'id' | 'createdAt' | 'updatedAt'>): Promise<Playlist> {
    const id = this.generateId();
    const now = new Date().toISOString();
    
    const newPlaylist: Playlist = {
      ...playlist,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.playlists.set(id, newPlaylist);
    
    // Kullanıcının playlist listesine ekle
    const user = this.getUser(playlist.owner);
    if (user) {
      user.playlists.push(id);
      await this.updateUser(user);
    }

    await this.savePlaylists();
    
    logger.info(`Yeni playlist oluşturuldu: ${newPlaylist.name} (${id})`);
    return newPlaylist;
  }

  async updatePlaylist(playlist: Playlist): Promise<void> {
    playlist.updatedAt = new Date().toISOString();
    this.playlists.set(playlist.id, playlist);
    await this.savePlaylists();
  }

  async deletePlaylist(id: string): Promise<boolean> {
    const playlist = this.playlists.get(id);
    if (!playlist) return false;

    // Kullanıcının playlist listesinden çıkar
    const user = this.getUser(playlist.owner);
    if (user) {
      user.playlists = user.playlists.filter(pid => pid !== id);
      await this.updateUser(user);
    }

    const deleted = this.playlists.delete(id);
    if (deleted) {
      await this.savePlaylists();
      logger.info(`Playlist silindi: ${playlist.name} (${id})`);
    }
    return deleted;
  }

  // Guild operations
  getGuild(guildId: string): GuildMusicData | undefined {
    return this.guilds.get(guildId);
  }

  async createGuild(guildData: Omit<GuildMusicData, 'queue' | 'currentTrack' | 'isPlaying' | 'isPaused'>): Promise<GuildMusicData> {
    const guild: GuildMusicData = {
      ...guildData,
      queue: [],
      currentTrack: null,
      isPlaying: false,
      isPaused: false,
    };

    this.guilds.set(guildData.guildId, guild);
    await this.saveGuilds();
    
    logger.info(`Yeni guild oluşturuldu: ${guildData.guildId}`);
    return guild;
  }

  async updateGuild(guild: GuildMusicData): Promise<void> {
    this.guilds.set(guild.guildId, guild);
    // Guild verileri geçici olduğu için otomatik kaydetme yapmıyoruz
  }

  async deleteGuild(guildId: string): Promise<boolean> {
    const deleted = this.guilds.delete(guildId);
    if (deleted) {
      await this.saveGuilds();
      logger.info(`Guild silindi: ${guildId}`);
    }
    return deleted;
  }

  // Save operations
  private async saveUsers(): Promise<void> {
    try {
      const users = Array.from(this.users.values());
      await fs.writeFile(DATA_PATHS.users, JSON.stringify(users, null, 2));
    } catch (error) {
      logger.error('Kullanıcılar kaydedilirken hata oluştu:', error);
    }
  }

  private async savePlaylists(): Promise<void> {
    try {
      const playlists = Array.from(this.playlists.values());
      await fs.writeFile(DATA_PATHS.playlists, JSON.stringify(playlists, null, 2));
    } catch (error) {
      logger.error('Playlistler kaydedilirken hata oluştu:', error);
    }
  }

  private async saveGuilds(): Promise<void> {
    try {
      const guilds = Array.from(this.guilds.values())
        .map(guild => ({
          ...guild,
          queue: [], // Geçici verileri kaydetme
          currentTrack: null,
          isPlaying: false,
          isPaused: false,
        }));
      await fs.writeFile(DATA_PATHS.guilds, JSON.stringify(guilds, null, 2));
    } catch (error) {
      logger.error('Guild\'ler kaydedilirken hata oluştu:', error);
    }
  }

  async saveAll(): Promise<void> {
    await Promise.all([
      this.saveUsers(),
      this.savePlaylists(),
      this.saveGuilds(),
    ]);
    logger.info('Tüm veriler kaydedildi');
  }

  private startAutoSave(): void {
    this.saveInterval = setInterval(async () => {
      await this.saveAll();
    }, 5 * 60 * 1000); // 5 dakika
  }

  async shutdown(): Promise<void> {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    await this.saveAll();
    logger.info('Veri yöneticisi kapatıldı');
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Statistics
  getStats(): { users: number; playlists: number; guilds: number } {
    return {
      users: this.users.size,
      playlists: this.playlists.size,
      guilds: this.guilds.size,
    };
  }
}