import dotenv from 'dotenv';
import path from 'path';

// Carrega o arquivo .env
dotenv.config();

export interface BotConfig {
  nodeEnv: 'development' | 'production' | 'test';
  botName: string;
  botPrefix: string;
  authDir: string;
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
  autoReadMessages: boolean;
  ignoreGroups: boolean;
  pairingNumber?: string;
  apiPort: number;
  apiKey?: string;
  geminiApiKey?: string;
  playboxBaseUrl: string;
  playboxApiKey?: string;
}

export const config: BotConfig = {
  nodeEnv: (process.env.NODE_ENV as BotConfig['nodeEnv']) || 'development',
  botName: process.env.BOT_NAME || 'Meu Bot WhatsApp',
  botPrefix: process.env.BOT_PREFIX || '!',
  authDir: path.resolve(process.cwd(), process.env.AUTH_DIR || './auth_info_baileys'),
  logLevel: (process.env.LOG_LEVEL as BotConfig['logLevel']) || 'info',
  autoReadMessages: process.env.AUTO_READ_MESSAGES === 'true',
  ignoreGroups: process.env.IGNORE_GROUPS === 'true',
  pairingNumber: process.env.PAIRING_NUMBER?.trim() || undefined,
  apiPort: Number(process.env.PORT || process.env.API_PORT || 3000),
  apiKey: process.env.API_KEY?.trim() || undefined,
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
  playboxBaseUrl: process.env.PLAYBOX_BASE_URL || 'http://playbox-scheduler:8080',
  playboxApiKey: process.env.PLAYBOX_API_KEY?.trim() || process.env.APP_API_KEY?.trim() || undefined,
};
