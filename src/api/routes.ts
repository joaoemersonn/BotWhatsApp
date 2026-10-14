import { Router, Request, Response } from 'express';
import { isWhatsAppReady, sendTextMessage, getSocket } from '../connection/whatsapp.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { apiKeyAuth } from './auth.js';

export const apiRouter = Router();

const startTime = Date.now();

/**
 * Endpoint de verificação de status e saúde do serviço
 * GET /api/status ou GET /health
 */
apiRouter.get(['/status', '/health'], (_req: Request, res: Response) => {
  const ready = isWhatsAppReady();
  const sock = getSocket();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  res.status(ready ? 200 : 503).json({
    status: ready ? 'online' : 'connecting_or_offline',
    connected: ready,
    botName: config.botName,
    environment: config.nodeEnv,
    userJid: sock?.user?.id || null,
    uptimeSeconds,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Endpoint para envio ativo de mensagens para chat/número/grupo
 * POST /api/messages/send e POST /api/send-message
 */
const handleSendMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { to, message } = req.body;

    if (!to || typeof to !== 'string' || !to.trim()) {
      res.status(400).json({
        success: false,
        error: 'O campo "to" é obrigatório. Informe um número com DDI/DDD (ex: 5511999998888) ou ID de grupo.',
      });
      return;
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({
        success: false,
        error: 'O campo "message" é obrigatório e deve conter o texto a ser enviado.',
      });
      return;
    }

    if (!isWhatsAppReady()) {
      res.status(503).json({
        success: false,
        error: 'O bot ainda não está conectado ao WhatsApp. Escaneie o QR Code ou aguarde a conexão.',
      });
      return;
    }

    const result = await sendTextMessage(to.trim(), message.trim());

    res.status(200).json({
      success: true,
      message: 'Mensagem enviada com sucesso.',
      data: result,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Falha ao enviar mensagem ativa via API');
    res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao tentar enviar a mensagem via WhatsApp.',
    });
  }
};

apiRouter.post('/messages/send', apiKeyAuth, handleSendMessage);
apiRouter.post('/send-message', apiKeyAuth, handleSendMessage);
