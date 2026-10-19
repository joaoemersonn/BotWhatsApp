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
import {
  getWhitelist,
  addAuthorizedContact,
  removeAuthorizedContact,
  addAuthorizedGroup,
  removeAuthorizedGroup,
} from '../services/whitelistService.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { apiKeyAuth } from './auth.js';

export const apiRouter = Router();

// Aplica autenticação por API_KEY em 100% das rotas da API
apiRouter.use(apiKeyAuth);

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
apiRouter.post(['/messages/send', '/send-message'], async (req: Request, res: Response) => {
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
apiRouter.post('/messages/send-media', async (req: Request, res: Response) => {
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
apiRouter.get('/groups', async (_req: Request, res: Response) => {
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
apiRouter.get('/groups/:id', async (req: Request, res: Response) => {
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
apiRouter.post('/contacts/check', async (req: Request, res: Response) => {
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

apiRouter.get('/contacts/check/:phone', async (req: Request, res: Response) => {
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

// =========================================================================
// 🔒 ENDPOINTS DE WHITELIST (GERENCIAMENTO DA OPERAÇÃO)
// =========================================================================

/**
 * GET /api/whitelist
 * Retorna todos os contatos e grupos autorizados
 */
apiRouter.get('/whitelist', (_req: Request, res: Response) => {
  const data = getWhitelist();
  res.status(200).json({
    success: true,
    data,
  });
});

/**
 * POST /api/whitelist/contacts
 * Cadastra um contato/operador autorizado
 */
apiRouter.post('/whitelist/contacts', (req: Request, res: Response) => {
  try {
    const { phone, name } = req.body;
    if (!phone || typeof phone !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Informe o campo "phone" com DDI e DDD (ex: 5511999998888).',
      });
      return;
    }

    const contact = addAuthorizedContact(phone, name);
    res.status(200).json({
      success: true,
      message: 'Contato adicionado à whitelist com sucesso.',
      contact,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/whitelist/contacts/:phone
 * Remove um contato da whitelist
 */
apiRouter.delete('/whitelist/contacts/:phone', (req: Request, res: Response) => {
  const rawPhone = req.params.phone;
  const phone = Array.isArray(rawPhone) ? rawPhone[0] : rawPhone;
  if (!phone) {
    res.status(400).json({ success: false, error: 'Telefone inválido' });
    return;
  }

  const removed = removeAuthorizedContact(phone);
  if (removed) {
    res.status(200).json({ success: true, message: 'Contato removido da whitelist.' });
  } else {
    res.status(404).json({ success: false, error: 'Contato não encontrado na whitelist.' });
  }
});

/**
 * POST /api/whitelist/groups
 * Cadastra um grupo autorizado da operação
 */
apiRouter.post('/whitelist/groups', (req: Request, res: Response) => {
  try {
    const { groupId, name } = req.body;
    if (!groupId || typeof groupId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Informe o campo "groupId" (ex: 120363028392819283@g.us).',
      });
      return;
    }

    const group = addAuthorizedGroup(groupId, name);
    res.status(200).json({
      success: true,
      message: 'Grupo adicionado à whitelist com sucesso.',
      group,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/whitelist/groups/:groupId
 * Remove um grupo da whitelist
 */
apiRouter.delete('/whitelist/groups/:groupId', (req: Request, res: Response) => {
  const rawGroupId = req.params.groupId;
  const groupId = Array.isArray(rawGroupId) ? rawGroupId[0] : rawGroupId;
  if (!groupId) {
    res.status(400).json({ success: false, error: 'ID do grupo inválido' });
    return;
  }

  const removed = removeAuthorizedGroup(groupId);
  if (removed) {
    res.status(200).json({ success: true, message: 'Grupo removido da whitelist.' });
  } else {
    res.status(404).json({ success: false, error: 'Grupo não encontrado na whitelist.' });
  }
});
