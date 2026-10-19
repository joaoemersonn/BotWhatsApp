import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Cliente HTTP para a API do PlayBox Scheduler
 */
async function playboxFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${config.playboxBaseUrl}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(config.playboxApiKey ? { 'X-API-KEY': config.playboxApiKey } : {}),
    ...options.headers,
  };

  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro na API PlayBox (${res.status}): ${errText}`);
    }
    return (await res.json()) as T;
  } catch (error: any) {
    logger.error({ err: error, endpoint }, 'Falha na comunicação com PlayBox');
    throw error;
  }
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

  // Aluguéis e Repasses
  getAlugueisVencendo: (dias: number = 7) =>
    playboxFetch<PlayBoxAluguel[]>(`/api/alugueis/vencendo?dias=${dias}`),
  getAlugueisPendentes: () => playboxFetch<PlayBoxAluguel[]>('/api/alugueis/pendentes'),
  getAlugueisPagos: () => playboxFetch<PlayBoxAluguel[]>('/api/alugueis/pagos'),
  pagarAluguel: (id: number) =>
    playboxFetch<any>(`/api/alugueis/${id}/pagar`, { method: 'PUT' }),

  // Estabelecimentos
  getEstabelecimentos: () => playboxFetch<PlayBoxEstabelecimento[]>('/api/estabelecimentos'),
  getChavePix: (id: number) =>
    playboxFetch<Record<string, string>>(`/api/estabelecimentos/${id}/chave-pix`),

  // Máquinas
  getMaquinas: () => playboxFetch<PlayBoxMaquina[]>('/api/maquinas'),

  // Triggers operacionais
  triggerReport: () =>
    playboxFetch<any>('/api/trigger/report', { method: 'POST' }),
  triggerMonitor: () =>
    playboxFetch<any>('/api/trigger/monitor', { method: 'POST' }),
  triggerImportTransactions: () =>
    playboxFetch<any>('/api/trigger/import-transactions', { method: 'POST' }),
  syncMaquinas: () =>
    playboxFetch<any>('/api/maquinas/sync', { method: 'POST' }),
};
