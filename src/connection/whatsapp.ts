import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { handleMessages } from '../handlers/messageHandler.js';
import { WASocket } from '../handlers/types.js';

let currentSocket: WASocket | null = null;
let isReconnecting = false;

/**
 * Inicia ou reconecta o socket do WhatsApp via Baileys
 */
export async function connectToWhatsApp(): Promise<WASocket> {
  // Garante que o diretório de autenticação exista
  if (!fs.existsSync(config.authDir)) {
    fs.mkdirSync(config.authDir, { recursive: true });
  }

  // Carrega ou inicializa o estado de autenticação multi-device
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);

  // Busca a versão mais recente suportada do WhatsApp Web
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info({ version, isLatest }, 'Versão do WhatsApp Web obtida');

  // Cria a conexão de socket do Baileys
  const sock = makeWASocket({
    version,
    auth: state,
    logger: logger.child({ module: 'baileys' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    defaultQueryTimeoutMs: 60000,
    generateHighQualityLinkPreview: true,
  });

  currentSocket = sock;

  // Se houver número configurado e ainda não autenticado, solicita Pairing Code
  if (config.pairingNumber && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const cleanNumber = config.pairingNumber!.replace(/\D/g, '');
        const code = await sock.requestPairingCode(cleanNumber);
        console.log('\n======================================================');
        console.log(`🔑 CÓDIGO DE PAREAMENTO: ${code}`);
        console.log('1. Abra o WhatsApp no seu celular');
        console.log('2. Vá em Aparelhos Conectados > Conectar um aparelho');
        console.log('3. Escolha "Conectar com número de telefone" e digite o código acima');
        console.log('======================================================\n');
      } catch (err) {
        logger.error({ err }, 'Erro ao solicitar código de pareamento');
      }
    }, 4000);
  }

  // Monitora mudanças no estado da conexão
  sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    // Exibe o QR Code no terminal caso não esteja usando Pairing Code
    if (qr && !config.pairingNumber) {
      console.log('\n======================================================');
      console.log('📲 Escaneie o QR Code abaixo com o WhatsApp do seu celular:');
      qrcode.generate(qr, { small: true });
      console.log('1. Abra o WhatsApp no seu celular');
      console.log('2. Vá em Configurações / Ajustes > Aparelhos Conectados');
      console.log('3. Toque em "Conectar um aparelho" e aponte a câmera para a tela.');
      console.log('======================================================\n');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn(
        { statusCode, shouldReconnect, err: lastDisconnect?.error },
        'Conexão com o WhatsApp encerrada'
      );

      if (shouldReconnect) {
        if (!isReconnecting) {
          isReconnecting = true;
          logger.info('Tentando restabelecer conexão em 5 segundos...');
          setTimeout(() => {
            isReconnecting = false;
            connectToWhatsApp();
          }, 5000);
        }
      } else {
        logger.error(
          '❌ Sessão desconectada (logout realizado pelo usuário ou credenciais revogadas).'
        );
        logger.error(
          `Para gerar um novo QR Code, apague os arquivos em "${config.authDir}" e reinicie.`
        );
      }
    } else if (connection === 'open') {
      isReconnecting = false;
      const userJid = sock.user?.id || 'Desconhecido';
      const userName = sock.user?.name || config.botName;
      logger.info(
        { userJid, userName },
        '🎉 WhatsApp conectado com sucesso! O bot está ativo e escutando mensagens.'
      );
    }
  });

  // Salva automaticamente as credenciais atualizadas
  sock.ev.on('creds.update', saveCreds);

  // Escuta novas mensagens
  sock.ev.on('messages.upsert', async (upsert) => {
    await handleMessages(sock, upsert);
  });

  return sock;
}

/**
 * Retorna a instância atual ativa do socket
 */
export function getSocket(): WASocket | null {
  return currentSocket;
}

/**
 * Encerra a conexão do socket de forma graciosa
 */
export async function closeWhatsAppConnection(): Promise<void> {
  if (currentSocket) {
    logger.info('Fechando conexão com o WhatsApp...');
    try {
      currentSocket.end(undefined);
    } catch (err) {
      logger.error({ err }, 'Erro ao fechar socket');
    } finally {
      currentSocket = null;
    }
  }
}
