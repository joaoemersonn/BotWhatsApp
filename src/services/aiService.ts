import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { playboxToolsDeclaration, executePlayboxTool, AiToolContext } from './aiTools.js';

interface TextChatMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

// Histórico de conversas em memória por usuário (expira após 30 minutos de inatividade)
// Armazena estritamente mensagens textuais de diálogo [user, model, user, model, ...]
const conversationHistories = new Map<string, { messages: TextChatMessage[]; lastActivity: number }>();

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
function getUserHistory(jid: string): TextChatMessage[] {
  const now = Date.now();
  const session = conversationHistories.get(jid);
  if (!session || now - session.lastActivity > 30 * 60 * 1000) {
    const empty: TextChatMessage[] = [];
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
 * Sanitiza o histórico para manter estritamente pares alternados (user -> model -> user -> model)
 * contendo apenas partes de texto, expurgando qualquer resíduo de functionCall / functionResponse.
 */
function getSanitizedHistory(userId: string): TextChatMessage[] {
  const raw = getUserHistory(userId);
  const clean: TextChatMessage[] = [];

  for (const item of raw) {
    if (!item || !Array.isArray(item.parts)) continue;
    const textParts = item.parts.filter(
      (p: any) => typeof p?.text === 'string' && p.text.trim().length > 0
    );
    if (textParts.length === 0) continue;

    const last = clean[clean.length - 1];
    if (last && last.role === item.role) {
      last.parts.push(...textParts);
    } else {
      clean.push({
        role: item.role,
        parts: [{ text: textParts.map((p) => p.text).join('\n') }],
      });
    }
  }

  // O histórico deve começar sempre com 'user'
  while (clean.length > 0 && clean[0].role !== 'user') {
    clean.shift();
  }

  // O histórico prévio deve terminar sempre com 'model' antes de inserirmos a nova mensagem do usuário
  while (clean.length > 0 && clean[clean.length - 1].role !== 'model') {
    clean.pop();
  }

  // Mantém no máximo 16 mensagens (8 rodadas completas de conversa)
  if (clean.length > 16) {
    clean.splice(0, clean.length - 16);
    while (clean.length > 0 && clean[0].role !== 'user') {
      clean.shift();
    }
  }

  return clean;
}

/**
 * Executa uma chamada para a API do Gemini com fallback entre modelos suportados
 */
async function callGeminiApi(
  apiKey: string,
  models: string[],
  requestBody: any
): Promise<{ ok: boolean; status: number; data?: any; errorText?: string }> {
  let lastStatus = 0;
  let lastErrorText = '';

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (res.ok) {
        const data = await res.json();
        return { ok: true, status: res.status, data };
      }

      lastStatus = res.status;
      lastErrorText = await res.text();
      logger.warn({ model, status: res.status, lastErrorText }, 'Falha no modelo, tentando fallback...');
    } catch (fetchErr: any) {
      lastStatus = 500;
      lastErrorText = fetchErr.message;
      logger.warn({ model, err: fetchErr.message }, 'Exceção de rede no modelo, tentando fallback...');
    }
  }

  return { ok: false, status: lastStatus, errorText: lastErrorText };
}

/**
 * Envia uma mensagem para o Google Gemini com suporte total a Function Calling
 */
export async function askGemini(userId: string, prompt: string, context?: AiToolContext): Promise<string> {
  const apiKey = config.geminiApiKey;
  if (!apiKey) {
    return '⚠️ A inteligência artificial ainda não foi configurada com a chave `GEMINI_API_KEY`.';
  }

  return await processGeminiRequest(userId, prompt, context, false);
}

/**
 * Processador interno da requisição do Gemini com suporte a auto-recuperação (auto-heal)
 */
