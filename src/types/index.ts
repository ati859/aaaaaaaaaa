// Discord müzik botu için tip tanımlamaları

export interface Track {
  id?: string;
  title: string;
  artist: string;
  duration: string;
  platform: 'spotify' | 'youtube';
  platformId: string;
  url: string;
  thumbnail: string;
  requestedBy: string; // Discord user ID
  addedAt?: string;
  metadata?: any;
}

export interface Playlist {
  id: string;
  name: string;
  owner: string; // Discord user ID
  tracks: Track[];
  isPublic: boolean;
  sharedWith: string[]; // Discord user ID'leri
  createdAt: string;
  updatedAt: string;
}

export interface User {
  discordId: string;
  playlists: string[]; // playlist ID'leri
  settings: UserSettings;
  createdAt: string;
  lastActive: string;
}

export interface UserSettings {
  language: 'tr' | 'en';
  autoplay: boolean;
  quality: 'low' | 'medium' | 'high';
  notifications: boolean;
  volume: number; // 0-100
}

export interface QueueItem {
  track: Track;
  requestedBy: string;
  addedAt: string;
}

export interface GuildMusicData {
  guildId: string;
  queue: QueueItem[];
  currentTrack: Track | null;
  isPlaying: boolean;
  isPaused: boolean;
  volume: number;
  loop: 'none' | 'track' | 'queue';
  loopMode: 'none' | 'track' | 'queue';
  autoplay: boolean;
  textChannelId: string | null;
  voiceChannelId: string | null;
}

export interface SpotifyTrackInfo {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  duration_ms: number;
  duration: string;
  url: string;
  external_urls: { spotify: string };
  album: {
    id: string;
    name: string;
    images: Array<{ url: string; height: number; width: number }>;
    releaseDate?: string;
    url: string;
  };
  previewUrl?: string | undefined;
  isrc?: string | undefined;
  explicit?: boolean | undefined;
  popularity?: number | undefined;
  markets?: string[] | undefined;
}

export interface YouTubeVideoInfo {
  id: string;
  title: string;
  description: string;
  channel: string;
  channelName: string;
  duration: number;
  thumbnail: string;
  url: string;
  publishedAt: string;
}

export interface SearchResult {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  url: string;
  platform: string;
  channelName: string;
  publishedAt: string;
}

export interface CommandContext {
  interaction: any; // ChatInputCommandInteraction from discord.js
  guildId: string;
  userId: string;
  channelId: string;
  voiceChannelId?: string | null;
}

export interface BotConfig {
  token: string;
  clientId: string;
  spotify: {
    clientId: string;
    clientSecret: string;
  };
  youtube: {
    apiKey: string;
    cookies: string;
  };
  defaultSettings: UserSettings;
}

export interface AudioResource {
  url: string;
  title: string;
  duration: number;
  bitrate?: number;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface Command {
  data: any; // SlashCommandBuilder from discord.js
  category: string;
  cooldown: number;
  permissions: string[];
  voiceChannelRequired: boolean;
  sameVoiceChannelRequired: boolean;
  execute(context: CommandContext): Promise<void>;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  guildId?: string;
  userId?: string;
  error?: Error;
}