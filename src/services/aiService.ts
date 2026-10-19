import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

interface ChatMessage {
  role: 'user' | 'model';
  parts: [{ text: string }];
}

// Histórico de conversas em memória por usuário (expira após 30 minutos de inatividade)
const conversationHistories = new Map<string, { messages: ChatMessage[]; lastActivity: number }>();

const CONTEXT_FILE = path.resolve(process.cwd(), 'data', 'ai_context.txt');

/**
 * Lê as instruções e contexto da operação
 */
export function getSystemInstruction(): string {
  try {
    if (fs.existsSync(CONTEXT_FILE)) {
      return fs.readFileSync(CONTEXT_FILE, 'utf-8').trim();
    }
  } catch (err) {
    logger.error({ err }, 'Erro ao ler arquivo de contexto da IA');
  }

  return 'Você é o assistente virtual inteligente da operação. Responda de forma clara, prestativa e objetiva com formatação do WhatsApp.';
}

/**
 * Atualiza o arquivo de contexto
 */
export function updateSystemInstruction(newContext: string): void {
  try {
    const dir = path.dirname(CONTEXT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONTEXT_FILE, newContext.trim(), 'utf-8');
  } catch (err) {
    logger.error({ err }, 'Erro ao salvar novo contexto da IA');
  }
}

/**
 * Obtém ou inicializa o histórico de mensagens de um usuário
 */
function getUserHistory(jid: string): ChatMessage[] {
  const now = Date.now();
  const session = conversationHistories.get(jid);
  if (!session || now - session.lastActivity > 30 * 60 * 1000) {
    const empty: ChatMessage[] = [];
    conversationHistories.set(jid, { messages: empty, lastActivity: now });
    return empty;
  }
  session.lastActivity = now;
  return session.messages;
}

/**
 * Reseta o histórico de conversa com a IA
 */
export function clearUserHistory(jid: string): void {
  conversationHistories.delete(jid);
}

/**
 * Envia uma mensagem para o Google Gemini e retorna a resposta
 */
export async function askGemini(userId: string, prompt: string): Promise<string> {
  const apiKey = config.geminiApiKey;
  if (!apiKey) {
    return '⚠️ A inteligência artificial ainda não foi configurada com a chave `GEMINI_API_KEY`.';
  }

  const systemInstruction = getSystemInstruction();
  const history = getUserHistory(userId);

  // Adiciona a nova mensagem do usuário
  history.push({
    role: 'user',
    parts: [{ text: prompt }],
  });

  // Mantém no máximo as últimas 10 interações (20 mensagens) para economizar contexto e tokens
  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }

  const requestBody = {
    contents: history,
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000,
    },
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, errorText }, 'Erro na resposta do Gemini');
      return '❌ Desculpe, não consegui processar sua solicitação no momento.';
    }

    const data: any = await response.json();
    const candidate = data?.candidates?.[0];
    const replyText = candidate?.content?.parts?.[0]?.text;

    if (!replyText) {
      return '⚠️ Não obtive resposta do modelo de IA.';
    }

    // Salva a resposta do modelo no histórico
    history.push({
      role: 'model',
      parts: [{ text: replyText }],
    });

    return replyText.trim();
  } catch (error: any) {
    logger.error({ err: error }, 'Falha na requisição para o Gemini');
    return `❌ Erro ao conectar com o serviço de IA: ${error.message}`;
  }
}
