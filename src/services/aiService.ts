import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { playboxToolsDeclaration, executePlayboxTool } from './aiTools.js';

interface ChatMessage {
  role: 'user' | 'model';
  parts: Array<any>;
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

  return 'Você é o assistente virtual inteligente da operação PlayBox. Responda de forma clara, prestativa e objetiva com formatação do WhatsApp.';
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
 * Envia uma mensagem para o Google Gemini com suporte total a Function Calling
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

  // Limite de mensagens mantidas para histórico
  if (history.length > 25) {
    history.splice(0, history.length - 25);
  }

  // Lista de modelos suportados com fallback automático
  const models = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
  ];

  try {
    // Loop de resolução de Function Calling (máximo 4 iterações consecutivas de chamadas)
    for (let round = 0; round < 4; round++) {
      const requestBody = {
        contents: history,
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        tools: playboxToolsDeclaration,
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 1500,
        },
      };

      let response: Response | null = null;
      let lastErrorText = '';
      let lastStatus = 0;

      for (const model of models) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (res.ok) {
          response = res;
          break;
        } else {
          lastStatus = res.status;
          lastErrorText = await res.text();
          logger.warn({ model, status: res.status, lastErrorText }, 'Falha no modelo, tentando fallback...');
        }
      }

      if (!response) {
        logger.error({ lastErrorText, lastStatus }, 'Todos os modelos de IA falharam');
        let parsedMessage = '';
        try {
          const errObj = JSON.parse(lastErrorText);
          parsedMessage = errObj?.error?.message || '';
        } catch {}

        if (lastStatus === 429) {
          return '⚠️ *Limite de requisições da IA atingido (Quota 429).* Por favor, aguarde alguns instantes antes de tentar novamente.';
        }
        if (lastStatus === 503) {
          return '⚠️ *Serviço da IA temporariamente indisponível (503).* Os servidores da Google estão com alta demanda no momento. Tente novamente em instantes.';
        }
        return `❌ *Erro ao consultar a IA (${lastStatus || 'Falha'}):* ${parsedMessage || lastErrorText || 'Não foi possível processar no momento.'}`;
      }

      const data: any = await response.json();
      const candidate = data?.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      // Verifica se o modelo solicitou uma ou mais chamadas de função (functionCall)
      const functionCalls = parts.filter((p: any) => p.functionCall);

      if (functionCalls.length > 0) {
        // Registra no histórico o pensamento / chamada do modelo
        history.push({
          role: 'model',
          parts,
        });

        // Executa todas as function calls solicitadas
        const toolResponses: any[] = [];
        for (const fc of functionCalls) {
          const { name, args } = fc.functionCall;
          const result = await executePlayboxTool(name, args || {});
          toolResponses.push({
            functionResponse: {
              name,
              response: { result },
            },
          });
        }

        // Devolve os resultados para o Gemini gerar a resposta final formatada
        history.push({
          role: 'user',
          parts: toolResponses,
        });

        continue; // Continua o loop para a próxima resposta
      }

      // Se não houve function call, obtém o texto final
      const replyText = parts.find((p: any) => p.text)?.text;
      if (replyText) {
        history.push({
          role: 'model',
          parts: [{ text: replyText }],
        });
        return replyText.trim();
      }

      break;
    }

    return '⚠️ Não consegui formatar uma resposta final.';
  } catch (error: any) {
    logger.error({ err: error }, 'Falha na requisição para o Gemini');
    return `❌ Erro ao conectar com o serviço de IA: ${error.message}`;
  }
}
