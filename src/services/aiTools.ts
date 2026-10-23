import { proto } from '@whiskeysockets/baileys';
import { playboxService } from './playboxService.js';
import { logger } from '../utils/logger.js';
import { WASocket } from '../handlers/types.js';

export interface AiToolContext {
  sock?: WASocket;
  remoteJid?: string;
  msg?: proto.IWebMessageInfo;
}

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
        description: 'Consulta a lista de aluguéis e repasses das máquinas aos estabelecimentos parceiros com filtros avançados por mês (mesAno), status (EM_ABERTO, PAGO, VENCIDO), cidade ou estabelecimento.',
        parameters: {
          type: 'OBJECT',
          properties: {
            mesAno: {
              type: 'STRING',
              description: "Mês no formato YYYY-MM (ex: '2026-10') ou 'TODOS'.",
            },
            status: {
              type: 'STRING',
              description: "Filtrar por status: 'EM_ABERTO' (ou 'PENDENTE'), 'PAGO', 'VENCIDO' ou 'TODOS'.",
            },
            estabelecimentoId: {
              type: 'NUMBER',
              description: 'Filtrar por ID do estabelecimento parceiro.',
            },
            cidade: {
              type: 'STRING',
              description: 'Filtrar por cidade (ex: Custódia, Sertânia, Monteiro, Sumé).',
            },
            tipo: {
              type: 'STRING',
              description: "Tipo legado/atalho: 'vencendo' (a vencer em breve), 'pendentes' (atrasados/não pagos) ou 'pagos' (já quitados).",
            },
            dias: {
              type: 'NUMBER',
              description: "Quantidade de dias à frente para filtrar vencimentos quando tipo for 'vencendo' (padrão: 7).",
            },
          },
        },
      },
      {
        name: 'consultarResumoAlugueis',
        description: 'Obtém o resumo estatístico consolidado de aluguéis e repasses (total contratado, valor pago, total em aberto, vencidos com contagem e contratos dinâmicos) para um mês ou geral.',
        parameters: {
          type: 'OBJECT',
          properties: {
            mesAno: {
              type: 'STRING',
              description: "Mês no formato YYYY-MM (ex: '2026-10') ou deixe vazio para geral.",
            },
          },
        },
      },
      {
        name: 'gerarAlugueisMes',
        description: 'Gera os lançamentos de aluguéis e repasses mensais para todos os estabelecimentos cadastrados no PlayBox para o mês especificado.',
        parameters: {
          type: 'OBJECT',
          properties: {
            mesAno: {
              type: 'STRING',
              description: "Mês no formato YYYY-MM (ex: '2026-10'). Padrão: mês atual.",
            },
          },
        },
      },
      {
        name: 'ajustarValorAluguel',
        description: 'Define ou ajusta manualmente o valor de aluguel/repasse de um registro específico (por aluguelId) ou por estabelecimento e mês.',
        parameters: {
          type: 'OBJECT',
          properties: {
            aluguelId: {
              type: 'NUMBER',
              description: 'ID do lançamento de aluguel (opcional se informar estabelecimentoId e mesAno).',
            },
            estabelecimentoId: {
              type: 'NUMBER',
              description: 'ID do estabelecimento parceiro (ex: 3 para Praça do Sabor).',
            },
            mesAno: {
              type: 'STRING',
              description: "Mês no formato YYYY-MM (ex: '2026-10').",
            },
            valor: {
              type: 'NUMBER',
              description: 'Novo valor do aluguel/repasse em reais (R$).',
            },
            observacao: {
              type: 'STRING',
              description: 'Motivo ou observação do ajuste de valor.',
            },
          },
          required: ['valor'],
        },
      },
      {
        name: 'calcularAluguelDinamico',
        description: 'Calcula o aluguel dinâmico (25% sobre o lucro operacional do mês, deduzindo telemetria R$ 69,90, manutenção R$ 350,00, pelúcia R$ 19,90 e taxa de maquininha) para um aluguel específico ou para todos os contratos dinâmicos do mês.',
        parameters: {
          type: 'OBJECT',
          properties: {
            aluguelId: {
              type: 'NUMBER',
              description: 'ID do lançamento de aluguel a calcular (opcional se mesAno for informado para recalcular todos).',
            },
            mesAno: {
              type: 'STRING',
              description: "Mês no formato YYYY-MM (ex: '2026-10') para recalcular todos os dinâmicos.",
            },
            valorUnitarioPelucia: {
              type: 'NUMBER',
              description: 'Custo unitário da pelúcia em R$ (padrão: 19.90).',
            },
            taxaMaquininha: {
              type: 'NUMBER',
              description: 'Taxa percentual da maquininha (padrão: 4.99%).',
            },
            telemetria: {
              type: 'NUMBER',
              description: 'Mensalidade do sistema de telemetria em R$ (padrão: 69.90).',
            },
            visitas: {
              type: 'NUMBER',
              description: 'Custos de visitas/manutenção em R$ (padrão: 350.00).',
            },
            percentualRepasse: {
              type: 'NUMBER',
              description: 'Percentual de repasse sobre o lucro operacional (padrão: 25.0%).',
            },
          },
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
        name: 'gerarRelatorioPdf',
        description: 'Gera o Relatório Mensal/Operacional oficial completo do PlayBox em formato PDF (com métricas de pelúcia, entradas, despesas, repasse e histórico) e envia o arquivo PDF diretamente para o operador no chat do WhatsApp.',
        parameters: {
          type: 'OBJECT',
          properties: {
            periodo: {
              type: 'STRING',
              description: "Período do relatório: 'mes' (padrão, acumulado do mês atual), '24h-anterior', '12h-atual' ou 'hoje'.",
            },
            estabelecimentoId: {
              type: 'NUMBER',
              description: 'Filtrar pelo ID numérico de um estabelecimento parceiro (ex: 3 para Praça do Sabor).',
            },
            maquinaId: {
              type: 'NUMBER',
              description: 'Filtrar por uma máquina específica.',
            },
            dataInicio: {
              type: 'STRING',
              description: 'Data de início customizada no formato YYYY-MM-DD.',
            },
            dataFim: {
              type: 'STRING',
              description: 'Data de término customizada no formato YYYY-MM-DD.',
            },
            incluirHistorico: {
              type: 'BOOLEAN',
              description: 'Se true (padrão), inclui a tabela completa de histórico de transações e movimentações no PDF.',
            },
          },
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
      {
        name: 'consultarPreviaColeta',
        description: 'Calcula a prévia do valor esperado de dinheiro em espécie (cédulas/moedas) acumulado no cofre de uma máquina desde a última coleta até agora, baseado nas transações.',
        parameters: {
          type: 'OBJECT',
          properties: {
            maquinaId: {
              type: 'NUMBER',
              description: 'ID numérico da máquina no PlayBox.',
            },
            dataHoraColeta: {
              type: 'STRING',
              description: 'Data e hora da coleta pretendida no formato ISO (opcional, padrão é agora).',
            },
          },
          required: ['maquinaId'],
        },
      },
      {
        name: 'registrarColetaDinheiro',
        description: 'Registra o recolhimento/sangria física de dinheiro no cofre de uma máquina. Se valorReal for informado, concilia imediatamente calculando sobras ou faltas. Se não for informado, a coleta fica como PENDENTE_CONFERENCIA para contagem posterior.',
        parameters: {
          type: 'OBJECT',
          properties: {
            maquinaId: {
              type: 'NUMBER',
              description: 'ID da máquina onde foi realizada a coleta.',
            },
            valorReal: {
              type: 'NUMBER',
              description: 'Valor total em reais (R$) contado fisicamente no dinheiro coletado (opcional se for contar depois).',
            },
            valorEsperadoOverride: {
              type: 'NUMBER',
              description: 'Valor esperado manual caso deseje sobrepor o cálculo automático do sistema.',
            },
            observacoes: {
              type: 'STRING',
              description: 'Observações sobre a coleta ou malote (ex: "Notas amassadas", "Envelope lacrado nº 123").',
            },
            responsavel: {
              type: 'STRING',
              description: 'Nome do operador ou responsável que realizou a sangria.',
            },
            dataHoraColeta: {
              type: 'STRING',
              description: 'Data e hora em que a retirada física ocorreu (ISO).',
            },
          },
          required: ['maquinaId'],
        },
      },
      {
        name: 'conferirColetaDinheiro',
        description: 'Conclui e concilia uma coleta que estava PENDENTE_CONFERENCIA, informando o valor real contado no malote para bater com o valor esperado e identificar se houve sobra ou falta de caixa.',
        parameters: {
          type: 'OBJECT',
          properties: {
            coletaId: {
              type: 'NUMBER',
              description: 'ID numérico da coleta pendente a ser conferida.',
            },
            valorReal: {
              type: 'NUMBER',
              description: 'Valor total em reais (R$) contado no envelope/malote.',
            },
            observacoes: {
              type: 'STRING',
              description: 'Observações adicionais da conferência.',
            },
            dataHoraConferencia: {
              type: 'STRING',
              description: 'Data e hora da conferência (ISO).',
            },
          },
          required: ['coletaId', 'valorReal'],
        },
      },
      {
        name: 'consultarColetasPendentes',
        description: 'Lista todas as coletas de dinheiro em espécie que foram retiradas das máquinas e estão com status PENDENTE_CONFERENCIA, aguardando contagem física.',
        parameters: {
          type: 'OBJECT',
          properties: {},
        },
      },
      {
        name: 'consultarHistoricoColetas',
        description: 'Consulta o histórico de coletas e sangrias de dinheiro realizadas, com filtros opcionais por máquina, estabelecimento ou status.',
        parameters: {
          type: 'OBJECT',
          properties: {
            maquinaId: {
              type: 'NUMBER',
              description: 'Filtrar por máquina específica.',
            },
            estabelecimentoId: {
              type: 'NUMBER',
              description: 'Filtrar por estabelecimento específico.',
            },
            status: {
              type: 'STRING',
              description: "Filtrar por status: 'PENDENTE_CONFERENCIA', 'CONFERIDO' ou 'CONFERIDO_DIVERGENTE'.",
            },
          },
        },
      },
      {
        name: 'cancelarColetaDinheiro',
        description: 'Cancela um registro de coleta/sangria de dinheiro física realizada incorretamente, com justificativa/motivo opcional. A coleta cancelada não entra como base de cálculo (Marco Zero) para apurações futuras.',
        parameters: {
          type: 'OBJECT',
          properties: {
            coletaId: {
              type: 'NUMBER',
              description: 'ID da coleta a ser cancelada.',
            },
            motivo: {
              type: 'STRING',
              description: 'Motivo ou justificativa do cancelamento (opcional).',
            },
          },
          required: ['coletaId'],
        },
      },
      {
        name: 'consultarStatusMonitor',
        description: 'Consulta o status atual em tempo real do monitoramento de máquinas offline e saúde das conexões com as integradoras (VENDPROMAX, PAYXYZ, ZAPIZI).',
        parameters: {
          type: 'OBJECT',
          properties: {},
        },
      },
      {
        name: 'consultarInfoIntegracaoMaquina',
        description: 'Consulta na integradora externa (VENDPROMAX, PAYXYZ ou ZAPIZI) o nome ou localização de uma máquina pelo seu código/ID externo.',
        parameters: {
          type: 'OBJECT',
          properties: {
            integracao: {
              type: 'STRING',
              description: 'Nome da integradora: VENDPROMAX, PAYXYZ ou ZAPIZI.',
            },
            externalId: {
              type: 'STRING',
              description: 'ID externo ou código único da máquina na integradora.',
            },
          },
          required: ['integracao', 'externalId'],
        },
      },
    ],
  },
];

