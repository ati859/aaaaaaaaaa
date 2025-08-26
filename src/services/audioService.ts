import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  createAudioPlayer,
  createAudioResource,
  demuxProbe,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import { VoiceBasedChannel } from 'discord.js';
import { Track, QueueItem, GuildMusicData } from '../types';
import { YouTubeService } from '../integrations/youtube/youtubeService';
import { SpotifyService } from '../integrations/spotify/spotifyService';
import { logger } from '../utils/logger';
import { MESSAGES } from '../config';
import { Readable } from 'stream';
import axios from 'axios';

export class AudioService {
  private connections = new Map<string, VoiceConnection>();
  private players = new Map<string, AudioPlayer>();
  private queues = new Map<string, QueueItem[]>();
  private currentTracks = new Map<string, Track | null>();
  private volumes = new Map<string, number>();
  private loopModes = new Map<string, 'none' | 'track' | 'queue'>();
  private autoplay = new Map<string, boolean>();

  constructor(
    private youtubeService: YouTubeService,
    public spotifyService: SpotifyService
  ) {}

  async joinChannel(channel: VoiceBasedChannel): Promise<VoiceConnection> {
    const guildId = channel.guild.id;
    
    // Mevcut bağlantıyı kontrol et
    let connection = this.connections.get(guildId);
    
    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
      // Aynı kanaldaysa mevcut bağlantıyı döndür
      if (connection.joinConfig.channelId === channel.id) {
        return connection;
      }
      // Farklı kanala geçiş yap
      connection.rejoin();
      return connection;
    }

