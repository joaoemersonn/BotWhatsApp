import { proto, WAMessageKey } from '@whiskeysockets/baileys';
import { CommandContext, WASocket } from './types.js';
import { commands } from './commands/index.js';
import {
  getUserStage,
  updateSessionStage,
  buildMainMenuText,
  buildReportsMenuText,
  buildAlugueisMenuText,
  buildEstabelecimentosMenuText,
  buildAcoesMenuText,
} from './commands/menu.js';
import {
  isContactAuthorized,
  isGroupAuthorized,
  checkPhoneMatch,
  normalizePhone,
  getPhoneForLid,
} from '../services/whitelistService.js';
import { playboxService } from '../services/playboxService.js';
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
    message.documentMessage?.contextInfo?.mentionedJid ||
    []
  );
}

/**
 * Extrai as informações de contexto (mensagem citada/respondida)
 */
function extractContextInfo(message: proto.IMessage | null | undefined): proto.IContextInfo | undefined {
  if (!message) return undefined;
  return (
    message.extendedTextMessage?.contextInfo ||
    message.imageMessage?.contextInfo ||
    message.videoMessage?.contextInfo ||
    message.documentMessage?.contextInfo ||
    (message as any).buttonsResponseMessage?.contextInfo ||
    (message as any).templateButtonReplyMessage?.contextInfo ||
    undefined
  );
}

/**
 * Define uma reação com emoji em uma mensagem no WhatsApp
 */
async function setReaction(
  sock: WASocket,
  remoteJid: string,
  key: proto.IMessageKey,
  emoji: string
): Promise<void> {
  try {
    await sock.sendMessage(remoteJid, {
      react: {
        text: emoji,
        key: key as WAMessageKey,
      },
    });
  } catch (err) {
    logger.debug({ err, emoji, remoteJid }, 'Aviso: Falha ao enviar reação no WhatsApp');
  }
}

/**
 * Atualiza o indicador de presença ("digitando..." / pausa)
 */
async function setTyping(sock: WASocket, remoteJid: string, isTyping: boolean): Promise<void> {
  try {
    await sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', remoteJid);
  } catch (err) {
    logger.debug({ err, isTyping, remoteJid }, 'Aviso: Falha ao atualizar presença');
  }
}

/**
 * Verifica se um JID ou número de telefone corresponde ao bot
 */
