import { SlashCommandBuilder, GuildMember } from 'discord.js';
import { Command, CommandContext } from '../../types';
import { AudioService } from '../../services/audioService';
import { logger } from '../../utils/logger';
import { MESSAGES } from '../../config';

export class SkipCommand implements Command {
  public readonly data = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Şu anki şarkıyı atlar')
    .addIntegerOption(option =>
      option
        .setName('count')
        .setDescription('Atlanacak şarkı sayısı (varsayılan: 1)')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)
    );

  public readonly category = 'music';
  public readonly cooldown = 2;
  public readonly permissions = [];
  public readonly voiceChannelRequired = true;
  public readonly sameVoiceChannelRequired = true;

  constructor(private audioService?: AudioService) {}

  async execute(context: CommandContext): Promise<void> {
    const { interaction } = context;
    const guildId = interaction.guildId!;
    const member = interaction.member as GuildMember;
    const skipCount = interaction.options.getInteger('count') || 1;

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
      
      // Bot bağlı mı kontrol et
      if (!this.audioService.isConnected(guildId)) {
        await interaction.reply({
          embeds: [{
            color: 0xff0000,
            title: '❌ Hata',
            description: MESSAGES.errors.tr.notInVoiceChannel,
          }],
          ephemeral: true,
        });
        return;
      }

      // Çalan bir şarkı var mı?
      const currentTrack = this.audioService.getCurrentTrack(guildId);
      if (!currentTrack) {
        await interaction.reply({
          embeds: [{
            color: 0xff9900,
            title: '⚠️ Uyarı',
            description: MESSAGES.errors.tr.nothingPlaying,
          }],
          ephemeral: true,
        });
        return;
      }

      const queue = this.audioService.getQueue(guildId);
      
      // Tek şarkı atlama
      if (skipCount === 1) {
        const success = this.audioService.skip(guildId);
        
        if (success) {
          let description = `**${currentTrack.title}** atlandı.`;
          
          if (queue.length > 0 && queue[0]) {
            description += `\n\nSıradaki: **${queue[0].track.title}**`;
          } else {
            const autoplay = this.audioService.getAutoplay(guildId);
            if (autoplay) {
              description += '\n\nAutoplay açık, benzer şarkılar aranıyor...';
            } else {
              description += '\n\nKuyruk boş.';
            }
          }
          
          await interaction.reply({
            embeds: [{
              color: 0x00ff00,
              title: '⏭️ Atlandı',
              description,
              thumbnail: { url: currentTrack.thumbnail || '' },
              footer: { text: `${member.user.username} tarafından atlandı` },
            }],
          });
          
          logger.info(`Şarkı atlandı: ${currentTrack.title} - ${member.user.username} (${guildId})`);
        } else {
          await interaction.reply({
            embeds: [{
              color: 0xff0000,
              title: '❌ Hata',
              description: 'Şarkı atlanamadı. Lütfen tekrar deneyin.',
            }],
            ephemeral: true,
          });
        }
      } else {
        // Çoklu şarkı atlama
        if (queue.length === 0) {
          await interaction.reply({
            embeds: [{
              color: 0xff9900,
              title: '⚠️ Uyarı',
              description: 'Kuyrukta yeterli şarkı yok.',
            }],
            ephemeral: true,
          });
          return;
        }

        const actualSkipCount = Math.min(skipCount, queue.length + 1); // +1 for current track
        const skippedTracks = [currentTrack];
        
        // Kuyruktan şarkıları çıkar
        for (let i = 1; i < actualSkipCount && queue.length > 0; i++) {
          const removed = this.audioService.removeFromQueue(guildId, 0);
          if (removed) {
            skippedTracks.push(removed.track);
          }
        }
        
        // Şu anki şarkıyı atla
        const success = this.audioService.skip(guildId);
        
        if (success) {
          const remainingQueue = this.audioService.getQueue(guildId);
          
          let description = `**${actualSkipCount}** şarkı atlandı.`;
          
          if (remainingQueue.length > 0) {
            description += `\n\nŞimdi çalıyor: **${remainingQueue[0]?.track?.title || 'Bilinmeyen'}**`;
          } else {
            const autoplay = this.audioService.getAutoplay(guildId);
            if (autoplay) {
              description += '\n\nAutoplay açık, benzer şarkılar aranıyor...';
            } else {
              description += '\n\nKuyruk boş.';
            }
          }
          
          await interaction.reply({
            embeds: [{
              color: 0x00ff00,
              title: '⏭️ Çoklu Atlama',
              description,
              fields: [
                {
                  name: 'Atlanan Şarkılar',
                  value: skippedTracks.slice(0, 5).map((track, index) => 
                    `${index + 1}. ${track.title}`
                  ).join('\n') + (skippedTracks.length > 5 ? `\n... ve ${skippedTracks.length - 5} şarkı daha` : ''),
                  inline: false,
                },
              ],
              footer: { text: `${member.user.username} tarafından atlandı` },
            }],
          });
          
          logger.info(`${actualSkipCount} şarkı atlandı - ${member.user.username} (${guildId})`);
        } else {
          await interaction.reply({
            embeds: [{
              color: 0xff0000,
              title: '❌ Hata',
              description: 'Şarkılar atlanamadı. Lütfen tekrar deneyin.',
            }],
            ephemeral: true,
          });
        }
      }
      
    } catch (error) {
      logger.error('Skip komutu hatası:', error);
      
      await interaction.reply({
        embeds: [{
          color: 0xff0000,
          title: '❌ Hata',
          description: 'Bir hata oluştu. Lütfen tekrar deneyin.',
        }],
        ephemeral: true,
      });
    }
  }
}

// Default export for deploy script
export default SkipCommand;