/**
 * Executor dinâmico das chamadas de ferramentas disparadas pelo Gemini
 */
export async function executePlayboxTool(
  name: string,
  args: Record<string, any>,
  context?: AiToolContext
): Promise<any> {
  logger.info({ name, args }, 'Executando ferramenta de IA (Tool Call)');

  try {
    switch (name) {
      case 'gerarRelatorioPdf': {
        const { periodo = 'mes', estabelecimentoId, maquinaId, dataInicio, dataFim, incluirHistorico = true } = args;
        const pdfBuffer = await playboxService.getRelatorioPdf({
          periodo,
          estabelecimentoId,
          maquinaId,
          dataInicio,
          dataFim,
          incluirHistorico,
        });

        const safePeriodo = (periodo || 'mes').toLowerCase();
        const filename = `relatorio-operacoes${estabelecimentoId ? `-estab-${estabelecimentoId}` : ''}-${safePeriodo}.pdf`;

        if (context?.sock && context?.remoteJid) {
          await context.sock.sendMessage(
            context.remoteJid,
            {
              document: pdfBuffer,
              mimetype: 'application/pdf',
              fileName: filename,
              caption: `📄 *Relatório de Operações PlayBox* (${safePeriodo.toUpperCase()})`,
            },
            context.msg ? { quoted: context.msg as any } : undefined
          );
          return {
            sucesso: true,
            mensagem: `O relatório oficial em PDF (${filename}) foi gerado com sucesso e enviado diretamente aqui no chat do WhatsApp!`,
            arquivo: filename,
            tamanhoBytes: pdfBuffer.length,
          };
        }

        return {
          sucesso: true,
          mensagem: `PDF "${filename}" gerado com sucesso (${pdfBuffer.length} bytes).`,
        };
      }

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
        const { tipo, dias, mesAno, status, estabelecimentoId, cidade } = args;
        if (tipo === 'vencendo') {
          return await playboxService.getAlugueisVencendo(dias || 7);
        }
        if (tipo === 'pendentes') {
          return await playboxService.getAlugueisPendentes();
        }
        if (tipo === 'pagos') {
          return await playboxService.getAlugueisPagos();
        }
        return await playboxService.getAlugueis({
          mesAno,
          status,
          estabelecimentoId: estabelecimentoId ? Number(estabelecimentoId) : undefined,
          cidade,
        });
      }

      case 'consultarResumoAlugueis': {
        return await playboxService.getAlugueisResumo(args.mesAno);
      }

      case 'gerarAlugueisMes': {
        return await playboxService.gerarAlugueisMes(args.mesAno);
      }

      case 'ajustarValorAluguel': {
        const { aluguelId, estabelecimentoId, mesAno, valor, observacao } = args;
        if (aluguelId) {
          return await playboxService.definirValorAluguel(Number(aluguelId), Number(valor), observacao);
        }
        if (estabelecimentoId && mesAno) {
          return await playboxService.definirValorAluguelPorEstabelecimento(
            Number(estabelecimentoId),
            mesAno,
            Number(valor),
            observacao
          );
        }
        throw new Error('Informe o "aluguelId" ou a combinação de "estabelecimentoId" e "mesAno".');
      }

      case 'calcularAluguelDinamico': {
        const { aluguelId, mesAno, valorUnitarioPelucia, taxaMaquininha, telemetria, visitas, percentualRepasse } = args;
        if (aluguelId) {
          return await playboxService.calcularAluguelDinamico(Number(aluguelId), {
            valorUnitarioPelucia: valorUnitarioPelucia !== undefined ? Number(valorUnitarioPelucia) : undefined,
            taxaMaquininha: taxaMaquininha !== undefined ? Number(taxaMaquininha) : undefined,
            telemetria: telemetria !== undefined ? Number(telemetria) : undefined,
            visitas: visitas !== undefined ? Number(visitas) : undefined,
            percentualRepasse: percentualRepasse !== undefined ? Number(percentualRepasse) : undefined,
          });
        }
        return await playboxService.calcularAlugueisDinamicosMes(mesAno);
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
        const { aluguelId, dataPagamento, meio, obs } = args;
        return await playboxService.pagarAluguel(Number(aluguelId), { dataPagamento, meio, obs });
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

      case 'consultarPreviaColeta': {
        const { maquinaId, dataHoraColeta } = args;
        return await playboxService.getPreviaColeta(Number(maquinaId), dataHoraColeta);
      }

      case 'registrarColetaDinheiro': {
        const { maquinaId, dataHoraColeta, valorEsperadoOverride, valorReal, observacoes, responsavel } = args;
        return await playboxService.registrarColeta({
          maquinaId: Number(maquinaId),
          dataHoraColeta,
          valorEsperadoOverride: valorEsperadoOverride !== undefined ? Number(valorEsperadoOverride) : undefined,
          valorReal: valorReal !== undefined ? Number(valorReal) : undefined,
          observacoes,
          responsavel,
        });
      }

      case 'conferirColetaDinheiro': {
        const { coletaId, valorReal, dataHoraConferencia, observacoes } = args;
        return await playboxService.conferirColeta(Number(coletaId), {
          valorReal: Number(valorReal),
          dataHoraConferencia,
          observacoes,
        });
      }

      case 'consultarColetasPendentes': {
        return await playboxService.getColetasPendentes();
      }

      case 'consultarHistoricoColetas': {
        const { maquinaId, estabelecimentoId, status } = args;
        return await playboxService.getColetas({
          maquinaId: maquinaId ? Number(maquinaId) : undefined,
          estabelecimentoId: estabelecimentoId ? Number(estabelecimentoId) : undefined,
          status,
        });
      }

      case 'cancelarColetaDinheiro': {
        const { coletaId, motivo } = args;
        return await playboxService.cancelarColeta(Number(coletaId), motivo);
      }

      case 'consultarStatusMonitor': {
        return await playboxService.getMonitorStatus();
      }

      case 'consultarInfoIntegracaoMaquina': {
        const { integracao, externalId } = args;
        return await playboxService.fetchMaquinaInfo(integracao, externalId);
      }

      default:
        throw new Error(`Ferramenta desconhecida: "${name}"`);
    }
  } catch (err: any) {
    logger.error({ err, tool: name }, 'Erro ao executar ferramenta da IA');
    return { error: true, message: err.message };
  }
}
