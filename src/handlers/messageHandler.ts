import { proto, WAMessageKey } from '@whiskeysockets/baileys';
import { CommandContext, WASocket } from './types.js';
import { commands } from './commands/index.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Extrai o texto de qualquer tipo de mensagem do WhatsApp
 */
function extractMessageText(message: proto.IMessage | null | undefined): string {
  if (!message) return '';

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ''
  ).trim();
}

/**
 * Simula digitação ("digitando...") para comportamento humanizado e anti-ban
 */
async function simulateTyping(sock: WASocket, jid: string, durationMs = 1200): Promise<void> {
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    await sock.sendPresenceUpdate('paused', jid);
  } catch (err) {
    logger.debug({ err }, 'Falha ao enviar presence update');
  }
}

/**
 * Manipulador principal de mensagens recebidas
 */
export async function handleMessages(
  sock: WASocket,
  upsert: { messages: proto.IWebMessageInfo[]; type: string }
): Promise<void> {
  // Processa apenas novas mensagens recebidas
  if (upsert.type !== 'notify') return;

  for (const msg of upsert.messages) {
    try {
      const key = msg.key;
      if (!key || !key.remoteJid) continue;

      const remoteJid = key.remoteJid;

      // Ignora status broadcast
      if (remoteJid === 'status@broadcast') continue;

      const isGroup = remoteJid.endsWith('@g.us');
      if (config.ignoreGroups && isGroup) continue;

      // Ignora mensagens enviadas pelo próprio bot
      if (key.fromMe) continue;

      // Marca como lida se configurado
      if (config.autoReadMessages) {
        await sock.readMessages([key as WAMessageKey]);
      }

      const body = extractMessageText(msg.message);
      if (!body) continue;

      logger.info(
        { from: remoteJid, isGroup, text: body },
        'Nova mensagem recebida'
      );

      // Roteamento de comandos
      if (body.startsWith(config.botPrefix)) {
        const withoutPrefix = body.slice(config.botPrefix.length).trim();
        const parts = withoutPrefix.split(/\s+/);
        const commandName = parts[0]?.toLowerCase() || '';
        const args = parts.slice(1);

        const command = commands.get(commandName);

        const reply = async (text: string) => {
          await simulateTyping(sock, remoteJid);
          return await sock.sendMessage(
            remoteJid,
            { text },
            { quoted: msg as any }
          );
        };

        if (command) {
          const context: CommandContext = {
            sock,
            message: msg,
            senderJid: remoteJid,
            fromMe: key.fromMe ?? false,
            isGroup,
            args,
            command: commandName,
            body,
            reply,
          };

          logger.info({ command: commandName, from: remoteJid }, 'Executando comando');
          await command.execute(context);
        } else {
          await reply(
            `❓ Comando não reconhecido. Envie *${config.botPrefix}ajuda* para ver a lista de comandos disponíveis.`
          );
        }
      }
    } catch (error) {
      logger.error({ error, msgId: msg.key?.id }, 'Erro ao processar mensagem');
    }
  }
}
