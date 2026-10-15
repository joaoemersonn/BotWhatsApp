import pino from 'pino';
import { config } from '../config/env.js';

function createLogger() {
  const isDev = config.nodeEnv === 'development';

  if (isDev) {
    try {
      return pino({
        level: config.logLevel,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            ignore: 'pid,hostname',
            translateTime: 'SYS:standard',
          },
        },
      });
    } catch {
      // Fallback seguro caso o pino-pretty não esteja disponível
      return pino({ level: config.logLevel });
    }
  }

  // Em produção, usa logger padrão otimizado (JSON estruturado)
  return pino({ level: config.logLevel });
}

export const logger = createLogger();
