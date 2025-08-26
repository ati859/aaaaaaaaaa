import SpotifyWebApi from 'spotify-web-api-node';
import { SpotifyTrackInfo, SearchResult, Track } from '../../types';
import { MESSAGES } from '../../config';
import { logger } from '../../utils/logger';

export class SpotifyService {
  private spotify: SpotifyWebApi;
  private tokenExpiresAt: number = 0;
  private rateLimitDelay = 100; // ms
  private lastRequestTime = 0;

  constructor(clientId: string, clientSecret: string) {
    this.spotify = new SpotifyWebApi({
      clientId,
      clientSecret,
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.refreshAccessToken();
      logger.info('Spotify servisi başarıyla başlatıldı');
    } catch (error) {
      logger.error('Spotify servisi başlatılamadı:', error);
      throw error;
    }
  }

  private async refreshAccessToken(): Promise<void> {
    try {
      const data = await this.spotify.clientCredentialsGrant();
      this.spotify.setAccessToken(data.body.access_token);
      this.tokenExpiresAt = Date.now() + (data.body.expires_in * 1000) - 60000; // 1 dakika önce yenile
      
      logger.info('Spotify access token yenilendi');
    } catch (error) {
      logger.error('Spotify access token yenilenemedi:', error);
      throw error;
    }
  }

  private async ensureValidToken(): Promise<void> {
    if (Date.now() >= this.tokenExpiresAt) {
      await this.refreshAccessToken();
    }
  }

  async search(query: string, type: 'track' | 'album' | 'playlist' = 'track', limit: number = 20): Promise<SearchResult[]> {
    try {
      await this.ensureValidToken();
      await this.handleRateLimit();

      const response = await this.spotify.search(query, [type], { limit });
      
      let results: SearchResult[] = [];

      if (type === 'track' && response.body.tracks) {
        results = response.body.tracks.items.map((track: any) => this.convertTrackToSearchResult(track));
      } else if (type === 'album' && response.body.albums) {
        results = response.body.albums.items.map((album: any) => this.convertAlbumToSearchResult(album));
      } else if (type === 'playlist' && response.body.playlists) {
        results = response.body.playlists.items.map((playlist: any) => this.convertPlaylistToSearchResult(playlist));
      }

      logger.info(`Spotify arama tamamlandı: "${query}" (${type}) - ${results.length} sonuç`);
      return results;
    } catch (error) {
      logger.error('Spotify arama hatası:', error);
      throw new Error(MESSAGES.errors.tr.searchFailed);
    }
  }

  async getTrack(trackId: string): Promise<SpotifyTrackInfo | null> {
    try {
      await this.ensureValidToken();
      await this.handleRateLimit();

      const response = await this.spotify.getTrack(trackId);
      const track = response.body;

      const trackInfo: SpotifyTrackInfo = {
        id: track.id,
        name: track.name,
        artists: track.artists.map((artist: any) => ({
          id: artist.id,
          name: artist.name,
          url: artist.external_urls.spotify,
        })),
        album: {
          id: track.album.id,
          name: track.album.name,
          images: track.album.images.map(img => ({
            url: img.url,
            height: img.height || 0,
            width: img.width || 0
          })),
          releaseDate: track.album.release_date,
          url: track.album.external_urls.spotify,
        },
        duration_ms: track.duration_ms,
        duration: this.formatDuration(track.duration_ms),
        external_urls: track.external_urls,
        popularity: track.popularity,
        previewUrl: track.preview_url || undefined,
        url: track.external_urls.spotify,
        isrc: track.external_ids?.isrc,
        explicit: track.explicit,
        markets: track.available_markets,
      };

      logger.info(`Spotify track bilgisi alındı: ${trackInfo.name}`);
      return trackInfo;
    } catch (error) {
      logger.error(`Spotify track bilgisi alınamadı (${trackId}):`, error);
      return null;
    }
  }

  async getAlbumTracks(albumId: string, limit: number = 50): Promise<SearchResult[]> {
    try {
      await this.ensureValidToken();
      await this.handleRateLimit();

      const response = await this.spotify.getAlbumTracks(albumId, { limit });
      const albumInfo = await this.spotify.getAlbum(albumId);
      
      const results: SearchResult[] = response.body.items.map((track: any) => ({
        id: track.id,
        title: track.name,
        description: `${track.artists.map((a: any) => a.name).join(', ')} - ${albumInfo.body.name}`,
        thumbnail: albumInfo.body.images[0]?.url || '',
        duration: this.formatDuration(track.duration_ms),
        url: track.external_urls.spotify,
        platform: 'spotify',
        channelName: track.artists.map((a: any) => a.name).join(', '),
        publishedAt: albumInfo.body.release_date,
      }));

      logger.info(`Spotify albüm şarkıları alındı: ${albumId} - ${results.length} şarkı`);
      return results;
    } catch (error) {
      logger.error(`Spotify albüm şarkıları alınamadı (${albumId}):`, error);
      throw new Error(MESSAGES.errors.tr.playlistNotFound);
    }
  }

  async getPlaylistTracks(playlistId: string, limit: number = 100): Promise<SearchResult[]> {
    try {
      await this.ensureValidToken();
      await this.handleRateLimit();

      // Önce playlist erişilebilirliğini kontrol et
      try {
        await this.ensureValidToken();
        await this.spotify.getPlaylist(playlistId);
      } catch (playlistError: any) {
        // Eğer playlist bulunamazsa, farklı market ile dene
        logger.warn(`Playlist bulunamadı, farklı market ile deneniyor: ${playlistId}`);
        try {
          await this.ensureValidToken();
          await this.spotify.getPlaylist(playlistId, { market: 'US' });
        } catch (marketError) {
          logger.warn(`US market ile de bulunamadı, global market ile deneniyor: ${playlistId}`);
          await this.ensureValidToken();
          await this.spotify.getPlaylist(playlistId, { market: 'from_token' });
        }
      }

      // Playlist şarkılarını al - token'ı tekrar kontrol et
      await this.ensureValidToken();
      const response = await this.spotify.getPlaylistTracks(playlistId, { 
        limit,
        market: 'from_token'
      });
      
      const results: SearchResult[] = response.body.items
        .filter((item: any) => item.track && item.track.type === 'track' && item.track.id)
        .map((item: any) => {
          const track = item.track as any;
          return {
            id: track.id,
            title: track.name,
            description: `${track.artists.map((a: any) => a.name).join(', ')} - ${track.album.name}`,
            thumbnail: track.album.images[0]?.url || '',
            duration: this.formatDuration(track.duration_ms),
            url: track.external_urls.spotify,
            platform: 'spotify',
            channelName: track.artists.map((a: any) => a.name).join(', '),
            publishedAt: track.album.release_date,
          };
        });

      logger.info(`Spotify playlist şarkıları alındı: ${playlistId} - ${results.length} şarkı`);
      return results;
    } catch (error: any) {
      logger.error(`Spotify playlist şarkıları alınamadı (${playlistId}):`, error);
      
      // Hata detaylarını logla
      if (error.body) {
        logger.error(`Spotify API hatası:`, error.body);
      }
      
      throw new Error(MESSAGES.errors.tr.playlistNotFound);
    }
  }

  async getRecommendations(seedTracks: string[], limit: number = 20): Promise<SearchResult[]> {
    try {
      await this.ensureValidToken();
      await this.handleRateLimit();

      const response = await this.spotify.getRecommendations({
        seed_tracks: seedTracks.slice(0, 5), // Maksimum 5 seed track
        limit,
      });

      const results: SearchResult[] = response.body.tracks.map((track: any) => this.convertTrackToSearchResult(track));

      logger.info(`Spotify önerileri alındı: ${results.length} şarkı`);
      return results;
    } catch (error) {
      logger.error('Spotify önerileri alınamadı:', error);
      throw new Error(MESSAGES.errors.tr.searchFailed);
    }
  }

  async convertToTrack(searchResult: SearchResult, requestedBy: string): Promise<Track> {
    const trackInfo = await this.getTrack(searchResult.id);
    
    return {
      id: searchResult.id,
      title: searchResult.title,
      artist: searchResult.channelName || 'Bilinmeyen Sanatçı',
      duration: searchResult.duration,
      url: searchResult.url,
      thumbnail: searchResult.thumbnail,
      platform: 'spotify',
      platformId: searchResult.id,
      requestedBy,
      addedAt: new Date().toISOString(),
      metadata: {
        description: searchResult.description,
        popularity: trackInfo?.popularity || 0,
        explicit: trackInfo?.explicit || false,
        previewUrl: trackInfo?.previewUrl,
        isrc: trackInfo?.isrc,
        albumName: trackInfo?.album.name,
        releaseDate: trackInfo?.album.releaseDate,
        artists: trackInfo?.artists || [],
      },
    };
  }

  private convertTrackToSearchResult(track: any): SearchResult {
    return {
      id: track.id,
      title: track.name,
      description: `${track.artists.map((a: any) => a.name).join(', ')} - ${track.album.name}`,
      thumbnail: track.album.images[0]?.url || '',
      duration: this.formatDuration(track.duration_ms),
      url: track.external_urls.spotify,
      platform: 'spotify',
      channelName: track.artists.map((a: any) => a.name).join(', '),
      publishedAt: track.album.release_date,
    };
  }

  private convertAlbumToSearchResult(album: any): SearchResult {
    return {
      id: album.id,
      title: album.name,
      description: `Albüm - ${album.artists.map((a: any) => a.name).join(', ')} (${album.total_tracks} şarkı)`,
      thumbnail: album.images[0]?.url || '',
      duration: `${album.total_tracks} şarkı`,
      url: album.external_urls.spotify,
      platform: 'spotify',
      channelName: album.artists.map((a: any) => a.name).join(', '),
      publishedAt: album.release_date,
    };
  }

  private convertPlaylistToSearchResult(playlist: any): SearchResult {
    return {
      id: playlist.id,
      title: playlist.name,
      description: `Playlist - ${playlist.description || 'Açıklama yok'} (${playlist.tracks.total} şarkı)`,
      thumbnail: playlist.images[0]?.url || '',
      duration: `${playlist.tracks.total} şarkı`,
      url: playlist.external_urls.spotify,
      platform: 'spotify',
      channelName: playlist.owner.display_name || 'Bilinmeyen',
      publishedAt: '',
    };
  }

  private formatDuration(durationMs: number): string {
    const totalSeconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private async handleRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
    }
    
    this.lastRequestTime = Date.now();
  }

