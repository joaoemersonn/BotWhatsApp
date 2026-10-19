import { Command } from '../types.js';

interface UserSession {
  stage: 'idle' | 'menu_principal' | 'relatorios' | 'operacao' | 'ai_chat';
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

export function updateSessionStage(jid: string, stage: UserSession['stage']): void {
  const session = getSession(jid);
  session.stage = stage;
  session.lastActivity = Date.now();
}

export function getUserStage(jid: string): UserSession['stage'] {
  return getSession(jid).stage;
}

export function buildMainMenuText(): string {
  return [
    '⚙️ *PAINEL DE GERENCIAMENTO DA OPERAÇÃO*',
    '',
    'Olá, operador! Escolha uma das opções abaixo digitando o número correspondente:',
    '',
    '1️⃣ - 📊 *Relatórios da Operação*',
    '2️⃣ - 🟢 *Status e Saúde dos Serviços*',
    '3️⃣ - 👥 *Verificar Operadores & Grupos*',
    '4️⃣ - ℹ️ *Informações do Bot / Servidor*',
    '5️⃣ - 🤖 *Assistente IA (Copiloto da Operação)*',
    '',
    '💡 _Envie *0* a qualquer momento para cancelar ou voltar ao início._',
  ].join('\n');
}

export function buildReportsMenuText(): string {
  return [
    '📊 *MENU DE RELATÓRIOS*',
    '',
    'Selecione o relatório que deseja gerar:',
    '',
    '1.1 - 📈 Resumo do Dia',
    '1.2 - 📅 Fechamento Semanal',
    '1.3 - 📉 Alertas e Ocorrências Recentes',
    '',
    '↩️ _Digite *0* para voltar ao menu principal._',
  ].join('\n');
}

export function buildServicesMenuText(): string {
  return [
    '🟢 *STATUS DOS SERVIÇOS*',
    '',
    '• 🤖 *WhatsApp Bot:* Conectado & Operacional',
    '• 🌐 *API HTTP:* Ativa na porta 3000',
    '• 💾 *Sessão:* Persistida com sucesso',
    '• ⏱️ *Uptime:* Bot ativo e monitorando',
    '',
    '↩️ _Digite *0* para voltar ao menu principal._',
  ].join('\n');
}

export const menuCommand: Command = {
  name: 'menu',
  description: 'Exibe o menu interativo de gerenciamento da operação',
  aliases: ['painel', 'operacao', 'op'],
  execute: async ({ reply, senderJid }) => {
    updateSessionStage(senderJid, 'menu_principal');
    await reply(buildMainMenuText());
  },
};
