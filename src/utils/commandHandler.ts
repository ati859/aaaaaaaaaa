import {
  Client,
  Collection,
  CommandInteraction,
  SlashCommandBuilder,
  REST,
  Routes,
  GuildMember,
} from 'discord.js';
import { config, ERROR_MESSAGES, BOT_SETTINGS } from '../config';
import { logger } from './logger';
import { CommandContext } from '../types';

export interface Command {
  data: SlashCommandBuilder;
  execute: (context: CommandContext) => Promise<void>;
  cooldown?: number;
  permissions?: string[];
  voiceChannelRequired?: boolean;
  sameVoiceChannelRequired?: boolean;
}

export class CommandHandler {
  private client: Client;
  private commands: Collection<string, Command>;
  private cooldowns: Collection<string, Collection<string, number>>;

  constructor(client: Client, commands: Collection<string, Command>) {
    this.client = client;
    this.commands = commands;
    this.cooldowns = new Collection();

    this.setupInteractionHandler();
  }

  private setupInteractionHandler(): void {
    this.client.on('interactionCreate', async interaction => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);
      if (!command) {
        logger.warn(`Bilinmeyen komut: ${interaction.commandName}`);
        return;
      }

      try {
        // Komut context'ini oluştur
        const context: CommandContext = {
          interaction: interaction,
          guildId: interaction.guildId!,
          userId: interaction.user.id,
          channelId: interaction.channelId,
          voiceChannelId: (interaction.member as GuildMember)?.voice?.channelId,
        };

        // Ön kontroller
        const checkResult = await this.runPreChecks(interaction, command, context);
        if (!checkResult.success) {
          await interaction.reply({
            content: checkResult.message || 'Bir hata oluştu.',
            ephemeral: true,
          });
          return;
        }

        // Komutu çalıştır
        await command.execute(context);

        // Başarılı komut logla
        logger.commandLog(
          interaction.commandName,
          interaction.user.id,
          interaction.guildId!,
          true
        );
      } catch (error) {
        logger.error(
          `Komut çalıştırılırken hata: ${interaction.commandName}`,
          error,
          {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName: interaction.commandName,
          }
        );

        // Hata mesajını kullanıcıya göster
        const errorMessage = ERROR_MESSAGES.tr.internalError;
        
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
              content: errorMessage,
              ephemeral: true,
            });
          } else {
            await interaction.reply({
              content: errorMessage,
              ephemeral: true,
            });
          }
        } catch (replyError) {
          logger.error('Hata mesajı gönderilemedi:', replyError);
        }

        // Başarısız komut logla
        logger.commandLog(
          interaction.commandName,
          interaction.user.id,
          interaction.guildId!,
          false
        );
      }
    });
  }

  private async runPreChecks(
    interaction: CommandInteraction,
    command: Command,
    context: CommandContext
  ): Promise<{ success: boolean; message?: string }> {
    // Cooldown kontrolü
    const cooldownCheck = this.checkCooldown(interaction, command);
    if (!cooldownCheck.success) {
      return cooldownCheck;
    }

    // Ses kanalı kontrolü
    if (command.voiceChannelRequired) {
      if (!context.voiceChannelId) {
        return {
          success: false,
          message: ERROR_MESSAGES.tr.notInVoiceChannel,
        };
      }
    }

    // Aynı ses kanalı kontrolü
    if (command.sameVoiceChannelRequired) {
      const botVoiceChannelId = interaction.guild?.members?.me?.voice?.channelId;
      
      if (!botVoiceChannelId) {
        return {
          success: false,
          message: ERROR_MESSAGES.tr.botNotInVoiceChannel,
        };
      }

      if (context.voiceChannelId !== botVoiceChannelId) {
        return {
          success: false,
          message: ERROR_MESSAGES.tr.differentVoiceChannel,
        };
      }
    }

    // İzin kontrolü
    if (command.permissions && command.permissions.length > 0) {
      const member = interaction.member as GuildMember;
      const hasPermission = command.permissions.some(permission =>
        member.permissions.has(permission as any)
      );

      if (!hasPermission) {
        return {
          success: false,
          message: ERROR_MESSAGES.tr.noPermission,
        };
      }
    }

    return { success: true };
  }

  private checkCooldown(
    interaction: CommandInteraction,
    command: Command
  ): { success: boolean; message?: string } {
    const cooldownAmount = (command.cooldown ?? BOT_SETTINGS.commandCooldown);
    const userId = interaction.user.id;
    const commandName = interaction.commandName;

    if (!this.cooldowns.has(commandName)) {
      this.cooldowns.set(commandName, new Collection());
    }

    const now = Date.now();
    const timestamps = this.cooldowns.get(commandName)!;
    const expirationTime = timestamps.get(userId);

    if (expirationTime && now < expirationTime) {
      const timeLeft = (expirationTime - now) / 1000;
      return {
        success: false,
        message: `${ERROR_MESSAGES.tr.rateLimited} (${timeLeft.toFixed(1)}s)`,
      };
    }

    timestamps.set(userId, now + cooldownAmount);
    setTimeout(() => timestamps.delete(userId), cooldownAmount);

    return { success: true };
  }

  async registerCommands(): Promise<void> {
    try {
      logger.info('Slash komutları kaydediliyor...');

      const rest = new REST({ version: '10' }).setToken(config.token);
      const commandData = this.commands.map(command => command.data.toJSON());

      // Global komutları kaydet
      await rest.put(Routes.applicationCommands(config.clientId), {
        body: commandData,
      });

      logger.info(`${commandData.length} slash komutu başarıyla kaydedildi`);
    } catch (error) {
      logger.error('Slash komutları kaydedilirken hata oluştu:', error);
      throw error;
    }
  }

  async registerGuildCommands(guildId: string): Promise<void> {
    try {
      logger.info(`Guild komutları kaydediliyor: ${guildId}`);

      const rest = new REST({ version: '10' }).setToken(config.token);
      const commandData = this.commands.map(command => command.data.toJSON());

      // Guild-specific komutları kaydet (test için)
      await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), {
        body: commandData,
      });

      logger.info(`${commandData.length} guild komutu başarıyla kaydedildi: ${guildId}`);
    } catch (error) {
      logger.error('Guild komutları kaydedilirken hata oluştu:', error);
      throw error;
    }
  }

  getCommand(name: string): Command | undefined {
    return this.commands.get(name);
  }

  getAllCommands(): Collection<string, Command> {
    return this.commands;
  }

  getCommandNames(): string[] {
    return Array.from(this.commands.keys());
  }

  // Cooldown'ları temizle
  clearCooldowns(): void {
    this.cooldowns.clear();
    logger.info('Tüm cooldown\'lar temizlendi');
  }

  // Belirli kullanıcının cooldown'larını temizle
  clearUserCooldowns(userId: string): void {
    this.cooldowns.forEach(commandCooldowns => {
      commandCooldowns.delete(userId);
    });
    logger.info(`Kullanıcı cooldown\'ları temizlendi: ${userId}`);
  }
}