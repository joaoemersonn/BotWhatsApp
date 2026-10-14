import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { connectToWhatsApp, closeWhatsAppConnection } from './connection/whatsapp.js';

async function bootstrap() {
  logger.info(
    {
      botName: config.botName,
      env: config.nodeEnv,
      prefix: config.botPrefix,
      authDir: config.authDir,
    },
    'Iniciando aplicação WhatsApp Bot...'
  );

  try {
    await connectToWhatsApp();
  } catch (error) {
    logger.fatal({ error }, 'Falha crítica ao iniciar o bot');
    process.exit(1);
  }
}

// Tratamento de encerramento gracioso (SIGINT / SIGTERM)
let isShuttingDown = false;
async function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Sinal de encerramento recebido. Desligando bot com segurança...');
  try {
    await closeWhatsAppConnection();
    logger.info('Desligamento concluído com sucesso.');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Erro durante encerramento gracioso');
    process.exit(1);
  }
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled Rejection detectada');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught Exception detectada');
  process.exit(1);
});

// Executa inicialização
bootstrap();
