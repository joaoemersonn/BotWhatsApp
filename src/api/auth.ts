import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Extrai o token de autenticação de múltiplos formatos (Headers, Basic Auth, Query Param)
 */
export function extractAuthToken(req: Request): string | null {
  // 1. Header x-api-key
  const apiKeyHeader = req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  // 2. Header Authorization (Bearer ou Basic)
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    if (authHeader.startsWith('Basic ')) {
      try {
        const credentials = Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf-8');
        const [user, pass] = credentials.split(':');
        // Aceita a chave se foi digitada no usuário ou na senha
        if (pass && pass.trim()) return pass.trim();
        if (user && user.trim()) return user.trim();
      } catch {
        // Ignora erro de base64 mal formatado
      }
    }
  }

  // 3. Query params (?api_key=... ou ?key=... ou ?token=...)
  const queryKey = req.query['api_key'] || req.query['key'] || req.query['token'];
  if (typeof queryKey === 'string' && queryKey.trim()) {
    return queryKey.trim();
  }

  return null;
}

/**
 * Middleware para garantir que 100% das requisições estejam autenticadas
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  // Se nenhuma chave foi configurada no .env, bloqueia por padrão para evitar brechas acidentais
  if (!config.apiKey) {
    logger.error('Tentativa de acesso, mas a variável API_KEY não está configurada no .env!');
    res.status(500).json({
      success: false,
      error: 'Configuração de segurança pendente: A variável API_KEY deve ser definida no arquivo .env.',
    });
    return;
  }

  const token = extractAuthToken(req);

  if (!token || token !== config.apiKey) {
    logger.warn(
      { ip: req.ip, method: req.method, path: req.originalUrl || req.path },
      'Acesso bloqueado: API Key inválida ou ausente'
    );

    // Se a requisição veio de um navegador esperando HTML (ex: /docs), solicita autenticação nativa do navegador
    const acceptsHtml = req.accepts('html') && !req.accepts('json');
    if (acceptsHtml || req.path.startsWith('/docs') || req.path.startsWith('/api-docs')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="WhatsApp Bot - Digite sua API_KEY"');
      res.status(401).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Acesso Restrito</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2>🔒 Acesso Restrito</h2>
          <p>Esta aplicação é protegida por chave de segurança.</p>
          <p>Informe sua <strong>API_KEY</strong> para continuar.</p>
        </body>
        </html>
      `);
      return;
    }

    res.status(401).json({
      success: false,
      error: 'Não autorizado. Forneça a API Key via header "x-api-key", "Authorization: Bearer <token>" ou Basic Auth.',
    });
    return;
  }

  next();
}
