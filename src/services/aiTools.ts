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
        name: 'consultarEstoquePelucias',
        description: 'Consulta o nível de estoque de pelúcias e brinquedos das máquinas PlayBox, com resumo geral de máquinas em alerta (< 30 pelúcias), ocupação e filtros opcionais por cidade, estabelecimento ou máquina.',
        parameters: {
          type: 'OBJECT',
          properties: {
            apenasEstoqueBaixo: {
              type: 'BOOLEAN',
              description: 'Se true, lista apenas máquinas que estão em estado de alerta com estoque baixo (< 30 pelúcias) necessitando de abastecimento.',
            },
            cidade: {
              type: 'STRING',
              description: 'Filtrar por cidade (ex: Custódia, Sertânia, Monteiro, Sumé, Iguaracy).',
            },
            estabelecimentoId: {
              type: 'NUMBER',
              description: 'Filtrar por ID do estabelecimento parceiro.',
            },
            maquinaId: {
              type: 'NUMBER',
              description: 'Filtrar por ID de uma máquina específica.',
            },
          },
        },
      },
      {
        name: 'detalharEstoqueMaquina',
        description: 'Consulta o estoque detalhado de uma máquina específica e suas últimas movimentações recentes de abastecimento ou saída de prêmios.',
        parameters: {
          type: 'OBJECT',
          properties: {
            maquinaId: {
              type: 'NUMBER',
              description: 'ID da máquina.',
            },
          },
          required: ['maquinaId'],
        },
      },
      {
        name: 'abastecerPeluciasMaquina',
        description: 'Registra o abastecimento físico de pelúcias/brinquedos em uma máquina, somando a quantidade informada ao estoque atual.',
        parameters: {
          type: 'OBJECT',
          properties: {
            maquinaId: {
              type: 'NUMBER',
              description: 'ID da máquina que foi abastecida.',
            },
            quantidade: {
              type: 'NUMBER',
              description: 'Quantidade de pelúcias adicionadas na máquina.',
            },
            observacao: {
              type: 'STRING',
              description: 'Observação opcional sobre o abastecimento (ex: "Reposição semanal de pelúcias médias").',
            },
            responsavel: {
              type: 'STRING',
              description: 'Nome ou identificação do operador/técnico que realizou o abastecimento.',
            },
          },
          required: ['maquinaId', 'quantidade'],
        },
      },
      {
        name: 'ajustarEstoqueMaquina',
        description: 'Define diretamente o estoque exato da máquina após contagem física / inventário / balanço no local.',
        parameters: {
          type: 'OBJECT',
          properties: {
            maquinaId: {
              type: 'NUMBER',
              description: 'ID da máquina.',
            },
            novoEstoque: {
              type: 'NUMBER',
              description: 'Quantidade exata física de pelúcias contadas na máquina.',
            },
            observacao: {
              type: 'STRING',
              description: 'Observação ou motivo do ajuste de estoque (ex: "Contagem física mensal").',
            },
            responsavel: {
              type: 'STRING',
              description: 'Nome do operador responsável pela contagem.',
            },
          },
          required: ['maquinaId', 'novoEstoque'],
        },
      },
      {
        name: 'consultarHistoricoEstoque',
        description: 'Consulta o histórico completo de movimentações de estoque (entradas, saídas de prêmios, balanços) de uma máquina.',
        parameters: {
          type: 'OBJECT',
          properties: {
            maquinaId: {
              type: 'NUMBER',
              description: 'ID da máquina.',
            },
            inicio: {
              type: 'STRING',
              description: 'Data de início no formato YYYY-MM-DD.',
            },
            fim: {
              type: 'STRING',
              description: 'Data final no formato YYYY-MM-DD.',
            },
          },
          required: ['maquinaId'],
        },
      },
      {
        name: 'executarAcaoOperacional',
        description: 'Executa ações operacionais como forçar relatório nos grupos, verificar máquinas offline, sincronizar transações ou disparar alerta de estoque.',
        parameters: {
          type: 'OBJECT',
          properties: {
            acao: {
              type: 'STRING',
              description: "Ação a executar: 'disparar_relatorio' (envia relatório nos grupos), 'monitorar_offline' (verifica máquinas caídas), 'sincronizar_transacoes' (busca novas vendas das integradoras), 'sincronizar_maquinas' (descobre novas máquinas), 'disparar_alerta_estoque' (verifica e envia alertas de estoque baixo < 30 no grupo) ou 'sincronizar_estoque_vendpromax' (importa estoque nativo das controladoras VendProMax).",
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
      case 'consultarEstoquePelucias': {
        const { apenasEstoqueBaixo, cidade, estabelecimentoId, maquinaId } = args;
        return await playboxService.getEstoque({
          apenasEstoqueBaixo: apenasEstoqueBaixo !== undefined ? Boolean(apenasEstoqueBaixo) : undefined,
          cidade,
          estabelecimentoId: estabelecimentoId ? Number(estabelecimentoId) : undefined,
          maquinaId: maquinaId ? Number(maquinaId) : undefined,
        });
      }

      case 'detalharEstoqueMaquina': {
        return await playboxService.getEstoqueDetalhe(Number(args.maquinaId));
      }

      case 'abastecerPeluciasMaquina': {
        const { maquinaId, quantidade, observacao, responsavel } = args;
        return await playboxService.adicionarPelucias(Number(maquinaId), {
          quantidade: Number(quantidade),
          observacao,
          responsavel,
        });
      }

      case 'ajustarEstoqueMaquina': {
        const { maquinaId, novoEstoque, observacao, responsavel } = args;
        return await playboxService.definirEstoque(Number(maquinaId), {
          novoEstoque: Number(novoEstoque),
          observacao,
          responsavel,
        });
      }

      case 'consultarHistoricoEstoque': {
        const { maquinaId, inicio, fim } = args;
        return await playboxService.getHistoricoEstoque(Number(maquinaId), { inicio, fim });
      }
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
        const params: Record<string, string> = {};
        if (periodo) params.periodo = periodo;
        if (dataInicio) params.dataInicio = dataInicio;
        if (dataFim) params.dataFim = dataFim;
        if (cidade) params.cidade = cidade;
        if (estabelecimentoId) params.estabelecimentoId = String(estabelecimentoId);
        if (maquinaId) params.maquinaId = String(maquinaId);

        return await playboxService.getRelatorioCustom(params);
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
        if (acao === 'disparar_alerta_estoque') {
          return await playboxService.triggerAlertaEstoque();
        }
        if (acao === 'sincronizar_estoque_vendpromax') {
          return await playboxService.sincronizarEstoqueVendProMax();
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