    // Yeni bağlantı oluştur
    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator as any,
    });

    this.connections.set(guildId, connection);

    // Bağlantı olaylarını dinle
    connection.on('stateChange', (oldState, newState) => {
      logger.info(`Ses bağlantısı durumu değişti: ${oldState.status} -> ${newState.status} (${guildId})`);
      
      if (newState.status === VoiceConnectionStatus.Destroyed) {
        this.cleanup(guildId);
      }
    });

    connection.on('error', (error) => {
      logger.error(`Ses bağlantısı hatası (${guildId}):`, error);
    });

    // Bağlantının hazır olmasını bekle
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30000);
      logger.info(`Ses kanalına başarıyla bağlanıldı: ${channel.name} (${guildId})`);
    } catch (error) {
      logger.error(`Ses kanalına bağlanılamadı (${guildId}):`, error);
      connection.destroy();
      throw new Error(MESSAGES.errors.tr.voiceConnectionFailed);
    }

    return connection;
  }

  async play(guildId: string, track: Track): Promise<void> {
    const connection = this.connections.get(guildId);
    if (!connection) {
      throw new Error(MESSAGES.errors.tr.notInVoiceChannel);
    }

    let player = this.players.get(guildId);
    if (!player) {
      player = this.createPlayer(guildId);
      this.players.set(guildId, player);
      connection.subscribe(player);
    }

    try {
      const resource = await this.createAudioResource(track);
      if (!resource) {
        throw new Error('Ses kaynağı oluşturulamadı');
      }

      // Volume ayarla
      const volume = this.volumes.get(guildId) || 50;
      if (resource.volume) {
        resource.volume.setVolume(volume / 100);
      }

      player.play(resource);
      this.currentTracks.set(guildId, track);
      
      logger.info(`Şarkı çalınıyor: ${track.title} (${guildId})`);
    } catch (error) {
      logger.error(`Şarkı çalınamadı (${guildId}):`, error);
      throw new Error(MESSAGES.errors.tr.playbackFailed);
    }
  }

  private async createAudioResource(track: Track): Promise<AudioResource<null> | null> {
    try {
      let streamUrl: string | null = null;

      if (track.platform === 'youtube') {
        // URL'den video ID'sini çıkar
        const videoId = this.youtubeService.extractVideoId(track.url);
        if (videoId) {
          streamUrl = await this.youtubeService.getStreamUrl(videoId);
        }
      } else if (track.platform === 'spotify') {
        // Spotify şarkısını YouTube'da ara
        const spotifyTrack = await this.spotifyService.getTrack(track.url);
        if (spotifyTrack) {
          const searchQuery = await this.spotifyService.searchForYouTube(spotifyTrack);
          const youtubeResults = await this.youtubeService.search(searchQuery, 1);
          if (youtubeResults.length > 0) {
            if (youtubeResults[0]) {
              streamUrl = await this.youtubeService.getStreamUrl(youtubeResults[0].id);
            }
          }
        }
      }

      if (!streamUrl) {
        throw new Error('Stream URL alınamadı');
      }

      // HTTP stream oluştur
      const response = await axios({
        method: 'GET',
        url: streamUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 10000,
      });

      const stream = response.data as Readable;
      
      // Stream'i probe et
      const { stream: probedStream, type } = await demuxProbe(stream);
      
      return createAudioResource(probedStream, {
        inputType: type,
        inlineVolume: true,
      });
    } catch (error) {
      logger.error('Audio resource oluşturulamadı:', error);
      return null;
    }
  }

  private createPlayer(guildId: string): AudioPlayer {
    const player = createAudioPlayer();

    player.on('stateChange', (oldState, newState) => {
      logger.info(`Audio player durumu değişti: ${oldState.status} -> ${newState.status} (${guildId})`);
      
      if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
        // Şarkı bitti, sıradaki şarkıya geç
        this.handleTrackEnd(guildId);
      }
    });

    player.on('error', (error) => {
      logger.error(`Audio player hatası (${guildId}):`, error);
      this.handleTrackEnd(guildId);
    });

    return player;
  }

  private async handleTrackEnd(guildId: string): Promise<void> {
    const loopMode = this.loopModes.get(guildId) || 'none';
    const currentTrack = this.currentTracks.get(guildId);
    const queue = this.queues.get(guildId) || [];

    if (loopMode === 'track' && currentTrack) {
      // Aynı şarkıyı tekrar çal
      await this.play(guildId, currentTrack);
      return;
    }

    if (loopMode === 'queue' && currentTrack) {
      // Şarkıyı kuyruğun sonuna ekle
      queue.push({
        track: currentTrack,
        addedAt: new Date().toISOString(),
        requestedBy: 'autoplay',
      });
      this.queues.set(guildId, queue);
    }

    // Sıradaki şarkıya geç
    if (queue.length > 0) {
      const nextItem = queue.shift()!;
      this.queues.set(guildId, queue);
      await this.play(guildId, nextItem.track);
    } else {
      // Kuyruk boş, autoplay kontrol et
      const autoplayEnabled = this.autoplay.get(guildId) || false;
      if (autoplayEnabled && currentTrack) {
        await this.handleAutoplay(guildId, currentTrack);
      } else {
        this.currentTracks.set(guildId, null);
      }
    }
  }

  private async handleAutoplay(guildId: string, lastTrack: Track): Promise<void> {
    try {
      let recommendations: any[] = [];

      if (lastTrack.platform === 'spotify') {
        recommendations = await this.spotifyService.getRecommendations([lastTrack.url], 5);
      } else if (lastTrack.platform === 'youtube') {
        // YouTube için basit arama yaparak benzer şarkılar bul
        const searchQuery = `${lastTrack.artist} ${lastTrack.title.split(' ').slice(0, 3).join(' ')}`;
        recommendations = await this.youtubeService.search(searchQuery, 5);
      }

      if (recommendations.length > 0) {
        // Rastgele bir öneri seç
        const randomIndex = Math.floor(Math.random() * recommendations.length);
        const recommendation = recommendations[randomIndex];
        
        const track = await this.convertSearchResultToTrack(recommendation, 'autoplay');
        await this.play(guildId, track);
        
        logger.info(`Autoplay şarkısı çalınıyor: ${track.title} (${guildId})`);
      }
    } catch (error) {
      logger.error(`Autoplay hatası (${guildId}):`, error);
      this.currentTracks.set(guildId, null);
    }
  }

  private async convertSearchResultToTrack(searchResult: any, requestedBy: string): Promise<Track> {
    if (searchResult.platform === 'spotify') {
      return await this.spotifyService.convertToTrack(searchResult, requestedBy);
    } else {
      return await this.youtubeService.convertToTrack(searchResult, requestedBy);
    }
  }

  pause(guildId: string): boolean {
    const player = this.players.get(guildId);
    if (!player) return false;

    const success = player.pause();
    if (success) {
      logger.info(`Müzik duraklatıldı (${guildId})`);
    }
    return success;
  }

  resume(guildId: string): boolean {
    const player = this.players.get(guildId);
    if (!player) return false;

    const success = player.unpause();
    if (success) {
      logger.info(`Müzik devam ettirildi (${guildId})`);
    }
    return success;
  }

  stop(guildId: string): boolean {
    const player = this.players.get(guildId);
    if (!player) return false;

    const success = player.stop();
    if (success) {
      this.currentTracks.set(guildId, null);
      this.queues.set(guildId, []);
      logger.info(`Müzik durduruldu (${guildId})`);
    }
    return success;
  }

  skip(guildId: string): boolean {
    const player = this.players.get(guildId);
    if (!player) return false;

    const success = player.stop(); // stop() çağrısı handleTrackEnd'i tetikler
    if (success) {
      logger.info(`Şarkı atlandı (${guildId})`);
    }
    return success;
  }

  setVolume(guildId: string, volume: number): boolean {
    if (volume < 0 || volume > 100) return false;

    this.volumes.set(guildId, volume);
    
    const player = this.players.get(guildId);
    if (player && player.state.status === AudioPlayerStatus.Playing) {
      const resource = player.state.resource;
      if (resource.volume) {
        resource.volume.setVolume(volume / 100);
      }
    }

    logger.info(`Ses seviyesi ayarlandı: ${volume}% (${guildId})`);
    return true;
  }

  getVolume(guildId: string): number {
    return this.volumes.get(guildId) || 50;
  }

  setLoopMode(guildId: string, mode: 'none' | 'track' | 'queue'): void {
    this.loopModes.set(guildId, mode);
    logger.info(`Loop modu ayarlandı: ${mode} (${guildId})`);
  }

  getLoopMode(guildId: string): 'none' | 'track' | 'queue' {
    return this.loopModes.get(guildId) || 'none';
  }

  setAutoplay(guildId: string, enabled: boolean): void {
    this.autoplay.set(guildId, enabled);
    logger.info(`Autoplay ${enabled ? 'açıldı' : 'kapatıldı'} (${guildId})`);
  }

  getAutoplay(guildId: string): boolean {
    return this.autoplay.get(guildId) || false;
  }

  addToQueue(guildId: string, track: Track): void {
    const queue = this.queues.get(guildId) || [];
    queue.push({
      track,
      addedAt: new Date().toISOString(),
      requestedBy: 'autoplay',
    });
    this.queues.set(guildId, queue);
    
    logger.info(`Şarkı kuyruğa eklendi: ${track.title} (${guildId})`);
  }

  removeFromQueue(guildId: string, index: number): QueueItem | null {
    const queue = this.queues.get(guildId) || [];
    if (index < 0 || index >= queue.length) {
      return null;
    }
    
    const removed = queue.splice(index, 1)[0];
    this.queues.set(guildId, queue);
    
    if (removed) {
      logger.info(`Şarkı kuyruktan çıkarıldı: ${removed.track.title} (${guildId})`);
      return removed;
    }
    return null;
  }

  clearQueue(guildId: string): void {
    this.queues.set(guildId, []);
    logger.info(`Kuyruk temizlendi (${guildId})`);
  }

  shuffleQueue(guildId: string): void {
    const queue = this.queues.get(guildId) || [];
    if (queue.length <= 1) return;

    // Fisher-Yates shuffle algoritması
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const itemI = queue[i];
      const itemJ = queue[j];
      if (itemI && itemJ) {
        queue[i] = itemJ;
        queue[j] = itemI;
      }
    }

    this.queues.set(guildId, queue);
    logger.info(`Kuyruk karıştırıldı (${guildId})`);
  }

  getQueue(guildId: string): QueueItem[] {
    return this.queues.get(guildId) || [];
  }

  getCurrentTrack(guildId: string): Track | null {
    return this.currentTracks.get(guildId) || null;
  }

  isPlaying(guildId: string): boolean {
    const player = this.players.get(guildId);
    return player ? player.state.status === AudioPlayerStatus.Playing : false;
  }

  isPaused(guildId: string): boolean {
    const player = this.players.get(guildId);
    return player ? player.state.status === AudioPlayerStatus.Paused : false;
  }

  isConnected(guildId: string): boolean {
    const connection = this.connections.get(guildId);
    return connection ? connection.state.status === VoiceConnectionStatus.Ready : false;
  }

  disconnect(guildId: string): void {
    const connection = this.connections.get(guildId);
    if (connection) {
      connection.destroy();
    }
    this.cleanup(guildId);
    logger.info(`Ses kanalından ayrıldı (${guildId})`);
  }

  private cleanup(guildId: string): void {
    this.connections.delete(guildId);
    this.players.delete(guildId);
    this.queues.delete(guildId);
    this.currentTracks.delete(guildId);
    this.volumes.delete(guildId);
    this.loopModes.delete(guildId);
    this.autoplay.delete(guildId);
    
    logger.info(`Audio service temizlendi (${guildId})`);
  }

  // Utility methods
  getGuildMusicData(guildId: string): GuildMusicData {
    return {
      guildId,
      queue: this.getQueue(guildId),
      currentTrack: this.getCurrentTrack(guildId),
      isPlaying: this.isPlaying(guildId),
      isPaused: this.isPaused(guildId),
      volume: this.getVolume(guildId),
      loop: this.getLoopMode(guildId),
      loopMode: this.getLoopMode(guildId),
      autoplay: this.getAutoplay(guildId),
      voiceChannelId: this.connections.get(guildId)?.joinConfig.channelId || null,
      textChannelId: null, // Bu bilgi command handler'dan gelecek
    };
  }

  getAllActiveGuilds(): string[] {
    return Array.from(this.connections.keys());
  }

  getStats(): { activeConnections: number; totalQueued: number; totalPlaying: number } {
    const activeConnections = this.connections.size;
    const totalQueued = Array.from(this.queues.values()).reduce((total, queue) => total + queue.length, 0);
    const totalPlaying = Array.from(this.players.values()).filter(player => 
      player.state.status === AudioPlayerStatus.Playing
    ).length;

    return { activeConnections, totalQueued, totalPlaying };
  }

  async disconnectAll(): Promise<void> {
    const guildIds = Array.from(this.connections.keys());
    for (const guildId of guildIds) {
      this.disconnect(guildId);
    }
    logger.info('Tüm ses bağlantıları kapatıldı');
  }
}