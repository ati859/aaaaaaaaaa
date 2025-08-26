import winston from 'winston';
import { LogLevel } from '../types';
import path from 'path';
import fs from 'fs';

// Log klasörünü oluştur
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Winston logger konfigürasyonu
const winstonLogger = winston.createLogger({
  level: process.env['LOG_LEVEL'] || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'discord-music-bot' },
  transports: [
    // Hata logları için ayrı dosya
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Tüm loglar için genel dosya
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Development ortamında console'a da yazdır
if (process.env['NODE_ENV'] !== 'production') {
  winstonLogger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          let log = `${timestamp} [${level}]: ${message}`;
          
          // Ek metadata varsa ekle
          if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`;
          }
          
          return log;
        })
      ),
    })
  );
}

// Özel log fonksiyonları
class Logger {
  private winston: winston.Logger;

  constructor(winstonLogger: winston.Logger) {
    this.winston = winstonLogger;
  }

  info(message: string, meta?: any): void {
    this.winston.info(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.winston.warn(message, meta);
  }

  error(message: string, error?: Error | any, meta?: any): void {
    if (error instanceof Error) {
      this.winston.error(message, {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        ...meta,
      });
    } else {
      this.winston.error(message, { error, ...meta });
    }
  }

  debug(message: string, meta?: any): void {
    this.winston.debug(message, meta);
  }

  // Guild-specific logging
  guildLog(level: LogLevel, message: string, guildId: string, meta?: any): void {
    this.winston.log(level, message, {
      guildId,
      ...meta,
    });
  }

  // User-specific logging
  userLog(level: LogLevel, message: string, userId: string, guildId?: string, meta?: any): void {
    this.winston.log(level, message, {
      userId,
      guildId,
      ...meta,
    });
  }

  // Command logging
  commandLog(commandName: string, userId: string, guildId: string, success: boolean, meta?: any): void {
    this.winston.info(`Komut ${success ? 'başarılı' : 'başarısız'}: ${commandName}`, {
      command: commandName,
      userId,
      guildId,
      success,
      ...meta,
    });
  }

  // Audio logging
  audioLog(action: string, guildId: string, trackTitle?: string, meta?: any): void {
    this.winston.info(`Ses işlemi: ${action}`, {
      action,
      guildId,
      trackTitle,
      ...meta,
    });
  }

  // Performance logging
  performanceLog(operation: string, duration: number, meta?: any): void {
    this.winston.info(`Performans: ${operation} - ${duration}ms`, {
      operation,
      duration,
      ...meta,
    });
  }

  // API call logging
  apiLog(platform: string, endpoint: string, success: boolean, responseTime?: number, meta?: any): void {
    this.winston.info(`API çağrısı: ${platform} ${endpoint} - ${success ? 'başarılı' : 'başarısız'}`, {
      platform,
      endpoint,
      success,
      responseTime,
      ...meta,
    });
  }
}

// Logger instance'ını export et
export const logger = new Logger(winstonLogger);

// Winston logger'ı da export et (gerekirse)
export { winston };

// Log level helper
export function setLogLevel(level: LogLevel): void {
  winstonLogger.level = level;
}

// Log dosyalarını temizleme fonksiyonu
export function cleanOldLogs(daysToKeep: number = 7): void {
  const logFiles = fs.readdirSync(logDir);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  logFiles.forEach(file => {
    const filePath = path.join(logDir, file);
    const stats = fs.statSync(filePath);
    
    if (stats.mtime < cutoffDate) {
      fs.unlinkSync(filePath);
      logger.info(`Eski log dosyası silindi: ${file}`);
    }
  });
}

// Uygulama başlangıcında eski logları temizle
cleanOldLogs();