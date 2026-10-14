import { Router, Request, Response } from 'express';
import {
  isWhatsAppReady,
  sendTextMessage,
  sendMediaMessage,
  getAllGroups,
  getGroupMetadata,
  checkNumberStatus,
  getSocket,
} from '../connection/whatsapp.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { apiKeyAuth } from './auth.js';

export const apiRouter = Router();

const startTime = Date.now();

/**
 * GET /api/status ou GET /health
 * Status de saúde e conexão do bot
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
 * POST /api/messages/send
 * Envio ativo de mensagem de texto
 */
apiRouter.post(['/messages/send', '/send-message'], apiKeyAuth, async (req: Request, res: Response) => {
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
    logger.error({ error: error.message }, 'Falha ao enviar mensagem de texto via API');
    res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao tentar enviar a mensagem via WhatsApp.',
    });
  }
});

/**
 * POST /api/messages/send-media
 * Envio de documentos, PDFs, imagens ou planilhas de relatórios
 */
apiRouter.post('/messages/send-media', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { to, mediaUrl, mediaBase64, mimetype, fileName, caption } = req.body;

    if (!to || typeof to !== 'string' || !to.trim()) {
      res.status(400).json({
        success: false,
        error: 'O campo "to" é obrigatório.',
      });
      return;
    }

    if (!mediaUrl && !mediaBase64) {
      res.status(400).json({
        success: false,
        error: 'É obrigatório informar "mediaUrl" (URL pública) ou "mediaBase64" (arquivo em base64).',
      });
      return;
    }

    if (!isWhatsAppReady()) {
      res.status(503).json({
        success: false,
        error: 'O bot ainda não está conectado ao WhatsApp.',
      });
      return;
    }

    const result = await sendMediaMessage({
      to: to.trim(),
      mediaUrl,
      mediaBase64,
      mimetype,
      fileName,
      caption,
    });

    res.status(200).json({
      success: true,
      message: 'Mídia/Documento enviado com sucesso.',
      data: result,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Falha ao enviar mídia via API');
    res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao tentar enviar mídia via WhatsApp.',
    });
  }
});

/**
 * GET /api/groups
 * Lista todos os grupos dos quais o bot participa (com nomes e IDs)
 */
apiRouter.get('/groups', apiKeyAuth, async (_req: Request, res: Response) => {
  try {
    if (!isWhatsAppReady()) {
      res.status(503).json({
        success: false,
        error: 'O bot ainda não está conectado ao WhatsApp.',
      });
      return;
    }

    const groups = await getAllGroups();

    res.status(200).json({
      success: true,
      count: groups.length,
      groups,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Falha ao listar grupos');
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao consultar grupos do WhatsApp.',
    });
  }
});

/**
 * GET /api/groups/:id
 * Consulta metadados e lista de participantes de um grupo específico
 */
apiRouter.get('/groups/:id', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    if (!isWhatsAppReady()) {
      res.status(503).json({
        success: false,
        error: 'O bot ainda não está conectado ao WhatsApp.',
      });
      return;
    }

    const rawId = req.params.id;
    const groupId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!groupId) {
      res.status(400).json({ success: false, error: 'ID do grupo inválido' });
      return;
    }
    const group = await getGroupMetadata(groupId);

    res.status(200).json({
      success: true,
      group,
    });
  } catch (error: any) {
    logger.error({ error: error.message, groupId: req.params.id }, 'Falha ao obter metadados do grupo');
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao consultar detalhes do grupo.',
    });
  }
});

/**
 * POST /api/contacts/check e GET /api/contacts/check/:phone
 * Verifica se um número de telefone está cadastrado no WhatsApp
 */
apiRouter.post('/contacts/check', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone || typeof phone !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Informe o campo "phone" (ex: 5511999998888).',
      });
      return;
    }

    if (!isWhatsAppReady()) {
      res.status(503).json({
        success: false,
        error: 'O bot ainda não está conectado ao WhatsApp.',
      });
      return;
    }

    const result = await checkNumberStatus(phone);
    res.status(200).json({ success: true, result });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Falha ao verificar contato');
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao verificar número no WhatsApp.',
    });
  }
});

apiRouter.get('/contacts/check/:phone', apiKeyAuth, async (req: Request, res: Response) => {
  try {
    if (!isWhatsAppReady()) {
      res.status(503).json({
        success: false,
        error: 'O bot ainda não está conectado ao WhatsApp.',
      });
      return;
    }

    const rawPhone = req.params.phone;
    const phone = Array.isArray(rawPhone) ? rawPhone[0] : rawPhone;
    if (!phone) {
      res.status(400).json({ success: false, error: 'Número de telefone inválido' });
      return;
    }
    const result = await checkNumberStatus(phone);
    res.status(200).json({ success: true, result });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Falha ao verificar contato via URL');
    res.status(500).json({
      success: false,
      error: error.message || 'Erro ao verificar número no WhatsApp.',
    });
  }
});
