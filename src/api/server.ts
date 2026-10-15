import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Server } from 'http';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { apiRouter } from './routes.js';
import { swaggerRouter, swaggerSpec } from './swagger.js';
import QRCode from 'qrcode';
import { getLatestQr, isWhatsAppReady } from '../connection/whatsapp.js';

let httpServer: Server | null = null;

export function createExpressApp() {
  const app = express();

  // Middlewares essenciais
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Rota visual para escanear o QR Code no navegador (sem distorções de terminal)
  app.get('/qr', async (_req: Request, res: Response) => {
    if (isWhatsAppReady()) {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>WhatsApp Conectado</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0f2f5; }
            .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
            h2 { color: #25D366; margin-top: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>✅ WhatsApp Conectado!</h2>
            <p>O bot está autenticado e operando normalmente.</p>
            <p><a href="/docs" style="color: #128C7E; text-decoration: none; font-weight: bold;">Ver Documentação da API →</a></p>
          </div>
        </body>
        </html>
      `);
      return;
    }

    const qr = getLatestQr();
    if (!qr) {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta http-equiv="refresh" content="3">
          <title>Gerando QR Code...</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0f2f5; }
            .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>⏳ Aguardando QR Code...</h2>
            <p>O socket do WhatsApp está iniciando. Esta página atualiza automaticamente.</p>
          </div>
        </body>
        </html>
      `);
      return;
    }

    try {
      const qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta http-equiv="refresh" content="15">
          <title>Conectar WhatsApp</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f0f2f5; padding: 20px; box-sizing: border-box; }
            .card { background: white; padding: 32px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; max-width: 440px; width: 100%; }
            h2 { color: #128C7E; margin-top: 0; margin-bottom: 8px; }
            .qr-img { width: 280px; height: 280px; border: 4px solid #f0f2f5; border-radius: 12px; margin: 16px auto; display: block; }
            ol { text-align: left; color: #4a4a4a; line-height: 1.6; padding-left: 20px; font-size: 14px; }
            .badge { display: inline-block; background: #e7f8ef; color: #128C7E; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-bottom: 12px; }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge">WHATSAPP WEB MULTI-DEVICE</span>
            <h2>Conecte seu WhatsApp</h2>
            <img class="qr-img" src="${qrDataUrl}" alt="QR Code WhatsApp" />
            <ol>
              <li>Abra o WhatsApp no celular</li>
              <li>Toque em <b>Aparelhos conectados</b></li>
              <li>Toque em <b>Conectar um aparelho</b></li>
              <li>Aponte a câmera para este QR Code</li>
            </ol>
            <p style="color: #888; font-size: 12px; margin-top: 16px;">O código atualiza sozinho a cada 15 segundos.</p>
          </div>
        </body>
        </html>
      `);
    } catch (err: any) {
      res.status(500).send(`Erro ao gerar imagem QR: ${err.message}`);
    }
  });

  // Redireciona a raiz para a documentação interativa
  app.get('/', (_req: Request, res: Response) => {
    res.redirect('/docs');
  });

  // Rota raiz de healthcheck (redireciona para /api/status que é protegido)
  app.get('/health', (_req: Request, res: Response) => {
    res.redirect('/api/status');
  });

  // Documentação interativa Swagger UI aberta para consulta
  app.use(['/docs', '/api-docs'], swaggerRouter);
  app.get(['/docs.json', '/api-docs.json'], (_req: Request, res: Response) => {
    res.json(swaggerSpec);
  });

  // Rotas da API (100% protegidas por apiKeyAuth)
  app.use('/api', apiRouter);

  // Tratamento de rotas não encontradas (404)
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: `Rota ${req.method} ${req.path} não encontrada. Acesse /docs para ver a documentação interativa.`,
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
        `🚀 Servidor HTTP ativo na porta ${config.apiPort}`
      );
      logger.info(`📖 Documentação Swagger UI disponível em: http://localhost:${config.apiPort}/docs`);
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
