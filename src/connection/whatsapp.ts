import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  ConnectionState,
  AnyMessageContent,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { handleMessages } from '../handlers/messageHandler.js';
import { WASocket } from '../handlers/types.js';
import { formatToWhatsApp } from '../utils/textFormatter.js';

let currentSocket: WASocket | null = null;
let isReconnecting = false;
let isConnected = false;
let latestQr: string | null = null;

export function getLatestQr(): string | null {
  return latestQr;
}

export interface SendMediaOptions {
  to: string;
  mediaUrl?: string;
  mediaBase64?: string;
  mimetype?: string;
  fileName?: string;
  caption?: string;
}

/**
 * Inicia ou reconecta o socket do WhatsApp via Baileys
 */
export async function connectToWhatsApp(): Promise<WASocket> {
  // Limpa socket anterior e seus ouvintes para evitar conflitos de conexão simultânea
  if (currentSocket) {
    try {
      currentSocket.ev.removeAllListeners('connection.update');
      currentSocket.ev.removeAllListeners('creds.update');
      currentSocket.ev.removeAllListeners('messages.upsert');
      currentSocket.end(undefined);
    } catch {
      // ignora
    }
    currentSocket = null;
  }

  // Garante que o diretório de autenticação exista com permissão
  if (!fs.existsSync(config.authDir)) {
    fs.mkdirSync(config.authDir, { recursive: true });
  }

  // Carrega ou inicializa o estado de autenticação multi-device
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);

  // Busca a versão mais recente com fallback seguro
  let version = [2, 3000, 1015901307] as [number, number, number];
  try {
    const v = await fetchLatestBaileysVersion();
    version = v.version;
    logger.info({ version, isLatest: v.isLatest }, 'Versão do WhatsApp Web obtida');
  } catch (err) {
    logger.warn({ err }, 'Aviso: Falha ao consultar versão mais recente, usando fallback');
  }

  // Cria a conexão de socket do Baileys com opções otimizadas para Docker
  const sock = makeWASocket({
    version,
    auth: state,
    logger: logger.child({ module: 'baileys' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    syncFullHistory: false, // CRÍTICO: evita timeout ao carregar histórico antigo
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

    // Atualiza o QR Code atual em memória para a rota web /qr
    if (qr) {
      latestQr = qr;

      if (!config.pairingNumber) {
        console.log('\n======================================================');
        console.log('📲 Escaneie o QR Code abaixo OU abra no seu navegador:');
        console.log(`👉 http://IP_DO_SERVIDOR:${config.apiPort}/qr`);
        qrcode.generate(qr, { small: true });
        console.log('1. Abra o WhatsApp no seu celular');
        console.log('2. Vá em Configurações / Ajustes > Aparelhos Conectados');
        console.log('3. Toque em "Conectar um aparelho" e aponte a câmera.');
        console.log('======================================================\n');
      }
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
          // Se for 515 (restartRequired), reconecta rápido (1s) para concluir pareamento
          const delay = statusCode === DisconnectReason.restartRequired ? 1000 : 5000;
          logger.info(`Tentando restabelecer conexão em ${delay}ms...`);
          setTimeout(() => {
            isReconnecting = false;
            connectToWhatsApp();
          }, delay);
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
      latestQr = null; // Limpa o QR Code após conectar
      const userJid = sock.user?.id || 'Desconhecido';
      const userName = sock.user?.name || config.botName;
      logger.info(
        { userJid, userName },
        '🎉 WhatsApp conectado com sucesso! O bot está ativo e escutando mensagens.'
      );
    }
  });

  // Salva automaticamente as credenciais com tratamento de erro
  sock.ev.on('creds.update', async () => {
    try {
      await saveCreds();
    } catch (err) {
      logger.error({ err }, '❌ Erro ao gravar credenciais de sessão no disco. Verifique as permissões da pasta!');
    }
  });

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
 * Trata grupos (@g.us), números internacionais e números brasileiros com/sem nono dígito.
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

  logger.info({ jid, length: message.length }, 'Enviando mensagem de texto ativa via API');
  const formattedMessage = formatToWhatsApp(message);
  const response = await currentSocket.sendMessage(jid, { text: formattedMessage });

  return {
    success: true,
    messageId: response?.key?.id,
    to: jid,
    timestamp: response?.messageTimestamp,
  };
}

/**
 * Envia arquivo de mídia ou documento (PDF, Imagem, Planilha de relatório)
 */
export async function sendMediaMessage(options: SendMediaOptions) {
  if (!isWhatsAppReady() || !currentSocket) {
    throw new Error('WhatsApp não está conectado no momento. Aguarde a sincronização.');
  }

  const jid = await resolveJid(options.to);
  const mimetype = options.mimetype || 'application/octet-stream';

  let mediaBufferOrUrl: { url: string } | Buffer;
  if (options.mediaUrl) {
    mediaBufferOrUrl = { url: options.mediaUrl };
  } else if (options.mediaBase64) {
    // Remove cabeçalhos data URL se existirem (ex: "data:image/png;base64,...")
    const cleanBase64 = options.mediaBase64.replace(/^data:.*?;base64,/, '');
    mediaBufferOrUrl = Buffer.from(cleanBase64, 'base64');
  } else {
    throw new Error('É obrigatório informar "mediaUrl" ou "mediaBase64".');
  }

  let messagePayload: AnyMessageContent;

  if (mimetype.startsWith('image/')) {
    messagePayload = {
      image: mediaBufferOrUrl,
      caption: options.caption,
    };
  } else if (mimetype.startsWith('video/')) {
    messagePayload = {
      video: mediaBufferOrUrl,
      caption: options.caption,
    };
  } else if (mimetype.startsWith('audio/')) {
    messagePayload = {
      audio: mediaBufferOrUrl,
      mimetype,
    };
  } else {
    // Qualquer documento (PDF, Excel, CSV, etc.)
    messagePayload = {
      document: mediaBufferOrUrl,
      mimetype,
      fileName: options.fileName || 'relatorio.pdf',
      caption: options.caption,
    };
  }

  logger.info({ jid, mimetype, fileName: options.fileName }, 'Enviando mídia ativa via API');
  const response = await currentSocket.sendMessage(jid, messagePayload);

  return {
    success: true,
    messageId: response?.key?.id,
    to: jid,
    fileName: options.fileName,
    timestamp: response?.messageTimestamp,
  };
}

/**
 * Lista todos os grupos dos quais o bot participa
 */
export async function getAllGroups() {
  if (!isWhatsAppReady() || !currentSocket) {
    throw new Error('WhatsApp não está conectado no momento. Aguarde a sincronização.');
  }

  logger.info('Consultando grupos participantes no WhatsApp...');
  const groupsMap = await currentSocket.groupFetchAllParticipating();

  return Object.values(groupsMap).map((g) => ({
    id: g.id,
    subject: g.subject,
    owner: g.owner || g.subjectOwner || null,
    creation: g.creation ? new Date(g.creation * 1000).toISOString() : null,
    description: g.desc?.toString() || '',
    participantsCount: g.participants?.length || 0,
    announceOnly: g.announce || false,
    restrictSettings: g.restrict || false,
  }));
}

/**
 * Obtém detalhes completos de um grupo específico, incluindo participantes
 */
export async function getGroupMetadata(groupId: string) {
  if (!isWhatsAppReady() || !currentSocket) {
    throw new Error('WhatsApp não está conectado no momento. Aguarde a sincronização.');
  }

  const jid = groupId.includes('@g.us') ? groupId.trim() : `${groupId.trim()}@g.us`;
  const metadata = await currentSocket.groupMetadata(jid);

  return {
    id: metadata.id,
    subject: metadata.subject,
    owner: metadata.owner || metadata.subjectOwner || null,
    creation: metadata.creation ? new Date(metadata.creation * 1000).toISOString() : null,
    description: metadata.desc?.toString() || '',
    participantsCount: metadata.participants?.length || 0,
    announceOnly: metadata.announce || false,
    restrictSettings: metadata.restrict || false,
    participants: metadata.participants.map((p) => ({
      id: p.id,
      admin: p.admin || null,
    })),
  };
}

/**
 * Verifica se um número de telefone está cadastrado no WhatsApp e retorna seu JID canônico
 */
export async function checkNumberStatus(phoneNumber: string) {
  if (!isWhatsAppReady() || !currentSocket) {
    throw new Error('WhatsApp não está conectado no momento. Aguarde a sincronização.');
  }

  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (!cleanNumber || cleanNumber.length < 8) {
    throw new Error(`Número inválido: "${phoneNumber}"`);
  }

  const results = await currentSocket.onWhatsApp(cleanNumber);
  const match = results?.find((r) => r.exists);

  return {
    phone: phoneNumber,
    cleanNumber,
    exists: Boolean(match?.exists),
    jid: match?.jid || null,
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
