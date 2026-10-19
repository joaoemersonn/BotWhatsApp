import { playboxService } from './playboxService.js';
import { logger } from '../utils/logger.js';

/**
 * Declaração formal das ferramentas (Tools) do PlayBox para o Gemini
 */
export const playboxToolsDeclaration = [
  {
    function_declarations: [
      {
        name: 'consultarRelatorioFaturamento',
        description: 'Consulta o relatório consolidado de faturamento, vendas, estornos e prêmios do PlayBox por período ou datas.',
        parameters: {
          type: 'OBJECT',
          properties: {
            periodo: {
              type: 'STRING',
              description: "Período predefinido: '12h-atual', '24h-anterior', 'mes' ou 'hoje'.",
            },
            dataInicio: {
              type: 'STRING',
              description: 'Data de início no formato YYYY-MM-DD (ex: 2026-10-01).',
            },
            dataFim: {
              type: 'STRING',
              description: 'Data de término no formato YYYY-MM-DD (ex: 2026-10-19).',
            },
            cidade: {
              type: 'STRING',
              description: 'Filtrar por cidade (ex: Custódia, Sertânia, Monteiro, Sumé).',
            },
            estabelecimentoId: {
              type: 'NUMBER',
              description: 'Filtrar pelo ID numérico de um estabelecimento específico.',
            },
            maquinaId: {
              type: 'NUMBER',
              description: 'Filtrar pelo ID numérico de uma máquina.',
            },
          },
        },
      },
      {
        name: 'consultarAlugueisERepasses',
        description: 'Consulta a lista de aluguéis e repasses das máquinas aos estabelecimentos.',
        parameters: {
          type: 'OBJECT',
          properties: {
            tipo: {
              type: 'STRING',
              description: "Tipo de consulta: 'vencendo' (a vencer em breve), 'pendentes' (atrasados/não pagos) ou 'pagos' (já quitados).",
            },
            dias: {
              type: 'NUMBER',
              description: 'Quantidade de dias à frente para filtrar vencimentos (padrão: 7).',
            },
          },
          required: ['tipo'],
        },
      },
      {
        name: 'consultarEstabelecimentos',
        description: 'Lista todos os estabelecimentos comerciais onde as máquinas PlayBox estão instaladas, com telefones, responsáveis e chaves PIX.',
        parameters: {
          type: 'OBJECT',
          properties: {
            ativo: {
              type: 'BOOLEAN',
              description: 'Filtrar apenas ativos (true) ou todos.',
            },
          },
        },
      },
      {
        name: 'consultarMaquinas',
        description: 'Lista as máquinas PlayBox, seus números de planilha, integradoras e estabelecimento em que estão alocadas.',
        parameters: {
          type: 'OBJECT',
          properties: {},
        },
      },
      {
        name: 'obterChavePixEstabelecimento',
        description: 'Obtém a chave PIX de um estabelecimento específico pelo ID dele.',
        parameters: {
          type: 'OBJECT',
          properties: {
            estabelecimentoId: {
              type: 'NUMBER',
              description: 'ID do estabelecimento.',
            },
          },
          required: ['estabelecimentoId'],
        },
      },
      {
        name: 'registrarPagamentoAluguel',
        description: 'Marca um aluguel de repasse como pago no sistema PlayBox.',
        parameters: {
          type: 'OBJECT',
          properties: {
            aluguelId: {
              type: 'NUMBER',
              description: 'ID do lançamento de aluguel que foi pago.',
            },
          },
          required: ['aluguelId'],
        },
      },
      {
        name: 'executarAcaoOperacional',
        description: 'Executa ações operacionais como forçar relatório nos grupos, verificar máquinas offline ou sincronizar transações.',
        parameters: {
          type: 'OBJECT',
          properties: {
            acao: {
              type: 'STRING',
              description: "Ação a executar: 'disparar_relatorio' (envia relatório nos grupos), 'monitorar_offline' (verifica máquinas caídas), 'sincronizar_transacoes' (busca novas vendas das integradoras) ou 'sincronizar_maquinas' (descobre novas máquinas).",
            },
          },
          required: ['acao'],
        },
      },
    ],
  },
];

/**
 * Executor dinâmico das chamadas de ferramentas disparadas pelo Gemini
 */
export async function executePlayboxTool(name: string, args: Record<string, any>): Promise<any> {
  logger.info({ name, args }, 'Executando ferramenta de IA (Tool Call)');

  try {
    switch (name) {
      case 'consultarRelatorioFaturamento': {
        const { periodo, dataInicio, dataFim, cidade, estabelecimentoId, maquinaId } = args;
        if (periodo === '12h-atual' || periodo === '12h') {
          return await playboxService.getRelatorio12h();
        }
        if (periodo === '24h-anterior' || periodo === '24h' || periodo === 'ontem') {
          return await playboxService.getRelatorio24h();
        }
        if (periodo === 'mes' || periodo === 'mes-atual') {
          return await playboxService.getRelatorioMes();
        }

        // Customizado via API /api/relatorios
        const params = new URLSearchParams();
        if (periodo) params.set('periodo', periodo);
        if (dataInicio) params.set('dataInicio', dataInicio);
        if (dataFim) params.set('dataFim', dataFim);
        if (cidade) params.set('cidade', cidade);
        if (estabelecimentoId) params.set('estabelecimentoId', String(estabelecimentoId));
        if (maquinaId) params.set('maquinaId', String(maquinaId));

        const res = await fetch(`http://playbox-scheduler:8080/api/relatorios?${params.toString()}`, {
          headers: { 'X-API-KEY': 'undefined' },
        });
        return await res.json();
      }

      case 'consultarAlugueisERepasses': {
        const { tipo, dias } = args;
        if (tipo === 'vencendo') {
          return await playboxService.getAlugueisVencendo(dias || 7);
        }
        if (tipo === 'pendentes') {
          return await playboxService.getAlugueisPendentes();
        }
        if (tipo === 'pagos') {
          return await playboxService.getAlugueisPagos();
        }
        return await playboxService.getAlugueisPendentes();
      }

      case 'consultarEstabelecimentos': {
        const lista = await playboxService.getEstabelecimentos();
        if (args.ativo) {
          return lista.filter((e) => e.ativo);
        }
        return lista;
      }

      case 'consultarMaquinas': {
        return await playboxService.getMaquinas();
      }

      case 'obterChavePixEstabelecimento': {
        return await playboxService.getChavePix(Number(args.estabelecimentoId));
      }

      case 'registrarPagamentoAluguel': {
        return await playboxService.pagarAluguel(Number(args.aluguelId));
      }

      case 'executarAcaoOperacional': {
        const { acao } = args;
        if (acao === 'disparar_relatorio') {
          return await playboxService.triggerReport();
        }
        if (acao === 'monitorar_offline') {
          return await playboxService.triggerMonitor();
        }
        if (acao === 'sincronizar_transacoes') {
          return await playboxService.triggerImportTransactions();
        }
        if (acao === 'sincronizar_maquinas') {
          return await playboxService.syncMaquinas();
        }
        throw new Error(`Ação operacional desconhecida: "${acao}"`);
      }

      default:
        throw new Error(`Ferramenta desconhecida: "${name}"`);
    }
  } catch (err: any) {
    logger.error({ err, tool: name }, 'Erro ao executar ferramenta da IA');
    return { error: true, message: err.message };
  }
}
