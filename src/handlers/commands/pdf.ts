import { Command } from '../types.js';
import { playboxService } from '../../services/playboxService.js';
import { logger } from '../../utils/logger.js';

export const pdfCommand: Command = {
  name: 'pdf',
  description: 'Gera e envia o Relatório Mensal/Operacional em formato PDF',
  aliases: ['relatoriopdf', 'gerarpdf', 'pdfrelatorio'],
  execute: async ({ reply, args, sock, remoteJid, message }) => {
    let periodo = 'mes';
    let estabelecimentoId: number | undefined = undefined;

    if (args.length > 0) {
      const first = args[0].toLowerCase();
      if (!isNaN(Number(first))) {
        estabelecimentoId = Number(first);
      } else if (first === '24h' || first === 'ontem' || first === 'dia') {
        periodo = '24h-anterior';
      } else if (first === '12h') {
        periodo = '12h-atual';
      } else if (first === 'hoje') {
        periodo = 'hoje';
      } else if (first === 'mes' || first === 'mes-atual') {
        periodo = 'mes';
      }
    }

    if (args.length > 1 && !isNaN(Number(args[1]))) {
      estabelecimentoId = Number(args[1]);
    }

    await reply('📄 *Gerando Relatório de Operações em PDF...* Por favor, aguarde alguns instantes.');

    try {
      const pdfBuffer = await playboxService.getRelatorioPdf({
        periodo,
        estabelecimentoId,
        incluirHistorico: true,
      });

      const safePeriodo = periodo.toLowerCase();
      const filename = `relatorio-operacoes${estabelecimentoId ? `-estab-${estabelecimentoId}` : ''}-${safePeriodo}.pdf`;
      const caption = `📄 *Relatório de Operações PlayBox*\n🗓️ Período: *${safePeriodo.toUpperCase()}*${estabelecimentoId ? `\n📍 Estabelecimento ID: *${estabelecimentoId}*` : ''}`;

      await sock.sendMessage(
        remoteJid,
        {
          document: pdfBuffer,
          mimetype: 'application/pdf',
          fileName: filename,
          caption,
        },
        { quoted: message as any }
      );
      logger.info({ remoteJid, filename, size: pdfBuffer.length }, 'PDF enviado via comando /pdf');
    } catch (err: any) {
      logger.error({ err, remoteJid }, 'Erro ao gerar e enviar PDF via comando /pdf');
      await reply(`❌ *Erro ao gerar o relatório em PDF:* ${err.message || 'Falha na comunicação com o servidor de relatórios.'}`);
    }
  },
};
