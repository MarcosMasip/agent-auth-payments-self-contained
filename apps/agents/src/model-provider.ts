import { MockChatModel } from './mock-model.js';
// Dynamic import signature alignment: we only need bindTools + invoke for current graph usage
// Avoid tight coupling to LangChain internal BaseChatModel types to keep fallback flexible.
// The community package exports an Ollama class path like @langchain/community/llms/ollama or chat_models/ollama depending on version.
// We'll attempt requiring the chat_models variant first; if build fails user can adjust dependency version.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - tolerant import; type not strictly required for our narrowed interface
import { Ollama } from '@langchain/community/llms/ollama';

export interface MinimalChatModel {
  bindTools: (tools: any) => MinimalChatModel;
  invoke: (messages: Array<{ role: string; content: any }>) => Promise<any>;
}

export interface ModelProviderResult {
  model: MinimalChatModel;
  meta: {
    provider: 'ollama' | 'mock' | 'cloud';
    modelName: string;
    degraded: boolean;
    error?: string;
  };
}

async function tryOllama(): Promise<ModelProviderResult | { error: string }> {
  // Auto-attempt Ollama in LOCAL_MODE unless explicitly disabled
  const local = process.env.LOCAL_MODE === 'true';
  const disabled = process.env.OLLAMA_DISABLE_AUTO === 'true';
  if (!local || disabled) return { error: 'Ollama auto detection disabled or not in LOCAL_MODE' };
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const modelName = process.env.OLLAMA_MODEL || 'mistral';
  try {
    // Basic health check
    const resp = await fetch(`${baseUrl}/api/tags`).catch(() => null);
    if (!resp || !resp.ok) {
      return { error: `Ollama server not reachable at ${baseUrl}` };
    }
    let tags: any = null;
    try { tags = await resp.json(); } catch { /* ignore */ }
    const available = Array.isArray(tags?.models)
      ? tags.models.some((m: any) => m?.name === modelName || m?.model === modelName)
      : true; // if parsing fails, be optimistic and attempt invoke (will 404 then fallback)
    if (!available) {
      return { error: `Ollama model '${modelName}' not found (pull with: ollama pull ${modelName})` };
    }
    const raw = new Ollama({ baseUrl, model: modelName, temperature: 0.2 });
    const wrapped: MinimalChatModel = {
      bindTools: () => wrapped, // tools not yet integrated with Ollama locally; return self
      invoke: (messages) => raw.invoke(messages as any),
    };
    return { model: wrapped, meta: { provider: 'ollama', modelName, degraded: false } };
  } catch (e: any) {
    return { error: `Failed to initialize Ollama: ${e.message}` };
  }
}

export async function getLocalModel(): Promise<ModelProviderResult> {
  // Try Ollama first if enabled
  const ollamaAttempt = await tryOllama();
  if ('model' in ollamaAttempt) {
    return ollamaAttempt;
  }
  // Fallback to mock
  const model = new MockChatModel();
  return {
    model,
    meta: {
      provider: 'mock',
      modelName: 'mock-local',
      degraded: process.env.LOCAL_MODE === 'true',
      error: process.env.LOCAL_MODE === 'true' ? ollamaAttempt.error : undefined,
    },
  };
}
