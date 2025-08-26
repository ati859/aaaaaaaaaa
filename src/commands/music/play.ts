import { SlashCommandBuilder, GuildMember } from 'discord.js';
import { Command, CommandContext } from '../../types';
import { AudioService } from '../../services/audioService';
import { YouTubeService } from '../../integrations/youtube/youtubeService';
import { SpotifyService } from '../../integrations/spotify/spotifyService';
import { DataManager } from '../../utils/dataManager';
import { logger } from '../../utils/logger';
import { MESSAGES } from '../../config';
import { URL } from 'url';

export class PlayCommand implements Command {
  public readonly data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Bir şarkı veya playlist çalar')
    .addStringOption(option =>
      option
        .setName('query')
        .setDescription('Şarkı adı, sanatçı, YouTube/Spotify URL\'si')
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option
        .setName('next')
        .setDescription('Şarkıyı kuyruğun başına ekle')
        .setRequired(false)
    );

  public readonly category = 'music';
  public readonly cooldown = 3;
  public readonly permissions = [];
  public readonly voiceChannelRequired = true;
  public readonly sameVoiceChannelRequired = false;

  constructor(
    private audioService?: AudioService,
    private youtubeService?: YouTubeService,
    private spotifyService?: SpotifyService,
    private dataManager?: DataManager
  ) {}

  async execute(context: CommandContext): Promise<void> {
    const { interaction } = context;
    const query = interaction.options.getString('query', true);
    const playNext = interaction.options.getBoolean('next') || false;
    const member = interaction.member as GuildMember;
    const guildId = interaction.guildId!;
    const userId = interaction.user.id;

    await interaction.deferReply();

    try {
      // Servislerin kontrolü
      if (!this.audioService) {
        await interaction.editReply('Audio service is not available.');
        return;
      }
      
      if (!this.youtubeService) {
        await interaction.editReply('YouTube service is not available.');
        return;
      }
      
      if (!this.spotifyService) {
        await interaction.editReply('Spotify service is not available.');
        return;
      }
      
      if (!this.dataManager) {
        await interaction.editReply('Data manager is not available.');
        return;
      }
      
      // Kullanıcı ses kanalında mı kontrol et
      if (!member.voice.channel) {
        await interaction.editReply(MESSAGES.errors.tr.notInVoiceChannel);
        return;
      }
      
      // Bot ses kanalına bağlan
      await this.audioService.joinChannel(member.voice.channel);

      // Query'yi analiz et ve uygun servisi kullan
      const results = await this.searchContent(query, userId);
      
      if (results.length === 0) {
        await interaction.editReply(MESSAGES.errors.tr.noResults);
        return;
      }

      // Tek şarkı mı yoksa playlist mi?
      if (results.length === 1) {
        const track = results[0];
        
        if (!track) {
           await interaction.editReply({
             embeds: [{
               color: 0xff0000,
               title: '❌ Sonuç Bulunamadı',
               description: 'Aradığınız şarkı bulunamadı.',
             }],
           });
           return;
         }
        
        // Şu anda çalan şarkı var mı?
        const currentTrack = this.audioService.getCurrentTrack(guildId);
        
        if (!currentTrack && !this.audioService.isPlaying(guildId)) {
          // Hiçbir şey çalmıyor, direkt çal
          await this.audioService.play(guildId, track);
          
          await interaction.editReply({
            embeds: [{
              color: 0x00ff00,
              title: '🎵 Şimdi Çalıyor',
              description: `**${track.title}**\n${track.artist}`,
              thumbnail: { url: track.thumbnail || '' },
              fields: [
                { name: 'Süre', value: track.duration, inline: true },
                { name: 'Platform', value: track.platform.toUpperCase(), inline: true },
                { name: 'İsteyen', value: `<@${track.requestedBy}>`, inline: true },
              ],
              footer: { text: `Kaynak: ${track.platform}` },
            }],
          });
        } else {
          // Kuyruğa ekle
          if (playNext) {
            // Kuyruğun başına ekle
            const queue = this.audioService.getQueue(guildId);
            queue.unshift({
              track,
              requestedBy: userId,
              addedAt: new Date().toISOString(),
            });
          } else {
            this.audioService.addToQueue(guildId, track);
          }
          
          const queuePosition = playNext ? 1 : this.audioService.getQueue(guildId).length;
          
          await interaction.editReply({
            embeds: [{
              color: 0x0099ff,
              title: '➕ Kuyruğa Eklendi',
              description: `**${track.title}**\n${track.artist}`,
              thumbnail: { url: track.thumbnail || '' },
              fields: [
                { name: 'Süre', value: track.duration, inline: true },
                { name: 'Platform', value: track.platform.toUpperCase(), inline: true },
                { name: 'Sıra', value: queuePosition.toString(), inline: true },
              ],
              footer: { text: `İsteyen: ${interaction.user.username}` },
            }],
          });
        }
      } else {
        // Playlist - tüm şarkıları kuyruğa ekle
        let addedCount = 0;
        const maxTracks = 100; // Maksimum track limiti
        
        for (const track of results.slice(0, maxTracks)) {
          if (!track) continue;
          
          if (addedCount === 0 && !this.audioService.getCurrentTrack(guildId)) {
            // İlk şarkıyı direkt çal
            await this.audioService.play(guildId, track);
          } else {
            this.audioService.addToQueue(guildId, track);
          }
          addedCount++;
        }
        
        await interaction.editReply({
          embeds: [{
            color: 0x00ff00,
            title: '📋 Playlist Eklendi',
            description: `**${addedCount}** şarkı kuyruğa eklendi`,
            fields: [
              { name: 'İlk Şarkı', value: results[0].title, inline: false },
              { name: 'Toplam Süre', value: this.calculateTotalDuration(results.slice(0, addedCount)), inline: true },
              { name: 'Platform', value: results[0].platform.toUpperCase(), inline: true },
            ],
            footer: { text: `İsteyen: ${interaction.user.username}` },
          }],
        });
      }

      // Kullanıcı aktivitesini güncelle
      await this.updateUserActivity(userId);
      
      logger.info(`Play komutu çalıştırıldı: "${query}" - ${results.length} sonuç (${guildId})`);
      
    } catch (error) {
      logger.error('Play komutu hatası:', error);
      
      const errorMessage = error instanceof Error ? error.message : MESSAGES.errors.tr.playbackFailed;
      await interaction.editReply({
        embeds: [{
          color: 0xff0000,
          title: '❌ Hata',
          description: errorMessage,
        }],
      });
    }
  }

