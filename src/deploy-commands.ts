// .env dosyasını en başta yükle
require('dotenv').config();

import { REST, Routes } from 'discord.js';
import { config } from './config';
import { logger } from './utils/logger';
import fs from 'fs';
import path from 'path';

async function deployCommands() {
  const commands: any[] = [];
  
  // Komutları yükle
  const commandsPath = path.join(__dirname, 'commands');
  const commandFolders = fs.readdirSync(commandsPath);
  
  for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    
    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
      const filePath = path.join(folderPath, file);
      const commandModule = require(filePath);
      
      // Default export veya named export'u kontrol et
      let command = commandModule.default || commandModule;
      
      // Eğer class ise instance oluştur
      if (typeof command === 'function' && command.prototype) {
        // Class constructor'ı ise, gerekli servisleri inject et
        try {
          // Şimdilik boş constructor ile test et
          command = new command();
        } catch (error) {
          logger.warn(`${filePath} dosyasında komut instance oluşturulamadı: ${error}`);
          continue;
        }
      }
      
      if (command && 'data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        logger.info(`Komut yüklendi: ${file}`);
      } else {
        logger.warn(`${filePath} dosyasında geçerli komut bulunamadı`);
      }
    }
  }
  
  // REST API ile komutları deploy et
  const rest = new REST().setToken(config.token);
  
  try {
    logger.info(`${commands.length} slash komut deploy ediliyor...`);
    
    // Test guild ID'si varsa guild-specific deploy et (hızlı test için)
    const testGuildId = process.env['TEST_GUILD_ID'];
    
    let data: any[];
    if (testGuildId) {
      logger.info(`Test sunucusuna (${testGuildId}) deploy ediliyor...`);
      data = await rest.put(
        Routes.applicationGuildCommands(config.clientId, testGuildId),
        { body: commands },
      ) as any[];
      logger.info(`${data.length} slash komut test sunucusuna başarıyla deploy edildi!`);
    } else {
      // Global komutları deploy et (1 saate kadar sürebilir)
      logger.info('Global komutlar deploy ediliyor (1 saate kadar sürebilir)...');
      data = await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands },
      ) as any[];
      logger.info(`${data.length} slash komut global olarak başarıyla deploy edildi!`);
    }
  } catch (error) {
    logger.error('Komutlar deploy edilirken hata oluştu:', error);
    process.exit(1);
  }
}

// Script çalıştırıldığında deploy et
if (require.main === module) {
  deployCommands()
    .then(() => {
      logger.info('Deploy işlemi tamamlandı!');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Deploy işlemi başarısız:', error);
      process.exit(1);
    });
}

export { deployCommands };