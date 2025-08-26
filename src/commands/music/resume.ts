import { SlashCommandBuilder, GuildMember } from 'discord.js';
import { Command, CommandContext } from '../../types';
import { AudioService } from '../../services/audioService';
import { logger } from '../../utils/logger';
import { MESSAGES } from '../../config';

export class ResumeCommand implements Command {
  public readonly data = new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Duraklatılmış müziği devam ettirir');

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

      // Duraklatılmış bir şarkı var mı?
      if (!this.audioService.isPaused(guildId)) {
        if (this.audioService.isPlaying(guildId)) {
          await interaction.reply({
            embeds: [{
              color: 0xff9900,
              title: '⚠️ Uyarı',
              description: MESSAGES.errors.tr.alreadyPlaying,
            }],
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            embeds: [{
              color: 0xff9900,
              title: '⚠️ Uyarı',
              description: MESSAGES.errors.tr.nothingPlaying,
            }],
            ephemeral: true,
          });
        }
        return;
      }

      // Müziği devam ettir
      const success = this.audioService.resume(guildId);
      
      if (success) {
        const currentTrack = this.audioService.getCurrentTrack(guildId);
        
        await interaction.reply({
          embeds: [{
            color: 0x00ff00,
            title: '▶️ Devam Ediyor',
            description: currentTrack 
              ? `**${currentTrack.title}** devam ediyor.`
              : 'Müzik devam ediyor.',
            thumbnail: currentTrack?.thumbnail ? { url: currentTrack.thumbnail } : undefined,
            fields: currentTrack ? [
              { name: 'Sanatçı', value: currentTrack.artist, inline: true },
              { name: 'Süre', value: currentTrack.duration, inline: true },
              { name: 'Platform', value: currentTrack.platform.toUpperCase(), inline: true },
            ] : [],
            footer: { text: `${member.user.username} tarafından devam ettirildi` },
          }],
        });
        
        logger.info(`Müzik devam ettirildi: ${member.user.username} (${guildId})`);
      } else {
        await interaction.reply({
          embeds: [{
            color: 0xff0000,
            title: '❌ Hata',
            description: 'Müzik devam ettirilemedi. Lütfen tekrar deneyin.',
          }],
          ephemeral: true,
        });
      }
      
    } catch (error) {
      logger.error('Resume komutu hatası:', error);
      
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
export default ResumeCommand;