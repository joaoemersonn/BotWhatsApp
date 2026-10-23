import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cliente HTTP para a API do PlayBox Scheduler com retry automático e tolerância a reinicializações
 */
async function playboxFetch<T>(endpoint: string, options: RequestInit = {}, maxRetries = 3): Promise<T> {
  const url = `${config.playboxBaseUrl}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(config.playboxApiKey ? { 'X-API-KEY': config.playboxApiKey } : {}),
    ...options.headers,
  };

  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { ...options, headers });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erro na API PlayBox (${res.status}): ${errText}`);
      }
      return (await res.json()) as T;
    } catch (error: any) {
      lastError = error;
      const isConnectionRefused =
        error?.message?.includes('fetch failed') ||
        error?.cause?.code === 'ECONNREFUSED' ||
        error?.message?.includes('ECONNREFUSED') ||
        error?.cause?.message?.includes('ECONNREFUSED');

      if (isConnectionRefused && attempt < maxRetries) {
        const waitMs = attempt * 1000;
        logger.warn({ endpoint, attempt, waitMs }, 'PlayBox Scheduler indisponível momentaneamente, tentando novamente...');
        await delay(waitMs);
        continue;
      }
      break;
    }
  }

  logger.error({ err: lastError, endpoint }, 'Falha na comunicação com PlayBox');
  if (
    lastError?.message?.includes('fetch failed') ||
    lastError?.cause?.code === 'ECONNREFUSED' ||
    lastError?.message?.includes('ECONNREFUSED')
  ) {
    throw new Error(
      'Não foi possível conectar ao PlayBox Scheduler no momento (o serviço pode estar reiniciando ou sincronizando). Por favor, tente novamente em instantes.'
    );
  }
  throw lastError;
}

export interface PlayBoxHealth {
  status: string;
  service: string;
}

export interface PlayBoxRelatorio {
  titulo: string;
  periodo: string;
  dataInicio: string;
  dataFim: string;
  resumoGeral: {
    faturamentoBruto: number;
    totalEstornos: number;
    faturamentoLiquido: number;
    quantidadePremios: number;
    receitaPorPremioLiberado: number;
    totalRegistros: number;
    formasPagamento: {
      especie: number;
      pix: number;
      credito: number;
      debito: number;
    };
  };
  porEstabelecimento: Array<{
    estabelecimentoNome: string;
    cidade: string;
    faturamentoBruto: number;
    faturamentoLiquido: number;
    quantidadePremios: number;
  }>;
  porMaquina: Array<{
    maquinaNome: string;
    numeroPlanilha?: number;
    faturamentoBruto: number;
    quantidadePremios: number;
  }>;
  porDia?: Array<{
    data: string;
    dataFormatada: string;
    faturamentoBruto: number;
    faturamentoLiquido: number;
    quantidadePremios: number;
    especie: number;
    pix: number;
    cartao: number;
  }>;
}

export interface PlayBoxEstabelecimento {
  id: number;
  nome: string;
  cidade: string;
  responsavel?: string;
  diaPagamento?: string;
  valorAcordado?: number;
  ativo: boolean;
  meiosPagamento?: Array<{
    id: number;
    tipo: string;
    chaveOuDetalhe: string;
    principal: boolean;
  }>;
}

export interface PlayBoxAluguel {
  id: number;
  estabelecimento: PlayBoxEstabelecimento;
  mesAno: string;
  dataVencimento: string;
  valor: number;
  pago: boolean;
  dataPagamento?: string | null;
  meioPagamentoUtilizado?: string | null;
  tipoAluguel?: string;
  valorManual?: boolean;
  observacao?: string;
  statusFormatado?: string;
  diasAtraso?: number;
  isVencido?: boolean;
  isAluguelDinamico?: boolean;
}