function isBotIdentity(
  candidateJidOrPhone: string | null | undefined,
  botPn: string,
  botLid: string
): boolean {
  if (!candidateJidOrPhone) return false;

  const rawClean = (candidateJidOrPhone.split('@')[0] || '').split(':')[0];
  const clean = normalizePhone(rawClean);
  const cleanBotPn = normalizePhone(botPn);
  const cleanBotLid = normalizePhone(botLid);

  if (cleanBotPn && clean === cleanBotPn) return true;
  if (cleanBotLid && clean === cleanBotLid) return true;

  if (cleanBotPn && checkPhoneMatch(clean, cleanBotPn)) return true;

  if (candidateJidOrPhone.includes('@lid') || rawClean === botLid) {
    const mapped = getPhoneForLid(rawClean);
    if (mapped && (mapped === cleanBotPn || checkPhoneMatch(mapped, cleanBotPn))) return true;
  }

  return false;
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

  const botPn = (sock.user?.id || '').split(':')[0];
  const botLid = (sock.user?.lid || '').split(':')[0];

  for (const msg of upsert.messages) {
    try {
      const key = msg.key;
      if (!key || !key.remoteJid) continue;

      const remoteJid = key.remoteJid;

      // Ignora status broadcast
      if (remoteJid === 'status@broadcast') continue;

      // Ignora mensagens enviadas pelo próprio bot
      if (key.fromMe) continue;

      const isGroup = remoteJid.endsWith('@g.us');
      const senderJid = isGroup ? key.participant || (msg as any).participant || '' : remoteJid;

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

        // No grupo, verifica se o bot foi mencionado, citado ou se há prefixo
        const mentions = extractMentions(msg.message);
        const isMentioned = mentions.some((m) => isBotIdentity(m, botPn, botLid));

        const contextInfo = extractContextInfo(msg.message);
        const quotedParticipant = contextInfo?.participant || '';
        const isReplyingToBot = isBotIdentity(quotedParticipant, botPn, botLid);

        const startsWithBotWord = /^(bot|playbox)[\s,:]+/i.test(body);
        const hasPrefix = body.startsWith(config.botPrefix) || body.startsWith('/');

        if (!isMentioned && !isReplyingToBot && !startsWithBotWord && !hasPrefix) {
          // Mensagem normal do grupo sem menção/resposta ao bot -> SILÊNCIO TOTAL
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
      // 👥 COMPORTAMENTO EM GRUPOS: DEFAULT É A IA (COPILOTO INTELIGENTE)
      // =========================================================================
      if (isGroup) {
        // Se no grupo alguém mandar explicitamente "/menu", abre o menu
        if (cleanBody === '/menu' || cleanBody === '!menu' || cleanBody.toLowerCase() === 'menu') {
          await setReaction(sock, remoteJid, key, '📋');
          updateSessionStage(senderJid, 'menu_principal');
          await reply(buildMainMenuText());
          continue;
        }

        // Se for comando explícito com prefixo que existe na lista de comandos (ex: !ping, !info)
        const startsWithPrefix = cleanBody.startsWith(config.botPrefix) || cleanBody.startsWith('/');
        const prefixUsed = cleanBody.startsWith('/') ? '/' : config.botPrefix;
        if (startsWithPrefix) {
          const cmdName = cleanBody.slice(prefixUsed.length).trim().split(/\s+/)[0]?.toLowerCase();
          const cmd = commands.get(cmdName);
          if (cmd && cmdName !== 'ia' && cmdName !== 'ai') {
            await setReaction(sock, remoteJid, key, '⏳');
            const args = cleanBody.slice(prefixUsed.length).trim().split(/\s+/).slice(1);
            try {
              await cmd.execute({
                sock,
                message: msg,
                senderJid,
                fromMe: key.fromMe ?? false,
                isGroup: true,
                args,
                command: cmdName,
                body: cleanBody,
                reply,
              });
              await setReaction(sock, remoteJid, key, '✅');
            } catch (cmdErr: any) {
              logger.error({ err: cmdErr, cmdName }, 'Erro ao executar comando no grupo');
              await setReaction(sock, remoteJid, key, '❌');
              await reply(`❌ *Erro ao executar comando /${cmdName}:* ${cmdErr.message}`);
            }
            continue;
          }
        }

        // Em todos os outros casos no grupo (menção @bot, quote, ou pergunta direta): CHAMA A IA DIRETO
        const promptText = cleanBody
          .replace(/^(bot|playbox)[\s,:]+/i, '')
          .replace(/^\/(ia|ai)\s*/i, '')
          .replace(/^!(ia|ai)\s*/i, '')
          .trim();

        if (!promptText) {
          await setReaction(sock, remoteJid, key, '✅');
          await reply(
            'Olá! 👋 Sou o assistente inteligente da PlayBox. Como posso ajudar você hoje?\n\n' +
            '💡 _Pode me perguntar sobre relatórios, faturamento das máquinas, aluguéis a vencer ou ações operacionais._'
          );
          continue;
        }

        // Feedback imediato de "pensando": reação ⏳ e presença digitando
        await setReaction(sock, remoteJid, key, '⏳');
        await setTyping(sock, remoteJid, true);

        try {
          const { askGemini } = await import('../services/aiService.js');
          const answer = await askGemini(senderJid, promptText);

          if (answer.startsWith('❌') || answer.startsWith('⚠️')) {
            await setReaction(sock, remoteJid, key, answer.startsWith('⚠️') ? '⚠️' : '❌');
          } else {
            await setReaction(sock, remoteJid, key, '✅');
          }
          await reply(answer);
        } catch (err: any) {
          logger.error({ err, senderJid }, 'Erro ao consultar IA no grupo');
          await setReaction(sock, remoteJid, key, '❌');
          await reply(`❌ *Erro no processamento da solicitação:* ${err.message || 'Falha inesperada.'}`);
        } finally {
          await setTyping(sock, remoteJid, false);
        }
        continue;
      }

      // =========================================================================
      // 💬 COMPORTAMENTO EM CHAT PRIVADO (DM COM OPERADOR AUTORIZADO)
      // =========================================================================
      const currentStage = getUserStage(senderJid);

      // Comando de cancelamento / retorno universal ("0" ou "voltar")
      if (cleanBody === '0' || cleanBody.toLowerCase() === 'voltar') {
        updateSessionStage(senderJid, 'idle');
        await setReaction(sock, remoteJid, key, '↩️');
        await reply('↩️ Operação cancelada. Envie */menu* quando precisar navegar pelos menus ou converse diretamente comigo!');
        continue;
      }

      // Se enviou comando de menu
      if (cleanBody === '/menu' || cleanBody === '!menu' || cleanBody.toLowerCase() === 'menu') {
        updateSessionStage(senderJid, 'menu_principal');
        await setReaction(sock, remoteJid, key, '📋');
        await reply(buildMainMenuText());
        continue;
      }

      // Se o operador está navegando no menu principal
      if (currentStage === 'menu_principal') {
        if (cleanBody === '1') {
          updateSessionStage(senderJid, 'relatorios');
          await setReaction(sock, remoteJid, key, '✅');
          await reply(buildReportsMenuText());
          continue;
        } else if (cleanBody === '2') {
          updateSessionStage(senderJid, 'alugueis');
          await setReaction(sock, remoteJid, key, '✅');
          await reply(buildAlugueisMenuText());
          continue;
        } else if (cleanBody === '3') {
          updateSessionStage(senderJid, 'estabelecimentos');
          await setReaction(sock, remoteJid, key, '✅');
          await reply(buildEstabelecimentosMenuText());
          continue;
        } else if (cleanBody === '4') {
          updateSessionStage(senderJid, 'acoes');
          await setReaction(sock, remoteJid, key, '✅');
          await reply(buildAcoesMenuText());
          continue;
        } else if (cleanBody === '5') {
          updateSessionStage(senderJid, 'ai_chat');
          await setReaction(sock, remoteJid, key, '🤖');
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
        } else if (cleanBody === '6') {
          await setReaction(sock, remoteJid, key, '⏳');
          try {
            const pbHealth = await playboxService.getHealth();
            await setReaction(sock, remoteJid, key, '✅');
            await reply(
              [
                '🟢 *STATUS DOS SERVIÇOS*',
                '',
                '• 🤖 *WhatsApp Bot:* Conectado & Operacional',
                `• 🎮 *PlayBox Scheduler:* ${pbHealth.status === 'UP' ? 'Online ✅' : 'Instável ⚠️'}`,
                `• 🌐 *Porta PlayBox:* 8080`,
                `• ⏱️ *Horário Servidor:* ${new Date().toLocaleTimeString('pt-BR')}`,
                '',
                '↩️ _Digite *0* para voltar ao menu principal._',
              ].join('\n')
            );
          } catch {
            await setReaction(sock, remoteJid, key, '⚠️');
            await reply('⚠️ *WhatsApp Bot:* Online | *PlayBox Scheduler:* Não respondeu.');
          }
          continue;
        }
      }

      // Submenu 1: RELATÓRIOS
      if (currentStage === 'relatorios') {
        const { formatRelatorio } = await import('./commands/playboxFormatters.js');
        if (cleanBody === '1') {
          await setReaction(sock, remoteJid, key, '⏳');
          await reply('⏳ Consultando relatório das últimas 12h...');
          try {
            const rel = await playboxService.getRelatorio12h();
            await setReaction(sock, remoteJid, key, '✅');
            await reply(formatRelatorio(rel));
          } catch (err: any) {
            await setReaction(sock, remoteJid, key, '❌');
            await reply(`❌ Erro ao consultar relatório 12h: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '2') {
          await setReaction(sock, remoteJid, key, '⏳');
          await reply('⏳ Consultando relatório das últimas 24h...');
          try {
            const rel = await playboxService.getRelatorio24h();
            await setReaction(sock, remoteJid, key, '✅');
            await reply(formatRelatorio(rel));
          } catch (err: any) {
            await setReaction(sock, remoteJid, key, '❌');
            await reply(`❌ Erro ao consultar relatório 24h: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '3') {
          await setReaction(sock, remoteJid, key, '⏳');
          await reply('⏳ Consultando acumulado do mês...');
          try {
            const rel = await playboxService.getRelatorioMes();
            await setReaction(sock, remoteJid, key, '✅');
            await reply(formatRelatorio(rel));
          } catch (err: any) {
            await setReaction(sock, remoteJid, key, '❌');
            await reply(`❌ Erro ao consultar relatório mensal: ${err.message}`);
          }
          continue;
        }
      }

      // Submenu 2: ALUGUÉIS & REPASSES
      if (currentStage === 'alugueis') {
        const { formatAlugueis } = await import('./commands/playboxFormatters.js');
        if (cleanBody === '1') {
          await setReaction(sock, remoteJid, key, '⏳');
          await reply('⏳ Buscando aluguéis vencendo nos próximos 7 dias...');
          try {
            const al = await playboxService.getAlugueisVencendo(7);
            await setReaction(sock, remoteJid, key, '✅');
            await reply(formatAlugueis(al, 'Aluguéis Vencendo (Próximos 7 Dias)'));
          } catch (err: any) {
            await setReaction(sock, remoteJid, key, '❌');
            await reply(`❌ Erro ao buscar vencimentos: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '2') {
          await setReaction(sock, remoteJid, key, '⏳');
          await reply('⏳ Buscando pagamentos pendentes...');
          try {
            const al = await playboxService.getAlugueisPendentes();
            await setReaction(sock, remoteJid, key, '✅');
            await reply(formatAlugueis(al, 'Aluguéis com Pagamento Pendente'));
          } catch (err: any) {
            await setReaction(sock, remoteJid, key, '❌');
            await reply(`❌ Erro ao buscar pendentes: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '3') {
          await setReaction(sock, remoteJid, key, '⏳');
          await reply('⏳ Buscando pagamentos efetuados...');
          try {
            const al = await playboxService.getAlugueisPagos();
            await setReaction(sock, remoteJid, key, '✅');
            await reply(formatAlugueis(al, 'Aluguéis Já Pagos'));
          } catch (err: any) {
            await setReaction(sock, remoteJid, key, '❌');
            await reply(`❌ Erro ao buscar pagos: ${err.message}`);
          }
          continue;
        }
      }

      // Submenu 3: ESTABELECIMENTOS & PIX
      if (currentStage === 'estabelecimentos') {
        const { formatEstabelecimentos } = await import('./commands/playboxFormatters.js');
        if (cleanBody === '1') {
          await setReaction(sock, remoteJid, key, '⏳');
          await reply('⏳ Carregando lista de estabelecimentos...');
          try {
            const ests = await playboxService.getEstabelecimentos();
            await setReaction(sock, remoteJid, key, '✅');
            await reply(formatEstabelecimentos(ests));
          } catch (err: any) {
            await setReaction(sock, remoteJid, key, '❌');
            await reply(`❌ Erro ao listar estabelecimentos: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '2') {
          await setReaction(sock, remoteJid, key, '🔑');
          await reply(
            '🔑 *Consulta de PIX:*\nDigite o nome ou ID do estabelecimento que deseja consultar, ou converse diretamente com a IA!'
          );
          continue;
        }
      }

      // Submenu 4: AÇÕES OPERACIONAIS
      if (currentStage === 'acoes') {
        if (cleanBody === '1') {
          await setReaction(sock, remoteJid, key, '⏳');
          await reply('🚀 Disparando envio do relatório nos grupos configurados...');
          try {
            await playboxService.triggerReport();
            await setReaction(sock, remoteJid, key, '✅');
            await reply('✅ Relatório disparado com sucesso no PlayBox!');
          } catch (err: any) {
            await setReaction(sock, remoteJid, key, '❌');
            await reply(`❌ Erro ao disparar relatório: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '2') {
          await setReaction(sock, remoteJid, key, '⏳');
          await reply('🔍 Iniciando verificação de máquinas offline...');
          try {
            await playboxService.triggerMonitor();
            await setReaction(sock, remoteJid, key, '✅');
            await reply('✅ Monitoramento concluído com sucesso!');
          } catch (err: any) {
            await setReaction(sock, remoteJid, key, '❌');
            await reply(`❌ Erro no monitoramento: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '3') {
          await setReaction(sock, remoteJid, key, '⏳');
          await reply('🔄 Disparando sincronização de transações das integradoras...');
          try {
            await playboxService.triggerImportTransactions();
            await setReaction(sock, remoteJid, key, '✅');
            await reply('✅ Sincronização de transações iniciada!');
          } catch (err: any) {
            await setReaction(sock, remoteJid, key, '❌');
            await reply(`❌ Erro ao sincronizar transações: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '4') {
          await setReaction(sock, remoteJid, key, '⏳');
          await reply('🕹️ Descobrindo novas máquinas nas integradoras...');
          try {
            await playboxService.syncMaquinas();
            await setReaction(sock, remoteJid, key, '✅');
            await reply('✅ Sincronização de máquinas finalizada!');
          } catch (err: any) {
            await setReaction(sock, remoteJid, key, '❌');
            await reply(`❌ Erro ao sincronizar máquinas: ${err.message}`);
          }
          continue;
        }
      }

      // Se for comando explícito com prefixo (! ou /)
      const startsWithPrefix = cleanBody.startsWith(config.botPrefix) || cleanBody.startsWith('/');
      const prefixUsed = cleanBody.startsWith('/') ? '/' : config.botPrefix;

      if (startsWithPrefix) {
        const withoutPrefix = cleanBody.slice(prefixUsed.length).trim();
        const parts = withoutPrefix.split(/\s+/);
        const commandName = parts[0]?.toLowerCase() || '';
        const args = parts.slice(1);

        const command = commands.get(commandName);

        if (command && commandName !== 'ia' && commandName !== 'ai') {
          await setReaction(sock, remoteJid, key, '⏳');
          const context: CommandContext = {
            sock,
            message: msg,
            senderJid,
            fromMe: key.fromMe ?? false,
            isGroup: false,
            args,
            command: commandName,
            body: cleanBody,
            reply,
          };

          try {
            logger.info({ command: commandName, from: senderJid }, 'Executando comando de operador');
            await command.execute(context);
            await setReaction(sock, remoteJid, key, '✅');
          } catch (cmdErr: any) {
            logger.error({ err: cmdErr, command: commandName }, 'Erro ao executar comando');
            await setReaction(sock, remoteJid, key, '❌');
            await reply(`❌ *Erro ao executar comando /${commandName}:* ${cmdErr.message}`);
          }
          continue;
        }
      }

      // =========================================================================
      // 🤖 DEFAULT NO PRIVADO: CHAT DIRETO COM A IA
      // Qualquer mensagem enviada pelo operador é atendida pela IA
      // =========================================================================
      const promptText = cleanBody.replace(/^\/(ia|ai)\s*/i, '').replace(/^!(ia|ai)\s*/i, '').trim() || cleanBody;

      // Feedback imediato de "pensando": reação ⏳ e presença digitando
      await setReaction(sock, remoteJid, key, '⏳');
      await setTyping(sock, remoteJid, true);

      try {
        const { askGemini } = await import('../services/aiService.js');
        const answer = await askGemini(senderJid, promptText);

        if (answer.startsWith('❌') || answer.startsWith('⚠️')) {
          await setReaction(sock, remoteJid, key, answer.startsWith('⚠️') ? '⚠️' : '❌');
        } else {
          await setReaction(sock, remoteJid, key, '✅');
        }
        await reply(answer);
      } catch (err: any) {
        logger.error({ err, senderJid }, 'Erro ao processar mensagem privada com IA');
        await setReaction(sock, remoteJid, key, '❌');
        await reply(`❌ *Erro no processamento da IA:* ${err.message || 'Falha inesperada.'}`);
      } finally {
        await setTyping(sock, remoteJid, false);
      }
    } catch (error: any) {
      logger.error({ error, msgId: msg.key?.id }, 'Erro inesperado ao processar mensagem');
    }
  }
}
