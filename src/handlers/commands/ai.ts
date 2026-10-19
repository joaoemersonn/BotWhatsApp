import { Command } from '../types.js';
import { askGemini, clearUserHistory } from '../../services/aiService.js';
import { updateSessionStage } from './menu.js';

export const aiCommand: Command = {
  name: 'ia',
  description: 'Converse com o assistente inteligente da operação',
  aliases: ['ai', 'gpt', 'gemini'],
  execute: async ({ reply, args, senderJid, body }) => {
    const prompt = args.join(' ').trim();

    if (!prompt) {
      updateSessionStage(senderJid, 'ai_chat');
      await reply(
        [
          '🤖 *MODO ASSISTENTE IA ATIVADO*',
          '',
          'Você entrou no chat com a inteligência artificial da operação!',
          'Pode enviar qualquer pergunta ou mensagem a partir de agora.',
          '',
          '💡 _Digite *0* ou *voltar* para sair do modo IA e retornar ao menu principal._',
          '🧹 _Digite */ia reset* para limpar o histórico da conversa recente._',
        ].join('\n')
      );
      return;
    }

    if (prompt.toLowerCase() === 'reset' || prompt.toLowerCase() === 'limpar') {
      clearUserHistory(senderJid);
      await reply('🧹 *Histórico de conversa com a IA reiniciado com sucesso!*');
      return;
    }

    // Faz a consulta ao Gemini
    const answer = await askGemini(senderJid, prompt);
    await reply(answer);
  },
};