export interface PlayBoxAluguelResumo {
  mesAno: string;
  totalGeral: number;
  totalPago: number;
  totalPendente: number;
  totalVencido: number;
  totalEmAberto: number;
  qtdTotal: number;
  qtdPago: number;
  qtdPendente: number;
  qtdVencido: number;
  qtdEmAberto: number;
  qtdDinamicos: number;
}

export interface PlayBoxMonitorStatus {
  totalOffline: number;
  maquinasOffline: Array<{
    nome: string;
    offlineDesde: string;
  }>;
  failingIntegrations: string[];
  ultimaNotificacao?: string;
}

export interface PlayBoxMaquina {
  id: number;
  numeroPlanilha?: number;
  nomeIntegracao?: string;
  descricao?: string;
  integracao: string;
  ativo: boolean;
  estabelecimento?: PlayBoxEstabelecimento;
}

export interface PlayBoxEstoqueResumo {
  totalMaquinas: number;
  maquinasEmAlerta: number;
  totalPeluciasEmEstoque: number;
  mediaPeluciasPorMaquina: number;
}

export interface PlayBoxEstoqueMaquina {
  maquinaId: number;
  numeroPlanilha?: number | null;
  nome: string;
  integracao: string;
  externalId?: string;
  estabelecimentoId?: number | null;
  estabelecimentoNome?: string | null;
  cidade?: string | null;
  estoqueAtual: number;
  estoqueMinimoAlerta: number;
  capacidadeMaxima: number;
  estoqueBaixo: boolean;
  percentualOcupacao: number;
  ultimaEntrada?: string | null;
  ultimaSaida?: string | null;
}

export interface PlayBoxEstoqueResponse {
  resumo: PlayBoxEstoqueResumo;
  maquinas: PlayBoxEstoqueMaquina[];
}

export interface PlayBoxMovimentacaoEstoque {
  id: number;
  maquinaId: number;
  maquinaNome?: string;
  tipo: string;
  quantidade: number;
  estoqueAnterior: number;
  estoqueNovo: number;
  origem: string;
  observacao?: string;
  responsavel?: string;
  dataMovimentacao: string;
  externalRef?: string;
}

export interface PlayBoxPreviaColeta {
  maquinaId: number;
  maquinaNome: string;
  integracao: string;
  externalId: string;
  estabelecimentoId?: number;
  estabelecimentoNome?: string;
  dataHoraColeta: string;
  dataHoraUltimaColeta?: string;
  valorEsperado: number;
  primeiraColeta: boolean;
  diasApurados: number;
  periodoFormatado: string;
}

export interface PlayBoxColeta {
  id: number;
  maquinaId: number;
  maquinaNome: string;
  integracao: string;
  externalId: string;
  estabelecimentoId?: number;
  estabelecimentoNome?: string;
  dataHoraColeta: string;
  dataHoraUltimaColeta?: string;
  valorEsperado: number;
  valorReal?: number;
  diferenca?: number;
  status: 'PENDENTE_CONFERENCIA' | 'CONFERIDO' | 'CONFERIDO_DIVERGENTE' | 'CANCELADA' | string;
  dataHoraConferencia?: string;
  observacoes?: string;
  responsavel?: string;
  createdAt?: string;
}

/**
 * Métodos da API PlayBox
 */
