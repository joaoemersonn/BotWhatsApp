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
let isConnected = false;

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
      isConnected = false;
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
      isConnected = true;
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
 * Retorna se o WhatsApp está atualmente conectado e pronto para enviar mensagens
 */
export function isWhatsAppReady(): boolean {
  return isConnected && currentSocket !== null;
}

/**
 * Retorna a instância atual ativa do socket
 */
export function getSocket(): WASocket | null {
  return currentSocket;
}

/**
 * Resolve o identificador (JID) canônico para envio de mensagens.
 * Trata grupos, números com/sem DDI, e valida existência no WhatsApp.
 */
export async function resolveJid(target: string): Promise<string> {
  const sock = currentSocket;
  if (!sock) {
    throw new Error('Socket do WhatsApp não inicializado');
  }

  const trimmed = target.trim();

  // Se já for JID de grupo (@g.us) ou usuário direto (@s.whatsapp.net)
  if (trimmed.endsWith('@g.us') || trimmed.endsWith('@s.whatsapp.net')) {
    return trimmed;
  }

  // Remove caracteres não numéricos
  const cleanNumber = trimmed.replace(/\D/g, '');
  if (!cleanNumber || cleanNumber.length < 8) {
    throw new Error(`Número de telefone inválido: "${target}"`);
  }

  try {
    // Consulta o WhatsApp para descobrir o JID oficial registrado
    const results = await sock.onWhatsApp(cleanNumber);
    const match = results?.find((r) => r.exists);
    if (match && match.jid) {
      return match.jid;
    }
  } catch (err) {
    logger.warn({ err, cleanNumber }, 'Aviso: Falha ao consultar onWhatsApp, usando formato padrão');
  }

  // Formato fallback padrão
  return `${cleanNumber}@s.whatsapp.net`;
}

/**
 * Envia ativamente uma mensagem de texto para um chat específico (número ou grupo)
 */
export async function sendTextMessage(to: string, message: string) {
  if (!isWhatsAppReady() || !currentSocket) {
    throw new Error('WhatsApp não está conectado no momento. Aguarde a sincronização.');
  }

  const jid = await resolveJid(to);

  logger.info({ jid, length: message.length }, 'Enviando mensagem ativa via API');
  const response = await currentSocket.sendMessage(jid, { text: message });

  return {
    success: true,
    messageId: response?.key?.id,
    to: jid,
    timestamp: response?.messageTimestamp,
  };
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
      isConnected = false;
    }
  }
}