  private async searchContent(query: string, userId: string): Promise<any[]> {
    // URL kontrolü
    if (this.isUrl(query)) {
      return await this.handleUrl(query, userId);
    }
    
    // Metin arama
    return await this.handleTextSearch(query, userId);
  }

  private async handleUrl(url: string, userId: string): Promise<any[]> {
    // Servislerin kontrolü
    if (!this.youtubeService || !this.spotifyService || !this.dataManager) {
      return [];
    }
    
    logger.info(`URL işleniyor: ${url}`);
    
    // YouTube URL
    if (this.youtubeService.isValidVideoUrl(url)) {
      const videoId = this.youtubeService.extractVideoId(url)!;
      const videoInfo = await this.youtubeService.getVideoInfo(videoId);
      
      if (videoInfo) {
        const searchResult = {
          id: videoInfo.id,
          title: videoInfo.title,
          description: videoInfo.description,
          thumbnail: videoInfo.thumbnail,
          duration: videoInfo.duration.toString(),
          url: videoInfo.url,
          platform: 'youtube',
          channelName: videoInfo.channelName,
          publishedAt: videoInfo.publishedAt,
        };
        
        const track = await this.youtubeService.convertToTrack(searchResult, userId);
        return [track];
      }
    }
    
    // YouTube Playlist
    if (this.youtubeService.isValidPlaylistUrl(url)) {
      const playlistId = this.youtubeService.extractPlaylistId(url)!;
      const videos = await this.youtubeService.getPlaylistVideos(playlistId, 50);
      
      const tracks = [];
      for (const video of videos) {
        const track = await this.youtubeService.convertToTrack(video, userId);
        tracks.push(track);
      }
      return tracks;
    }
    
    // Spotify URL kontrolü - daha kapsamlı
    if (this.spotifyService.isSpotifyUrl(url) || url.startsWith('spotify:')) {
      logger.info(`Spotify URL tespit edildi: ${url}`);
      
      // Spotify Track
      if (this.spotifyService.isValidTrackUrl(url)) {
        const trackId = this.spotifyService.extractTrackId(url)!;
        const trackInfo = await this.spotifyService.getTrack(trackId);
        
        if (trackInfo) {
          const searchResult = {
            id: trackInfo.id,
            title: trackInfo.name,
            description: `${trackInfo.artists.map(a => a.name).join(', ')} - ${trackInfo.album.name}`,
            thumbnail: trackInfo.album.images[0]?.url || '',
            duration: this.formatDuration(trackInfo.duration_ms),
            url: trackInfo.url,
            platform: 'spotify',
            channelName: trackInfo.artists.map(a => a.name).join(', '),
            publishedAt: trackInfo.album.releaseDate || '',
          };
          
          const track = await this.spotifyService.convertToTrack(searchResult, userId);
          return [track];
        }
      }
      
      // Spotify Album
      if (this.spotifyService.isValidAlbumUrl(url)) {
        const albumId = this.spotifyService.extractAlbumId(url)!;
        const albumTracks = await this.spotifyService.getAlbumTracks(albumId, 50);
        
        const tracks = [];
        for (const albumTrack of albumTracks) {
          const track = await this.spotifyService.convertToTrack(albumTrack, userId);
          tracks.push(track);
        }
        return tracks;
      }
      
      // Spotify Playlist
      if (this.spotifyService.isValidPlaylistUrl(url)) {
        const playlistId = this.spotifyService.extractPlaylistId(url)!;
        logger.info(`Spotify playlist ID çıkarıldı: ${playlistId}`);
        
        try {
          const playlistTracks = await this.spotifyService.getPlaylistTracks(playlistId, 100);
          
          const tracks = [];
          for (const playlistTrack of playlistTracks) {
            const track = await this.spotifyService.convertToTrack(playlistTrack, userId);
            tracks.push(track);
          }
          
          logger.info(`Spotify playlist işlendi: ${tracks.length} şarkı`);
          return tracks;
        } catch (error) {
          logger.error(`Spotify playlist hatası: ${playlistId}`, error);
          throw error;
        }
      }
      
      // Spotify URL'si ama tanınmayan format
      logger.warn(`Tanınmayan Spotify URL formatı: ${url}`);
      throw new Error('Desteklenmeyen Spotify URL formatı');
    }
    
    logger.warn(`Geçersiz URL: ${url}`);
    throw new Error(MESSAGES.errors.tr.invalidUrl);
  }

