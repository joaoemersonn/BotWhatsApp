import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Server } from 'http';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { apiRouter } from './routes.js';

let httpServer: Server | null = null;

export function createExpressApp() {
  const app = express();

  // Middlewares essenciais
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Rotas da API
  app.use('/api', apiRouter);

  // Rota raiz de healthcheck direto
  app.get('/health', (_req: Request, res: Response) => {
    res.redirect('/api/status');
  });

  // Tratamento de rotas não encontradas (404)
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: `Rota ${req.method} ${req.path} não encontrada.`,
    });
  });

  // Tratamento global de erros
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Erro não tratado no servidor HTTP');
    res.status(500).json({
      success: false,
      error: 'Erro interno no servidor HTTP.',
    });
  });

  return app;
}

/**
 * Inicializa o servidor HTTP da API
 */
export async function startApiServer(): Promise<Server> {
  const app = createExpressApp();

  return new Promise((resolve) => {
    httpServer = app.listen(config.apiPort, () => {
      logger.info(
        { port: config.apiPort, hasApiKey: Boolean(config.apiKey) },
        `🚀 Servidor HTTP da API ativo na porta ${config.apiPort}`
      );
      resolve(httpServer!);
    });
  });
}

/**
 * Encerra o servidor HTTP de forma graciosa
 */
export async function stopApiServer(): Promise<void> {
  if (httpServer) {
    logger.info('Encerrando servidor HTTP da API...');
    return new Promise((resolve) => {
      httpServer!.close(() => {
        logger.info('Servidor HTTP encerrado com sucesso.');
        httpServer = null;
        resolve();
      });
    });
  }
}
