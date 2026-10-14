import { Command } from '../types.js';
import { pingCommand } from './ping.js';
import { infoCommand } from './info.js';
import { config } from '../../config/env.js';

export const commands = new Map<string, Command>();

export const helpCommand: Command = {
  name: 'ajuda',
  description: 'Lista todos os comandos disponíveis',
  aliases: ['help', 'menu', 'comandos'],
  execute: async ({ reply }) => {
    const list: string[] = [];
    const seen = new Set<string>();

    for (const cmd of commands.values()) {
      if (seen.has(cmd.name)) continue;
      seen.add(cmd.name);

      const aliasesStr = cmd.aliases?.length
        ? ` (atalhos: ${cmd.aliases.map((a) => `\`${config.botPrefix}${a}\``).join(', ')})`
        : '';
      list.push(`• \`${config.botPrefix}${cmd.name}\`: ${cmd.description}${aliasesStr}`);
    }

    const text = [
      `🤖 *Menu de Comandos - ${config.botName}*`,
      '',
      ...list,
      '',
      `💡 _Envie uma das opções acima com o prefixo \`${config.botPrefix}\`._`,
    ].join('\n');

    await reply(text);
  },
};

// Registra todos os comandos
function register(cmd: Command) {
  commands.set(cmd.name.toLowerCase(), cmd);
  if (cmd.aliases) {
    for (const alias of cmd.aliases) {
      commands.set(alias.toLowerCase(), cmd);
    }
  }
}

register(helpCommand);
register(pingCommand);
register(infoCommand);