async function processGeminiRequest(
  userId: string,
  prompt: string,
  context?: AiToolContext,
  isRetry: boolean = false
): Promise<string> {
  const apiKey = config.geminiApiKey!;
  const systemInstruction = getSystemInstruction();

  // Se for retry por erro de estado, inicia sem histórico anterior
  const previousHistory = isRetry ? [] : getSanitizedHistory(userId);

  // Contents deste turno: histórico textual limpo + prompt atual do usuário
  const contents: any[] = [
    ...previousHistory,
    {
      role: 'user',
      parts: [{ text: prompt }],
    },
  ];

  const models = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.6-flash',
  ];

  const maxRounds = 8;
  let finalReplyText = '';

  try {
    for (let round = 0; round < maxRounds; round++) {
      const requestBody = {
        contents,
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        tools: playboxToolsDeclaration,
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 1500,
        },
      };

      const apiResult = await callGeminiApi(apiKey, models, requestBody);

      if (!apiResult.ok) {
        logger.error({ status: apiResult.status, errorText: apiResult.errorText }, 'Todos os modelos de IA falharam');

        // Se o erro for 400 por problema de histórico (ex: function response desincronizada) e ainda não for retry:
        // Limpa imediatamente o histórico do usuário e retenta a pergunta atual com histórico limpo!
        if (
          !isRetry &&
          apiResult.status === 400 &&
          (apiResult.errorText?.includes('function response') || apiResult.errorText?.includes('INVALID_ARGUMENT'))
        ) {
          logger.warn({ userId }, 'Detectada anomalia de histórico no Gemini. Resetando sessão e tentando novamente...');
          clearUserHistory(userId);
          return await processGeminiRequest(userId, prompt, context, true);
        }

        let parsedMessage = '';
        try {
          const errObj = JSON.parse(apiResult.errorText || '{}');
          parsedMessage = errObj?.error?.message || '';
        } catch {}

        if (apiResult.status === 429) {
          return '⚠️ *Limite de requisições da IA atingido (Quota 429).* Por favor, aguarde alguns instantes antes de tentar novamente.';
        }
        if (apiResult.status === 503) {
          return '⚠️ *Serviço da IA temporariamente indisponível (503).* Os servidores da Google estão com alta demanda no momento. Tente novamente em instantes.';
        }
        return `❌ *Erro ao consultar a IA (${apiResult.status || 'Falha'}):* ${parsedMessage || apiResult.errorText || 'Não foi possível processar no momento.'}`;
      }

      const candidate = apiResult.data?.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      // Verifica se o modelo solicitou chamadas de função
      const functionCalls = parts.filter((p: any) => p.functionCall);

      if (functionCalls.length > 0) {
        // Registra o turno do modelo (com as functionCalls) exatamente como retornado
        contents.push({
          role: 'model',
          parts,
        });

        // Executa todas as funções solicitadas
        const toolResponses: any[] = [];
        for (const fc of functionCalls) {
          const { name, args } = fc.functionCall;
          const result = await executePlayboxTool(name, args || {}, context);
          toolResponses.push({
            functionResponse: {
              name,
              response: { result },
            },
          });
        }

        // Adiciona a resposta da função imediatamente após o turno de functionCall
        contents.push({
          role: 'user',
          parts: toolResponses,
        });

        continue;
      }

      // Se não houve function call, obtém o texto final da resposta
      const replyText = parts.find((p: any) => typeof p.text === 'string')?.text;
      if (replyText) {
        finalReplyText = replyText.trim();
        break;
      }

      break;
    }

    if (!finalReplyText) {
      finalReplyText = '⚠️ Solicitação processada com sucesso, mas não consegui formatar uma resposta final.';
    }

    // Salva SOMENTE o diálogo textual limpo no histórico de longo prazo (user -> model).
    // Jamais salvamos chamadas de ferramentas brutas no histórico persistente entre mensagens.
    const userHistory = getUserHistory(userId);
    userHistory.push({ role: 'user', parts: [{ text: prompt }] });
    userHistory.push({ role: 'model', parts: [{ text: finalReplyText }] });

    // Mantém histórico em número par de turnos alternados
    if (userHistory.length > 16) {
      userHistory.splice(0, userHistory.length - 16);
    }

    return finalReplyText;
  } catch (error: any) {
    logger.error({ err: error }, 'Falha inesperada no processamento do Gemini');
    return `❌ Erro ao conectar com o serviço de IA: ${error.message}`;
  }
}
