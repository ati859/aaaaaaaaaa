import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Command, CommandContext } from '../../types';
import { AudioService } from '../../services/audioService';
import { logger } from '../../utils/logger';

export class QueueCommand implements Command {
  public readonly data = new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Müzik kuyruğunu gösterir')
    .addIntegerOption(option =>
      option
        .setName('page')
        .setDescription('Sayfa numarası (varsayılan: 1)')
        .setMinValue(1)
        .setRequired(false)
    );

  public readonly category = 'music';
  public readonly cooldown = 3;
  public readonly permissions = [];
  public readonly voiceChannelRequired = false;
  public readonly sameVoiceChannelRequired = false;

  constructor(private audioService?: AudioService) {}

  async execute(context: CommandContext): Promise<void> {
    const { interaction } = context;
    const guildId = interaction.guildId!;
    const page = interaction.options.getInteger('page') || 1;

    try {
      // AudioService kontrolü
      if (!this.audioService) {
        await interaction.reply({
          embeds: [{
            color: 0xff0000,
            title: '❌ Hata',
            description: 'Audio service is not available.',
          }],
          ephemeral: true,
        });
        return;
      }
      
      const currentTrack = this.audioService.getCurrentTrack(guildId);
      const queue = this.audioService.getQueue(guildId);
      const isPlaying = this.audioService.isPlaying(guildId);
      const isPaused = this.audioService.isPaused(guildId);
      const loopMode = this.audioService.getLoopMode(guildId);
      const autoplay = this.audioService.getAutoplay(guildId);
      const volume = this.audioService.getVolume(guildId);

      // Hiçbir şey çalmıyor ve kuyruk boş
      if (!currentTrack && queue.length === 0) {
        await interaction.reply({
          embeds: [{
            color: 0xff9900,
            title: '📭 Boş Kuyruk',
            description: 'Şu anda çalan müzik yok ve kuyruk boş.\n\n`/play` komutu ile müzik çalmaya başlayabilirsiniz.',
          }],
          ephemeral: true,
        });
        return;
      }

      const itemsPerPage = 10;
      const totalPages = Math.ceil(queue.length / itemsPerPage);
      const validPage = Math.min(Math.max(1, page), Math.max(1, totalPages));
      const startIndex = (validPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      const pageQueue = queue.slice(startIndex, endIndex);

      const embed = new EmbedBuilder()
        .setColor(isPlaying ? 0x00ff00 : isPaused ? 0xff9900 : 0x808080)
        .setTitle('🎵 Müzik Kuyruğu')
        .setTimestamp();

      // Şu anda çalan şarkı
      if (currentTrack) {
        const status = isPlaying ? '▶️ Çalıyor' : isPaused ? '⏸️ Duraklatıldı' : '⏹️ Durduruldu';
        
        embed.addFields({
          name: `${status} - Şimdi`,
          value: `**${currentTrack.title}**\n${currentTrack.artist} • ${currentTrack.duration}\nİsteyen: <@${currentTrack.requestedBy}>`,
          inline: false,
        });
      }

      // Kuyruk
      if (queue.length > 0) {
        if (pageQueue.length > 0) {
          const queueText = pageQueue.map((item, index) => {
            const position = startIndex + index + 1;
            const addedTime = new Date(item.addedAt).toLocaleTimeString('tr-TR', {
              hour: '2-digit',
              minute: '2-digit',
            });
            
            return `**${position}.** ${item.track.title}\n` +
                   `${item.track.artist} • ${item.track.duration}\n` +
                   `İsteyen: <@${item.track.requestedBy}> • ${addedTime}`;
          }).join('\n\n');

          embed.addFields({
            name: `📋 Kuyruk (${queue.length} şarkı)`,
            value: queueText,
            inline: false,
          });
        }

        // Sayfa bilgisi
        if (totalPages > 1) {
          embed.setFooter({
            text: `Sayfa ${validPage}/${totalPages} • Toplam ${queue.length} şarkı`,
          });
        } else {
          embed.setFooter({
            text: `Toplam ${queue.length} şarkı`,
          });
        }
      } else {
        embed.addFields({
          name: '📋 Kuyruk',
          value: 'Kuyruk boş',
          inline: false,
        });
      }

      // Ayarlar
      const settings = [];
      if (loopMode !== 'none') {
        const loopEmoji = loopMode === 'track' ? '🔂' : '🔁';
        const loopText = loopMode === 'track' ? 'Şarkı' : 'Kuyruk';
        settings.push(`${loopEmoji} ${loopText}`);
      }
      if (autoplay) {
        settings.push('🎲 Autoplay');
      }
      settings.push(`🔊 ${volume}%`);

      if (settings.length > 0) {
        embed.addFields({
          name: '⚙️ Ayarlar',
          value: settings.join(' • '),
          inline: false,
        });
      }

      // Toplam süre hesapla
      if (queue.length > 0) {
        const totalDuration = this.calculateTotalDuration(queue.map(item => item.track));
        embed.addFields({
          name: '⏱️ Toplam Süre',
          value: totalDuration,
          inline: true,
        });
      }

      await interaction.reply({ embeds: [embed] });
      
      logger.info(`Queue komutu çalıştırıldı: Sayfa ${validPage} (${guildId})`);
      
    } catch (error) {
      logger.error('Queue komutu hatası:', error);
      
      await interaction.reply({
        embeds: [{
          color: 0xff0000,
          title: '❌ Hata',
          description: 'Kuyruk gösterilirken bir hata oluştu.',
        }],
        ephemeral: true,
      });
    }
  }

  private calculateTotalDuration(tracks: any[]): string {
    let totalSeconds = 0;
    
    for (const track of tracks) {
      const duration = track.duration || '0:00';
      const parts = duration.split(':');
      
      if (parts.length === 2) {
        // MM:SS format
        const [minutes, seconds] = parts.map(Number);
        totalSeconds += minutes * 60 + seconds;
      } else if (parts.length === 3) {
        // HH:MM:SS format
        const [hours, minutes, seconds] = parts.map(Number);
        totalSeconds += hours * 3600 + minutes * 60 + seconds;
      }
    }
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  }
}

// Default export for deploy script
export default QueueCommand;