export const playboxService = {
  // Health
  getHealth: () => playboxFetch<PlayBoxHealth>('/health'),

  // Relatórios
  getRelatorio12h: () => playboxFetch<PlayBoxRelatorio>('/api/relatorios/12h'),
  getRelatorio24h: () => playboxFetch<PlayBoxRelatorio>('/api/relatorios/24h'),
  getRelatorioMes: () => playboxFetch<PlayBoxRelatorio>('/api/relatorios/mes'),
  getRelatorioCustom: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return playboxFetch<any>(`/api/relatorios?${qs}`);
  },
  getRelatorioPdf: async (params: Record<string, string | number | boolean | undefined> = {}): Promise<Buffer> => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        qs.set(key, String(value));
      }
    }
    const query = qs.toString();
    const endpoint = `/api/relatorios/pdf${query ? `?${query}` : ''}`;
    const url = `${config.playboxBaseUrl}${endpoint}`;
    const headers = {
      ...(config.playboxApiKey ? { 'X-API-KEY': config.playboxApiKey } : {}),
    };

    let lastError: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Erro na API PlayBox ao gerar PDF (${res.status}): ${errText}`);
        }
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (error: any) {
        lastError = error;
        const isConnectionRefused =
          error?.message?.includes('fetch failed') ||
          error?.cause?.code === 'ECONNREFUSED' ||
          error?.message?.includes('ECONNREFUSED');
        if (isConnectionRefused && attempt < 3) {
          await delay(attempt * 1000);
          continue;
        }
        break;
      }
    }

    logger.error({ err: lastError, endpoint }, 'Falha ao buscar PDF do PlayBox');
    if (
      lastError?.message?.includes('fetch failed') ||
      lastError?.cause?.code === 'ECONNREFUSED' ||
      lastError?.message?.includes('ECONNREFUSED')
    ) {
      throw new Error(
        'Não foi possível conectar ao PlayBox para gerar o PDF (o backend pode estar reiniciando). Tente novamente em instantes.'
      );
    }
    throw lastError;
  },

  // Estoque de Pelúcias
  getEstoque: (params?: { estabelecimentoId?: number; cidade?: string; maquinaId?: number; apenasEstoqueBaixo?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.estabelecimentoId) qs.set('estabelecimentoId', String(params.estabelecimentoId));
    if (params?.cidade) qs.set('cidade', params.cidade);
    if (params?.maquinaId) qs.set('maquinaId', String(params.maquinaId));
    if (params?.apenasEstoqueBaixo !== undefined) qs.set('apenasEstoqueBaixo', String(params.apenasEstoqueBaixo));
    const query = qs.toString();
    return playboxFetch<PlayBoxEstoqueResponse>(`/api/estoque${query ? `?${query}` : ''}`);
  },
  getEstoqueDetalhe: (maquinaId: number) =>
    playboxFetch<{ maquina: PlayBoxEstoqueMaquina; movimentacoesRecentes: PlayBoxMovimentacaoEstoque[] }>(`/api/estoque/${maquinaId}`),
  adicionarPelucias: (maquinaId: number, data: { quantidade: number; observacao?: string; responsavel?: string }) =>
    playboxFetch<any>(`/api/estoque/${maquinaId}/adicionar`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  definirEstoque: (maquinaId: number, data: { novoEstoque: number; observacao?: string; responsavel?: string }) =>
    playboxFetch<any>(`/api/estoque/${maquinaId}/definir`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  configurarLimitesEstoque: (maquinaId: number, data: { estoqueMinimoAlerta?: number; capacidadeMaxima?: number }) =>
    playboxFetch<any>(`/api/estoque/${maquinaId}/limite-alerta`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getHistoricoEstoque: (maquinaId: number, params?: { inicio?: string; fim?: string }) => {
    const qs = new URLSearchParams();
    if (params?.inicio) qs.set('inicio', params.inicio);
    if (params?.fim) qs.set('fim', params.fim);
    const query = qs.toString();
    return playboxFetch<PlayBoxMovimentacaoEstoque[]>(`/api/estoque/${maquinaId}/historico${query ? `?${query}` : ''}`);
  },
  sincronizarEstoqueVendProMax: () =>
    playboxFetch<any>('/api/estoque/sincronizar-vendpromax', { method: 'POST' }),

  // Aluguéis e Repasses
  getAlugueis: (params?: { mesAno?: string; status?: string; estabelecimentoId?: number; cidade?: string }) => {
    const qs = new URLSearchParams();
    if (params?.mesAno) qs.set('mesAno', params.mesAno);
    if (params?.status) qs.set('status', params.status);
    if (params?.estabelecimentoId) qs.set('estabelecimentoId', String(params.estabelecimentoId));
    if (params?.cidade) qs.set('cidade', params.cidade);
    const query = qs.toString();
    return playboxFetch<PlayBoxAluguel[]>(`/api/alugueis${query ? `?${query}` : ''}`);
  },
  getAlugueisMeses: () => playboxFetch<string[]>('/api/alugueis/meses'),
  getAlugueisResumo: (mesAno?: string) => {
    const qs = new URLSearchParams();
    if (mesAno) qs.set('mesAno', mesAno);
    const query = qs.toString();
    return playboxFetch<PlayBoxAluguelResumo>(`/api/alugueis/resumo${query ? `?${query}` : ''}`);
  },
  getAlugueisHistoricoEstabelecimento: (id: number) =>
    playboxFetch<PlayBoxAluguel[]>(`/api/alugueis/estabelecimento/${id}`),
  getAlugueisVencendo: (dias: number = 7) =>
    playboxFetch<PlayBoxAluguel[]>(`/api/alugueis/vencendo?dias=${dias}`),
  getAlugueisPendentes: () => playboxFetch<PlayBoxAluguel[]>('/api/alugueis/pendentes'),
  getAlugueisPagos: () => playboxFetch<PlayBoxAluguel[]>('/api/alugueis/pagos'),
  gerarAlugueisMes: (mesAno?: string) => {
    const qs = new URLSearchParams();
    if (mesAno) qs.set('mesAno', mesAno);
    const query = qs.toString();
    return playboxFetch<PlayBoxAluguel[]>(`/api/alugueis/gerar-mes${query ? `?${query}` : ''}`, { method: 'POST' });
  },
  pagarAluguel: (id: number, dados?: { dataPagamento?: string; meio?: string; obs?: string }) =>
    playboxFetch<PlayBoxAluguel>(`/api/alugueis/${id}/pagar`, {
      method: 'PUT',
      body: dados ? JSON.stringify(dados) : undefined,
    }),
  estornarPagamentoAluguel: (id: number) =>
    playboxFetch<PlayBoxAluguel>(`/api/alugueis/${id}/estornar`, { method: 'PUT' }),
  definirValorAluguel: (id: number, valor: number, obs?: string) => {
    const qs = new URLSearchParams();
    qs.set('valor', String(valor));
    if (obs) qs.set('obs', obs);
    return playboxFetch<PlayBoxAluguel>(`/api/alugueis/${id}/valor?${qs.toString()}`, { method: 'PUT' });
  },
  definirValorAluguelPorEstabelecimento: (estabelecimentoId: number, mesAno: string, valor: number, obs?: string) => {
    const qs = new URLSearchParams();
    qs.set('estabelecimentoId', String(estabelecimentoId));
    qs.set('mesAno', mesAno);
    qs.set('valor', String(valor));
    if (obs) qs.set('obs', obs);
    return playboxFetch<PlayBoxAluguel>(`/api/alugueis/definir-valor?${qs.toString()}`, { method: 'PUT' });
  },
  calcularAluguelDinamico: (
    id: number,
    params?: {
      valorUnitarioPelucia?: number;
      taxaMaquininha?: number;
      telemetria?: number;
      visitas?: number;
      percentualRepasse?: number;
    }
  ) => {
    const qs = new URLSearchParams();
    if (params?.valorUnitarioPelucia !== undefined) qs.set('valorUnitarioPelucia', String(params.valorUnitarioPelucia));
    if (params?.taxaMaquininha !== undefined) qs.set('taxaMaquininha', String(params.taxaMaquininha));
    if (params?.telemetria !== undefined) qs.set('telemetria', String(params.telemetria));
    if (params?.visitas !== undefined) qs.set('visitas', String(params.visitas));
    if (params?.percentualRepasse !== undefined) qs.set('percentualRepasse', String(params.percentualRepasse));
    const query = qs.toString();
    return playboxFetch<PlayBoxAluguel>(`/api/alugueis/${id}/calcular-dinamico${query ? `?${query}` : ''}`, {
      method: 'POST',
    });
  },
  calcularAlugueisDinamicosMes: (mesAno?: string) => {
    const qs = new URLSearchParams();
    if (mesAno) qs.set('mesAno', mesAno);
    const query = qs.toString();
    return playboxFetch<PlayBoxAluguel[]>(`/api/alugueis/calcular-dinamicos${query ? `?${query}` : ''}`, {
      method: 'POST',
    });
  },

  // Estabelecimentos
  getEstabelecimentos: () => playboxFetch<PlayBoxEstabelecimento[]>('/api/estabelecimentos'),
  getChavePix: (id: number) =>
    playboxFetch<Record<string, string>>(`/api/estabelecimentos/${id}/chave-pix`),

  // Máquinas
  getMaquinas: () => playboxFetch<PlayBoxMaquina[]>('/api/maquinas'),
  fetchMaquinaInfo: (integracao: string, externalId: string) => {
    const qs = new URLSearchParams({ integracao, externalId }).toString();
    return playboxFetch<{ nome: string; integracao: string; externalId: string }>(`/api/maquinas/fetch-info?${qs}`);
  },

  // Monitoramento e Triggers operacionais
  getMonitorStatus: () =>
    playboxFetch<PlayBoxMonitorStatus>('/api/monitor/status'),
  triggerReport: () =>
    playboxFetch<any>('/api/trigger/report', { method: 'POST' }),
  triggerMonitor: () =>
    playboxFetch<any>('/api/trigger/monitor', { method: 'POST' }),
  triggerImportTransactions: () =>
    playboxFetch<any>('/api/trigger/import-transactions', { method: 'POST' }),
  syncMaquinas: () =>
    playboxFetch<any>('/api/maquinas/sync', { method: 'POST' }),
  triggerAlertaEstoque: () =>
    playboxFetch<any>('/api/trigger/alerta-estoque', { method: 'POST' }),

  // Coleta de Dinheiro em Espécie (Sangria / Cofres)
  getPreviaColeta: (maquinaId: number, dataHoraColeta?: string) => {
    const qs = new URLSearchParams();
    qs.set('maquinaId', String(maquinaId));
    if (dataHoraColeta) qs.set('dataHoraColeta', dataHoraColeta);
    return playboxFetch<PlayBoxPreviaColeta>(`/api/coletas/previa?${qs.toString()}`);
  },
  registrarColeta: (data: {
    maquinaId: number;
    dataHoraColeta?: string;
    valorEsperadoOverride?: number;
    valorReal?: number;
    observacoes?: string;
    responsavel?: string;
  }) =>
    playboxFetch<PlayBoxColeta>('/api/coletas', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  conferirColeta: (
    id: number,
    data: {
      valorReal: number;
      dataHoraConferencia?: string;
      observacoes?: string;
    }
  ) =>
    playboxFetch<PlayBoxColeta>(`/api/coletas/${id}/conferir`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  cancelarColeta: (id: number, motivo?: string) =>
    playboxFetch<PlayBoxColeta>(`/api/coletas/${id}/cancelar`, {
      method: 'PUT',
      body: JSON.stringify(motivo ? { motivo } : {}),
    }),
  getColetasPendentes: () =>
    playboxFetch<PlayBoxColeta[]>('/api/coletas/pendentes'),
  getColetas: (params?: { maquinaId?: number; estabelecimentoId?: number; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.maquinaId) qs.set('maquinaId', String(params.maquinaId));
    if (params?.estabelecimentoId) qs.set('estabelecimentoId', String(params.estabelecimentoId));
    if (params?.status) qs.set('status', params.status);
    const query = qs.toString();
    return playboxFetch<PlayBoxColeta[]>(`/api/coletas${query ? `?${query}` : ''}`);
  },
  getColetaById: (id: number) =>
    playboxFetch<PlayBoxColeta>(`/api/coletas/${id}`),
  excluirColeta: (id: number) =>
    playboxFetch<void>(`/api/coletas/${id}`, { method: 'DELETE' }),
};
