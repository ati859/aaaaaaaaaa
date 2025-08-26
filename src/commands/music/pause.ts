import { SlashCommandBuilder, GuildMember } from 'discord.js';
import { Command, CommandContext } from '../../types';
import { AudioService } from '../../services/audioService';
import { logger } from '../../utils/logger';
import { MESSAGES } from '../../config';

export class PauseCommand implements Command {
  public readonly data = new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Çalan müziği duraklatır');

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

      // Şu anda çalan bir şarkı var mı?
      if (!this.audioService.isPlaying(guildId)) {
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

      // Zaten duraklatılmış mı?
      if (this.audioService.isPaused(guildId)) {
        await interaction.reply({
          embeds: [{
            color: 0xff9900,
            title: '⚠️ Uyarı',
            description: MESSAGES.errors.tr.alreadyPaused,
          }],
          ephemeral: true,
        });
        return;
      }

      // Müziği duraklat
      const success = this.audioService.pause(guildId);
      
      if (success) {
        const currentTrack = this.audioService.getCurrentTrack(guildId);
        
        await interaction.reply({
          embeds: [{
            color: 0xff9900,
            title: '⏸️ Duraklatıldı',
            description: currentTrack 
              ? `**${currentTrack.title}** duraklatıldı.\n\n\`/resume\` komutu ile devam ettirebilirsiniz.`
              : 'Müzik duraklatıldı.',
            thumbnail: currentTrack?.thumbnail ? { url: currentTrack.thumbnail } : undefined,
            footer: { text: `${member.user.username} tarafından duraklatıldı` },
          }],
        });
        
        logger.info(`Müzik duraklatıldı: ${member.user.username} (${guildId})`);
      } else {
        await interaction.reply({
          embeds: [{
            color: 0xff0000,
            title: '❌ Hata',
            description: 'Müzik duraklatılamadı. Lütfen tekrar deneyin.',
          }],
          ephemeral: true,
        });
      }
      
    } catch (error) {
      logger.error('Pause komutu hatası:', error);
      
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
export default PauseCommand;