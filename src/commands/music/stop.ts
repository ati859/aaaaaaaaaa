import { SlashCommandBuilder, GuildMember } from 'discord.js';
import { Command, CommandContext } from '../../types';
import { AudioService } from '../../services/audioService';
import { logger } from '../../utils/logger';
import { MESSAGES } from '../../config';

export class StopCommand implements Command {
  public readonly data = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Müziği durdurur ve kuyruğu temizler')
    .addBooleanOption(option =>
      option
        .setName('disconnect')
        .setDescription('Ses kanalından ayrıl')
        .setRequired(false)
    );

  public readonly category = 'music';
  public readonly cooldown = 3;
  public readonly permissions = [];
  public readonly voiceChannelRequired = true;
  public readonly sameVoiceChannelRequired = true;

  constructor(private audioService?: AudioService) {}

  async execute(context: CommandContext): Promise<void> {
    const { interaction } = context;
    const guildId = interaction.guildId!;
    const member = interaction.member as GuildMember;
    const shouldDisconnect = interaction.options.getBoolean('disconnect') || false;

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

      // Çalan veya kuyruktaki şarkı var mı?
      const currentTrack = this.audioService.getCurrentTrack(guildId);
      const queue = this.audioService.getQueue(guildId);
      const isPlaying = this.audioService.isPlaying(guildId);
      const isPaused = this.audioService.isPaused(guildId);

      if (!currentTrack && queue.length === 0 && !isPlaying && !isPaused) {
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

      // Müziği durdur ve kuyruğu temizle
      const success = this.audioService.stop(guildId);
      
      if (success) {
        let description = 'Müzik durduruldu ve kuyruk temizlendi.';
        
        if (currentTrack) {
          description = `**${currentTrack.title}** durduruldu ve kuyruk temizlendi.`;
        }
        
        if (queue.length > 0) {
          description += `\n\n${queue.length} şarkı kuyruktan çıkarıldı.`;
        }

        // Ses kanalından ayrıl
        if (shouldDisconnect) {
          this.audioService.disconnect(guildId);
          description += '\n\nSes kanalından ayrıldım.';
        }
        
        await interaction.reply({
          embeds: [{
            color: 0xff0000,
            title: shouldDisconnect ? '👋 Durduruldu ve Ayrıldı' : '⏹️ Durduruldu',
            description,
            thumbnail: currentTrack?.thumbnail ? { url: currentTrack.thumbnail } : undefined,
            footer: { text: `${member.user.username} tarafından durduruldu` },
          }],
        });
        
        logger.info(`Müzik durduruldu: ${member.user.username} (${guildId}) - Disconnect: ${shouldDisconnect}`);
      } else {
        await interaction.reply({
          embeds: [{
            color: 0xff0000,
            title: '❌ Hata',
            description: 'Müzik durdurulamadı. Lütfen tekrar deneyin.',
          }],
          ephemeral: true,
        });
      }
      
    } catch (error) {
      logger.error('Stop komutu hatası:', error);
      
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
export default StopCommand;