  private async handleTextSearch(query: string, userId: string): Promise<any[]> {
    // Servislerin kontrolü
    if (!this.youtubeService || !this.spotifyService || !this.dataManager) {
      return [];
    }
    
    // Önce YouTube'da ara
    const youtubeResults = await this.youtubeService.search(query, 5);
    
    if (youtubeResults.length > 0 && youtubeResults[0]) {
      // En iyi sonucu seç (ilk sonuç)
      const bestResult = youtubeResults[0];
      const track = await this.youtubeService.convertToTrack(bestResult, userId);
      return [track];
    }
    
    // YouTube'da bulunamazsa Spotify'da ara
    const spotifyResults = await this.spotifyService.search(query, 'track', 5);
    
    if (spotifyResults.length > 0 && spotifyResults[0]) {
      const bestResult = spotifyResults[0];
      const track = await this.spotifyService.convertToTrack(bestResult, userId);
      return [track];
    }
    
    return [];
  }

  private isUrl(text: string): boolean {
    try {
      // Standart URL kontrolü
      new URL(text);
      return true;
    } catch {
      // Spotify URI formatını kontrol et (spotify:playlist:xxxxx)
      if (text.startsWith('spotify:')) {
        return true;
      }
      return false;
    }
  }

  private formatDuration(durationMs: number): string {
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private calculateTotalDuration(tracks: any[]): string {
    let totalSeconds = 0;
    
    for (const track of tracks) {
      const [minutes, seconds] = track.duration.split(':').map(Number);
      totalSeconds += minutes * 60 + seconds;
    }
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
    }
  }

  private async updateUserActivity(userId: string): Promise<void> {
    try {
      if (!this.dataManager) {
        return;
      }
      
      let user = this.dataManager.getUser(userId);
      if (!user) {
        user = await this.dataManager.createUser(userId);
      } else {
        await this.dataManager.updateUser(user);
      }
    } catch (error) {
      logger.error('Kullanıcı aktivitesi güncellenemedi:', error);
    }
  }
}

// Default export for deploy script
export default PlayCommand;