  // Utility methods
  extractTrackId(url: string): string | null {
    const patterns = [
      /spotify\.com\/track\/([a-zA-Z0-9]{22})/,
      /open\.spotify\.com\/track\/([a-zA-Z0-9]{22})/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }

    return null;
  }

  extractAlbumId(url: string): string | null {
    const patterns = [
      /spotify\.com\/album\/([a-zA-Z0-9]{22})/,
      /open\.spotify\.com\/album\/([a-zA-Z0-9]{22})/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }

    return null;
  }

  extractPlaylistId(url: string): string | null {
    const patterns = [
      /spotify\.com\/playlist\/([a-zA-Z0-9_-]+)(?:\?.*)?/,
      /open\.spotify\.com\/playlist\/([a-zA-Z0-9_-]+)(?:\?.*)?/,
      /spotify:\/\/playlist:([a-zA-Z0-9_-]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }

    return null;
  }

  isValidTrackUrl(url: string): boolean {
    return this.extractTrackId(url) !== null;
  }

  isValidAlbumUrl(url: string): boolean {
    return this.extractAlbumId(url) !== null;
  }

  isValidPlaylistUrl(url: string): boolean {
    return this.extractPlaylistId(url) !== null;
  }

  isSpotifyUrl(url: string): boolean {
    return url.includes('spotify.com') || url.includes('open.spotify.com') || url.startsWith('spotify:');
  }

  async searchForYouTube(spotifyTrack: SpotifyTrackInfo): Promise<string> {
    // Spotify şarkısını YouTube'da arama için query oluştur
    const artists = spotifyTrack.artists.map(a => a.name).join(' ');
    const query = `${artists} ${spotifyTrack.name}`;
    
    // Gereksiz kelimeleri temizle
    const cleanQuery = query
      .replace(/\(.*?\)/g, '') // Parantez içindeki metinleri kaldır
      .replace(/\[.*?\]/g, '') // Köşeli parantez içindeki metinleri kaldır
      .replace(/feat\.|ft\.|featuring/gi, '') // Featuring kelimelerini kaldır
      .replace(/remix|remaster|remastered/gi, '') // Remix/remaster kelimelerini kaldır
      .replace(/\s+/g, ' ') // Çoklu boşlukları tek boşluk yap
      .trim();

    return cleanQuery;
  }

  getArtistNames(trackInfo: SpotifyTrackInfo): string[] {
    return trackInfo.artists.map(artist => artist.name);
  }

  getMainArtist(trackInfo: SpotifyTrackInfo): string {
    return trackInfo.artists[0]?.name || 'Bilinmeyen Sanatçı';
  }

  async getArtistTopTracks(artistId: string, country: string = 'TR'): Promise<SearchResult[]> {
    try {
      await this.ensureValidToken();
      await this.handleRateLimit();

      const response = await this.spotify.getArtistTopTracks(artistId, country);
      
      const results: SearchResult[] = response.body.tracks.map((track: any) => this.convertTrackToSearchResult(track));

      logger.info(`Sanatçının popüler şarkıları alındı: ${artistId} - ${results.length} şarkı`);
      return results;
    } catch (error) {
      logger.error(`Sanatçının popüler şarkıları alınamadı (${artistId}):`, error);
      return [];
    }
  }
}