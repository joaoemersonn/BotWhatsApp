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

    res.status(401).json({
      success: false,
      error: 'Não autorizado. Forneça uma API Key válida via header "x-api-key", "Authorization: Bearer <token>" ou parâmetro "?key=<token>".',
    });
    return;
  }

  next();
}
