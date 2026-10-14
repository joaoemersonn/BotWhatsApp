import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware para validar a API Key das requisições
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  // Se nenhuma chave foi configurada no .env, permite a requisição
  if (!config.apiKey) {
    return next();
  }

  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  const authHeader = req.headers['authorization'];

  let token = apiKeyHeader;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  if (!token || token !== config.apiKey) {
    logger.warn(
      { ip: req.ip, path: req.path },
      'Tentativa de acesso à API com chave de autenticação inválida ou ausente'
    );
    res.status(401).json({
      success: false,
      error: 'Não autorizado. Forneça uma API Key válida no header "x-api-key" ou "Authorization: Bearer <token>".',
    });
    return;
  }

  next();
}
