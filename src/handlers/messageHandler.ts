import { proto, WAMessageKey } from '@whiskeysockets/baileys';
import { CommandContext, WASocket } from './types.js';
import { commands } from './commands/index.js';
import {
  getUserStage,
  updateSessionStage,
  buildMainMenuText,
  buildReportsMenuText,
  buildServicesMenuText,
} from './commands/menu.js';
import { isContactAuthorized, isGroupAuthorized } from '../services/whitelistService.js';
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
 * Extrai menções da mensagem (JIDs mencionados)
 */
function extractMentions(message: proto.IMessage | null | undefined): string[] {
  if (!message) return [];
  return (
    message.extendedTextMessage?.contextInfo?.mentionedJid ||
    message.imageMessage?.contextInfo?.mentionedJid ||
    message.videoMessage?.contextInfo?.mentionedJid ||
    []
  );
}

/**
 * Simula digitação ("digitando...") para comportamento humanizado e anti-ban
 */
async function simulateTyping(sock: WASocket, jid: string, durationMs = 1000): Promise<void> {
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
  logger.info({ type: upsert.type, count: upsert.messages.length }, 'Evento messages.upsert recebido');

  if (upsert.type !== 'notify') return;

  const botJid = sock.user?.id?.split(':')[0] || '';

  for (const msg of upsert.messages) {
    try {
      const key = msg.key;
      if (!key || !key.remoteJid) continue;

      const remoteJid = key.remoteJid;
      logger.info(
        { remoteJid, fromMe: key.fromMe, participant: key.participant },
        'Nova mensagem interceptada'
      );

      // Ignora status broadcast
      if (remoteJid === 'status@broadcast') continue;

      // Ignora mensagens enviadas pelo próprio bot
      if (key.fromMe) continue;

      const isGroup = remoteJid.endsWith('@g.us');
      const senderJid = isGroup ? key.participant || '' : remoteJid;

      const body = extractMessageText(msg.message);
      if (!body) continue;

      // =========================================================================
      // 🔒 CONTROLE DE ACESSO E WHITELIST SILENCIOSA
      // =========================================================================

      if (isGroup) {
        // Se for grupo, verifica se o grupo está autorizado na whitelist
        if (!isGroupAuthorized(remoteJid)) {
          // Grupo não autorizado -> SILÊNCIO TOTAL
          continue;
        }

        // Verifica se o remetente da mensagem no grupo é um operador autorizado
        if (!isContactAuthorized(senderJid)) {
          // Remetente não é operador -> SILÊNCIO TOTAL
          continue;
        }

        // No grupo, só responde se o bot for explicitamente mencionado (@bot) ou usar prefixo
        const mentions = extractMentions(msg.message);
        const isMentioned = mentions.some((m) => m.startsWith(botJid));
        const hasPrefix = body.startsWith(config.botPrefix) || body.startsWith('/');

        if (!isMentioned && !hasPrefix) {
          // Mensagem normal do grupo sem menção ao bot -> SILÊNCIO TOTAL
          continue;
        }
      } else {
        // Conversa privada (Direct Message)
        // Se o contato NÃO estiver na lista de operadores autorizados -> SILÊNCIO TOTAL
        // (Isso protege o número de suporte que é 100% manual)
        if (!isContactAuthorized(remoteJid)) {
          logger.info({ remoteJid, body }, 'Mensagem privada de número NÃO autorizado recebida (ignorada)');
          continue;
        }
      }

      // Marca como lida apenas para operadores autorizados
      if (config.autoReadMessages) {
        await sock.readMessages([key as WAMessageKey]);
      }

      logger.info(
        { from: remoteJid, sender: senderJid, isGroup, text: body },
        'Mensagem autorizada de operador recebida'
      );

      const reply = async (text: string, quoted: boolean = true) => {
        try {
          await simulateTyping(sock, remoteJid);
          const sent = await sock.sendMessage(
            remoteJid,
            { text },
            quoted ? { quoted: msg as any } : undefined
          );
          logger.info({ remoteJid, messageId: sent?.key?.id }, 'Resposta enviada com sucesso');
          return sent;
        } catch (sendErr) {
          logger.error({ err: sendErr, remoteJid }, 'Erro ao disparar resposta no WhatsApp');
        }
      };

      // Limpa possíveis menções (@5511...) do corpo do texto
      let cleanBody = body.replace(/@\d+/g, '').trim();

      // =========================================================================
      // 🧭 MÁQUINA DE ESTADOS / NAVEGAÇÃO DE SUBMENUS
      // =========================================================================
      const currentStage = getUserStage(senderJid);

      // Comando de cancelamento / retorno universal ("0" ou "voltar")
      if (cleanBody === '0' || cleanBody.toLowerCase() === 'voltar') {
        updateSessionStage(senderJid, 'idle');
        await reply('↩️ Operação cancelada. Envie */menu* quando precisar novamente.');
        continue;
      }

      // Se o usuário está navegando no menu principal
      if (currentStage === 'menu_principal') {
        if (cleanBody === '1') {
          updateSessionStage(senderJid, 'relatorios');
          await reply(buildReportsMenuText());
          continue;
        } else if (cleanBody === '2') {
          await reply(buildServicesMenuText());
          continue;
        } else if (cleanBody === '3') {
          await reply(
            '👥 *Operadores e Grupos Autorizados:*\nConsulte ou gerencie a lista através do painel Swagger em */docs*.'
          );
          continue;
        } else if (cleanBody === '4') {
          const cmd = commands.get('info');
          if (cmd) {
            await cmd.execute({
              sock,
              message: msg,
              senderJid,
              fromMe: false,
              isGroup,
              args: [],
              command: 'info',
              body: cleanBody,
              reply,
            });
          }
          continue;
        } else if (cleanBody === '5') {
          updateSessionStage(senderJid, 'ai_chat');
          await reply(
            [
              '🤖 *MODO ASSISTENTE IA ATIVADO*',
              '',
              'Você entrou no chat com a inteligência artificial da operação!',
              'Pode enviar qualquer pergunta ou mensagem a partir de agora.',
              '',
              '💡 _Digite *0* ou *voltar* para sair do modo IA e retornar ao menu principal._',
            ].join('\n')
          );
          continue;
        }
      }

      // Se o usuário está em conversação direta com a IA
      if (currentStage === 'ai_chat') {
        const { askGemini } = await import('../services/aiService.js');
        const answer = await askGemini(senderJid, cleanBody);
        await reply(answer);
        continue;
      }

      // Se o usuário está no submenu de relatórios
      if (currentStage === 'relatorios') {
        if (cleanBody === '1.1' || cleanBody === '1') {
          await reply('📈 *Relatório do Dia:* Sistema em normalidade. Nenhuma pendência crítica.');
          continue;
        } else if (cleanBody === '1.2' || cleanBody === '2') {
          await reply('📅 *Fechamento Semanal:* Todos os relatórios foram consolidados.');
          continue;
        } else if (cleanBody === '1.3' || cleanBody === '3') {
          await reply('📉 *Alertas:* 0 incidentes abertos nas últimas 24 horas.');
          continue;
        }
      }

      // =========================================================================
      // ⚡ ROTEAMENTO DE COMANDOS COM PREFIXO (! ou /)
      // =========================================================================
      const startsWithPrefix = cleanBody.startsWith(config.botPrefix) || cleanBody.startsWith('/');
      const prefixUsed = cleanBody.startsWith('/') ? '/' : config.botPrefix;

      if (startsWithPrefix || cleanBody.toLowerCase() === 'menu') {
        const withoutPrefix = startsWithPrefix
          ? cleanBody.slice(prefixUsed.length).trim()
          : cleanBody.trim();

        const parts = withoutPrefix.split(/\s+/);
        const commandName = parts[0]?.toLowerCase() || '';
        const args = parts.slice(1);

        const command = commands.get(commandName);

        if (command) {
          const context: CommandContext = {
            sock,
            message: msg,
            senderJid,
            fromMe: key.fromMe ?? false,
            isGroup,
            args,
            command: commandName,
            body: cleanBody,
            reply,
          };

          logger.info({ command: commandName, from: senderJid }, 'Executando comando de operador');
          await command.execute(context);
        } else {
          // Se não encontrou o comando, exibe o menu principal para o operador
          updateSessionStage(senderJid, 'menu_principal');
          await reply(buildMainMenuText());
        }
      }
    } catch (error) {
      logger.error({ error, msgId: msg.key?.id }, 'Erro ao processar mensagem');
    }
  }
}
