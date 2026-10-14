import { Command } from '../types.js';

const startTime = Date.now();

export const pingCommand: Command = {
  name: 'ping',
  description: 'Verifica se o bot está online e retorna o tempo de atividade',
  aliases: ['p', 'status'],
  execute: async ({ reply }) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;
    await reply(`🏓 *Pong!*\n\n⏱️ *Tempo online:* ${uptimeStr}\n🟢 *Status:* Ativo e operacional`);
  },
};
