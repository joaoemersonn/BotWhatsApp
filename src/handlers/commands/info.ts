import { Command } from '../types.js';
import { config } from '../../config/env.js';
import os from 'os';

export const infoCommand: Command = {
  name: 'info',
  description: 'Exibe informações técnicas do bot e do servidor',
  aliases: ['sobre', 'botinfo'],
  execute: async ({ reply }) => {
    const memoryUsage = process.memoryUsage();
    const memoryMb = (memoryUsage.rss / 1024 / 1024).toFixed(2);
    const platform = `${os.type()} ${os.release()} (${os.arch()})`;
    const nodeVersion = process.version;

    const message = [
      `🤖 *${config.botName}*`,
      '',
      `📌 *Ambiente:* ${config.nodeEnv}`,
      `⚙️ *Prefixo:* \`${config.botPrefix}\``,
      `💻 *Sistema:* ${platform}`,
      `🟢 *Node.js:* ${nodeVersion}`,
      `🧠 *Uso de RAM:* ~${memoryMb} MB`,
      `📦 *Engine:* @whiskeysockets/baileys (Multi-Device)`,
    ].join('\n');

    await reply(message);
  },
};
