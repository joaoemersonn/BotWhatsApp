import { Command } from '../types.js';

export type SessionStage =
  | 'idle'
  | 'menu_principal'
  | 'relatorios'
  | 'alugueis'
  | 'estabelecimentos'
  | 'acoes'
  | 'ai_chat';

interface UserSession {
  stage: SessionStage;
  lastActivity: number;
}

// Armazena a etapa atual de cada operador (reseta após 15 minutos sem interagir)
const userSessions = new Map<string, UserSession>();

function getSession(jid: string): UserSession {
  const now = Date.now();
  const session = userSessions.get(jid);
  if (!session || now - session.lastActivity > 15 * 60 * 1000) {
    const newSession: UserSession = { stage: 'idle', lastActivity: now };
    userSessions.set(jid, newSession);
    return newSession;
  }
  session.lastActivity = now;
  return session;
}

export function updateSessionStage(jid: string, stage: SessionStage): void {
  const session = getSession(jid);
  session.stage = stage;
  session.lastActivity = Date.now();
}

export function getUserStage(jid: string): SessionStage {
  return getSession(jid).stage;
}

export function buildMainMenuText(): string {
  return [
    '🎮 *PAINEL DE OPERAÇÕES PLAYBOX*',
    '',
    'Olá, operador! Escolha uma das categorias abaixo:',
    '',
    '1️⃣ - 📊 *Relatórios de Faturamento*',
    '2️⃣ - 💰 *Aluguéis & Repasses*',
    '3️⃣ - 📍 *Estabelecimentos & Chaves PIX*',
    '4️⃣ - ⚡ *Ações & Sincronizações*',
    '5️⃣ - 🤖 *Assistente IA (Copiloto)*',
    '6️⃣ - 🟢 *Status dos Serviços*',
    '',
    '💡 _Envie *0* a qualquer momento para voltar ao início._',
  ].join('\n');
}

export function buildReportsMenuText(): string {
  return [
    '📊 *RELATÓRIOS DE FATURAMENTO*',
    '',
    'Escolha o período que deseja consultar:',
    '',
    '1️⃣ - ⏱️ Últimas 12 Horas',
    '2️⃣ - 📅 Últimas 24 Horas (Ontem)',
    '3️⃣ - 🗓️ Acumulado do Mês Atual',
    '',
    '↩️ _Envie *0* para voltar ao menu principal._',
  ].join('\n');
}

export function buildAlugueisMenuText(): string {
  return [
    '💰 *ALUGUÉIS & REPASSES*',
    '',
    'Escolha uma das consultas:',
    '',
    '1️⃣ - ⏳ Vencendo nos Próximos 7 Dias',
    '2️⃣ - 🔴 Pagamentos Pendentes',
    '3️⃣ - 🟢 Pagamentos Já Efetuados',
    '',
    '↩️ _Envie *0* para voltar ao menu principal._',
  ].join('\n');
}

export function buildEstabelecimentosMenuText(): string {
  return [
    '📍 *ESTABELECIMENTOS & PIX*',
    '',
    'Escolha uma das opções:',
    '',
    '1️⃣ - 📋 Listar Todos os Estabelecimentos Ativos',
    '2️⃣ - 🔑 Consultar Chave PIX de um Local',
    '',
    '↩️ _Envie *0* para voltar ao menu principal._',
  ].join('\n');
}

export function buildAcoesMenuText(): string {
  return [
    '⚡ *AÇÕES & DISPAROS DA OPERAÇÃO*',
    '',
    'Execute comandos manuais no PlayBox:',
    '',
    '1️⃣ - 🚀 Forçar Envio do Relatório nos Grupos',
    '2️⃣ - 🔍 Disparar Verificação de Máquinas Offline',
    '3️⃣ - 🔄 Sincronizar Transações das Integradoras',
    '4️⃣ - 🕹️ Descobrir e Sincronizar Novas Máquinas',
    '',
    '↩️ _Envie *0* para voltar ao menu principal._',
  ].join('\n');
}

export const menuCommand: Command = {
  name: 'menu',
  description: 'Exibe o menu interativo de gerenciamento da operação PlayBox',
  aliases: ['painel', 'operacao', 'op', 'playbox'],
  execute: async ({ reply, senderJid }) => {
    updateSessionStage(senderJid, 'menu_principal');
    await reply(buildMainMenuText());
  },
};
