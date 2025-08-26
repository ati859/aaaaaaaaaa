import axios from 'axios';
import youtubedl from 'youtube-dl-exec';
import { exec } from 'child_process';
import { promisify } from 'util';
import { YouTubeVideoInfo, SearchResult, Track } from '../../types';
import { MESSAGES } from '../../config';
import { logger } from '../../utils/logger';

const execAsync = promisify(exec);

export class YouTubeService {
  private apiKey: string;
  private cookies: string;
  private baseUrl = 'https://www.googleapis.com/youtube/v3';
  private rateLimitDelay = 100; // ms
  private lastRequestTime = 0;

  constructor(apiKey: string, cookies: string = '') {
    this.apiKey = apiKey;
    this.cookies = cookies;
  }

  async search(query: string, maxResults: number = 10): Promise<SearchResult[]> {
    try {
      await this.handleRateLimit();

      const response = await axios.get(`${this.baseUrl}/search`, {
        params: {
          part: 'snippet',
          q: query,
          type: 'video',
          maxResults,
          key: this.apiKey,
          videoEmbeddable: 'true',
          videoSyndicated: 'true',
        },
        timeout: 10000,
      });

      const results: SearchResult[] = response.data.items.map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
        duration: '0:00', // Duration API'den ayrı çekilecek
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        platform: 'youtube',
        channelName: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
      }));

      // Duration bilgilerini al
      await this.addDurationInfo(results);

      logger.info(`YouTube arama tamamlandı: "${query}" - ${results.length} sonuç`);
      return results;
    } catch (error) {
      logger.error('YouTube arama hatası:', error);
      throw new Error(MESSAGES.errors.tr.searchFailed);
    }
  }

  async getVideoInfo(videoId: string): Promise<YouTubeVideoInfo | null> {
    try {
      await this.handleRateLimit();

      const response = await axios.get(`${this.baseUrl}/videos`, {
        params: {
          part: 'snippet,contentDetails,statistics',
          id: videoId,
          key: this.apiKey,
        },
        timeout: 10000,
      });

      if (!response.data.items || response.data.items.length === 0) {
        return null;
      }

      const video = response.data.items[0];
      const duration = this.parseDuration(video.contentDetails.duration);

      const videoInfo: YouTubeVideoInfo = {
        id: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnail: video.snippet.thumbnails.maxres?.url || 
                  video.snippet.thumbnails.high?.url || 
                  video.snippet.thumbnails.medium?.url,
        duration: parseInt(duration) || 0,
        url: `https://www.youtube.com/watch?v=${video.id}`,
        channelName: video.snippet.channelTitle,
        channel: video.snippet.channelTitle,
        publishedAt: video.snippet.publishedAt,






      };

      logger.info(`YouTube video bilgisi alındı: ${videoInfo.title}`);
      return videoInfo;
    } catch (error) {
      logger.error(`YouTube video bilgisi alınamadı (${videoId}):`, error);
      return null;
    }
  }

  async getStreamUrl(videoId: string, quality: 'low' | 'medium' | 'high' = 'medium'): Promise<string | null> {
    try {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      
      // İlk olarak normal yöntemle deneyelim
      try {
        const info = await youtubedl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          preferFreeFormats: true,
          ageLimit: 99,
          skipDownload: true,
          addHeader: [
            'referer:youtube.com',
            'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          ],
        });
        
        return this.processVideoInfo(info, quality);
      } catch (error: any) {
        // Yaş kısıtlaması hatası varsa, cookies ile tekrar deneyelim
         if (error.message && error.message.includes('Sign in to confirm your age')) {
           logger.info(`Yaş kısıtlamalı video tespit edildi, cookies ile deneniyor: ${videoId}`);
           
           if (this.cookies) {
             try {
               // Cookies dosyası kullanarak deneme
               const info = await youtubedl(url, {
                 dumpSingleJson: true,
                 noCheckCertificates: true,
                 noWarnings: true,
                 preferFreeFormats: true,
                 ageLimit: 99,
                 skipDownload: true,
                 cookies: this.cookies,
                 addHeader: [
                   'referer:youtube.com',
                   'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                 ],
               });
               
               return this.processVideoInfo(info, quality);
             } catch (cookieError) {
               logger.warn(`Cookies ile de başarısız oldu: ${videoId}`, cookieError);
               // Tarayıcı cookies ile son deneme
               try {
                 const command = `yt-dlp --cookies-from-browser chrome --dump-single-json --no-check-certificates --no-warnings --prefer-free-formats --age-limit 99 --skip-download --add-header "referer:youtube.com" --add-header "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
                 const { stdout } = await execAsync(command);
                 const info = JSON.parse(stdout);
                 
                 return this.processVideoInfo(info, quality);
               } catch (browserCookieError) {
                 logger.warn(`Tarayıcı cookies ile de başarısız oldu: ${videoId}`, browserCookieError);
                 throw error; // Orijinal hatayı fırlat
               }
             }
           } else {
             // Cookies yoksa tarayıcı cookies ile deneme
             try {
               const command = `yt-dlp --cookies-from-browser chrome --dump-single-json --no-check-certificates --no-warnings --prefer-free-formats --age-limit 99 --skip-download --add-header "referer:youtube.com" --add-header "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`;
               const { stdout } = await execAsync(command);
               const info = JSON.parse(stdout);
               
               return this.processVideoInfo(info, quality);
             } catch (browserCookieError) {
               logger.warn(`Tarayıcı cookies ile de başarısız oldu: ${videoId}`, browserCookieError);
               throw error; // Orijinal hatayı fırlat
             }
           }
         } else {
           throw error;
         }
      }
    } catch (error: any) {
      logger.error(`YouTube stream URL alınamadı (${videoId}):`, error);
      return null;
    }
  }
  
  private processVideoInfo(info: any, quality: 'low' | 'medium' | 'high'): string | null {
    if (!info.formats || info.formats.length === 0) {
      throw new Error('Video formatları bulunamadı');
    }

    // Ses formatlarını filtrele
    const audioFormats = info.formats.filter((format: any) => 
      format.acodec && format.acodec !== 'none' && !format.vcodec
    );

    if (audioFormats.length === 0) {
      // Ses formatı bulunamazsa, video+ses formatlarından en iyisini al
      const combinedFormats = info.formats.filter((format: any) => 
        format.acodec && format.acodec !== 'none' && format.vcodec && format.vcodec !== 'none'
      );
      
      if (combinedFormats.length > 0) {
        const bestFormat = this.selectBestFormat(combinedFormats, quality);
        return bestFormat.url;
      }
    } else {
      const bestFormat = this.selectBestFormat(audioFormats, quality);
      return bestFormat.url;
    }

    throw new Error('Uygun format bulunamadı');
  }

  async getPlaylistVideos(playlistId: string, maxResults: number = 50): Promise<SearchResult[]> {
    try {
      await this.handleRateLimit();

      const response = await axios.get(`${this.baseUrl}/playlistItems`, {
        params: {
          part: 'snippet',
          playlistId,
          maxResults,
          key: this.apiKey,
        },
        timeout: 15000,
      });

      const results: SearchResult[] = response.data.items
        .filter((item: any) => item.snippet.title !== 'Private video' && item.snippet.title !== 'Deleted video')
        .map((item: any) => ({
          id: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
          duration: '0:00',
          url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
          platform: 'youtube',
          channelName: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
        }));

      // Duration bilgilerini al
      await this.addDurationInfo(results);

      logger.info(`YouTube playlist videoları alındı: ${playlistId} - ${results.length} video`);
      return results;
    } catch (error) {
      logger.error(`YouTube playlist videoları alınamadı (${playlistId}):`, error);
      throw new Error(MESSAGES.errors.tr.playlistNotFound);
    }
  }

  async convertToTrack(searchResult: SearchResult, requestedBy: string = 'system'): Promise<Track> {
    return {
      url: searchResult.url || searchResult.id,
      title: searchResult.title,
      artist: searchResult.channelName || 'Bilinmeyen Sanatçı',
      duration: searchResult.duration,
      thumbnail: searchResult.thumbnail,
      platform: 'youtube' as const,
      platformId: searchResult.id,
      requestedBy,
    };
  }

  private async addDurationInfo(results: SearchResult[]): Promise<void> {
    if (results.length === 0) return;

    try {
      await this.handleRateLimit();

      const videoIds = results.map(r => r.id).join(',');
      const response = await axios.get(`${this.baseUrl}/videos`, {
        params: {
          part: 'contentDetails',
          id: videoIds,
          key: this.apiKey,
        },
        timeout: 10000,
      });

      const durations = new Map<string, string>();
      response.data.items.forEach((item: any) => {
        durations.set(item.id, this.parseDuration(item.contentDetails.duration));
      });

      results.forEach(result => {
        result.duration = durations.get(result.id) || '0:00';
      });
    } catch (error) {
      logger.error('Duration bilgileri alınamadı:', error);
    }
  }

  private selectBestFormat(formats: any[], quality: 'low' | 'medium' | 'high'): any {
    // Kalite tercihine göre format seç
    const qualityMap = {
      low: 64,
      medium: 128,
      high: 192,
    };

    const targetBitrate = qualityMap[quality];
    
    // En yakın bitrate'e sahip formatı bul
    let bestFormat = formats[0];
    let bestDiff = Math.abs((bestFormat.abr || 128) - targetBitrate);

    for (const format of formats) {
      const diff = Math.abs((format.abr || 128) - targetBitrate);
      if (diff < bestDiff) {
        bestFormat = format;
        bestDiff = diff;
      }
    }

    return bestFormat;
  }

  private parseDuration(isoDuration: string): string {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return '0:00';

    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
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
  extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }

    return null;
  }

  extractPlaylistId(url: string): string | null {
    const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    return match && match[1] ? match[1] : null;
  }

  isValidVideoUrl(url: string): boolean {
    return this.extractVideoId(url) !== null;
  }

  isValidPlaylistUrl(url: string): boolean {
    return this.extractPlaylistId(url) !== null;
  }

  async checkAgeRestriction(videoId: string): Promise<boolean> {
    try {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const info = await youtubedl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        skipDownload: true,
      });

      return info.age_limit > 0;
    } catch (error) {
      logger.error(`Yaş kısıtlaması kontrol edilemedi (${videoId}):`, error);
      return false;
    }
  }
}