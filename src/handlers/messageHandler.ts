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
import { isContactAuthorized, isGroupAuthorized } from '../services/whitelistService.js';
import { playboxService, PlayBoxRelatorio } from '../services/playboxService.js';
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
          updateSessionStage(senderJid, 'alugueis');
          await reply(buildAlugueisMenuText());
          continue;
        } else if (cleanBody === '3') {
          updateSessionStage(senderJid, 'estabelecimentos');
          await reply(buildEstabelecimentosMenuText());
          continue;
        } else if (cleanBody === '4') {
          updateSessionStage(senderJid, 'acoes');
          await reply(buildAcoesMenuText());
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
        } else if (cleanBody === '6') {
          try {
            const pbHealth = await playboxService.getHealth();
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
            await reply('⚠️ *WhatsApp Bot:* Online | *PlayBox Scheduler:* Não respondeu.');
          }
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

      // Submenu 1: RELATÓRIOS
      if (currentStage === 'relatorios') {
        const { formatRelatorio } = await import('./commands/playboxFormatters.js');
        if (cleanBody === '1') {
          await reply('⏳ Consultando relatório das últimas 12h...');
          try {
            const rel = await playboxService.getRelatorio12h();
            await reply(formatRelatorio(rel));
          } catch (err: any) {
            await reply(`❌ Erro ao consultar relatório 12h: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '2') {
          await reply('⏳ Consultando relatório das últimas 24h...');
          try {
            const rel = await playboxService.getRelatorio24h();
            await reply(formatRelatorio(rel));
          } catch (err: any) {
            await reply(`❌ Erro ao consultar relatório 24h: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '3') {
          await reply('⏳ Consultando acumulado do mês...');
          try {
            const rel = await playboxService.getRelatorioMes();
            await reply(formatRelatorio(rel));
          } catch (err: any) {
            await reply(`❌ Erro ao consultar relatório mensal: ${err.message}`);
          }
          continue;
        }
      }

      // Submenu 2: ALUGUÉIS & REPASSES
      if (currentStage === 'alugueis') {
        const { formatAlugueis } = await import('./commands/playboxFormatters.js');
        if (cleanBody === '1') {
          await reply('⏳ Buscando aluguéis vencendo nos próximos 7 dias...');
          try {
            const al = await playboxService.getAlugueisVencendo(7);
            await reply(formatAlugueis(al, 'Aluguéis Vencendo (Próximos 7 Dias)'));
          } catch (err: any) {
            await reply(`❌ Erro ao buscar vencimentos: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '2') {
          await reply('⏳ Buscando pagamentos pendentes...');
          try {
            const al = await playboxService.getAlugueisPendentes();
            await reply(formatAlugueis(al, 'Aluguéis com Pagamento Pendente'));
          } catch (err: any) {
            await reply(`❌ Erro ao buscar pendentes: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '3') {
          await reply('⏳ Buscando pagamentos efetuados...');
          try {
            const al = await playboxService.getAlugueisPagos();
            await reply(formatAlugueis(al, 'Aluguéis Já Pagos'));
          } catch (err: any) {
            await reply(`❌ Erro ao buscar pagos: ${err.message}`);
          }
          continue;
        }
      }

      // Submenu 3: ESTABELECIMENTOS & PIX
      if (currentStage === 'estabelecimentos') {
        const { formatEstabelecimentos } = await import('./commands/playboxFormatters.js');
        if (cleanBody === '1') {
          await reply('⏳ Carregando lista de estabelecimentos...');
          try {
            const ests = await playboxService.getEstabelecimentos();
            await reply(formatEstabelecimentos(ests));
          } catch (err: any) {
            await reply(`❌ Erro ao listar estabelecimentos: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '2') {
          await reply(
            '🔑 *Consulta de PIX:*\nDigite o ID ou parte do nome do estabelecimento (ou envie *0* para voltar).'
          );
          continue;
        }
      }

      // Submenu 4: AÇÕES & DISPAROS
      if (currentStage === 'acoes') {
        if (cleanBody === '1') {
          await reply('🚀 Disparando envio do relatório de faturamento nos grupos...');
          try {
            await playboxService.triggerReport();
            await reply('✅ Relatório enviado com sucesso!');
          } catch (err: any) {
            await reply(`❌ Erro ao disparar relatório: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '2') {
          await reply('🔍 Iniciando verificação de máquinas offline...');
          try {
            await playboxService.triggerMonitor();
            await reply('✅ Monitoramento concluído com sucesso!');
          } catch (err: any) {
            await reply(`❌ Erro no monitoramento: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '3') {
          await reply('🔄 Disparando sincronização de transações das integradoras...');
          try {
            await playboxService.triggerImportTransactions();
            await reply('✅ Sincronização de transações iniciada!');
          } catch (err: any) {
            await reply(`❌ Erro ao sincronizar transações: ${err.message}`);
          }
          continue;
        } else if (cleanBody === '4') {
          await reply('🕹️ Descobrindo novas máquinas nas integradoras...');
          try {
            await playboxService.syncMaquinas();
            await reply('✅ Sincronização de máquinas finalizada!');
          } catch (err: any) {
            await reply(`❌ Erro ao sincronizar máquinas: ${err.message}`);
          }
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
