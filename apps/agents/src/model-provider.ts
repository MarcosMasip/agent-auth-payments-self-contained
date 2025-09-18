import { MockChatModel } from './mock-model.js';
// Dynamic import signature alignment: we only need bindTools + invoke for current graph usage
// Avoid tight coupling to LangChain internal BaseChatModel types to keep fallback flexible.
// The community package exports an Ollama class path like @langchain/community/llms/ollama or chat_models/ollama depending on version.
// We'll attempt requiring the chat_models variant first; if build fails user can adjust dependency version.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - tolerant import; type not strictly required for our narrowed interface
import { Ollama } from '@langchain/community/llms/ollama';
import { AIMessage } from '@langchain/core/messages';

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
  // Allowed model set we will consider (ignore all others for auto selection)
  const ALLOWED: { name: string; size: number }[] = [
    { name: 'smollm:135m', size: 135_000_000 },
    { name: 'tinyllama', size: 1_100_000_000 },
    { name: 'phi', size: 2_700_000_000 },
    { name: 'mistral', size: 7_000_000_000 },
    { name: 'llama3', size: 8_000_000_000 },
  ];
  const allowedNames = new Set(ALLOWED.map(m => m.name));
  // If user sets OLLAMA_MODEL we still honor it only if it's in allowed set.
  const explicitModel = process.env.OLLAMA_MODEL && allowedNames.has(process.env.OLLAMA_MODEL) ? process.env.OLLAMA_MODEL : undefined;
  try {
    // Basic health check
    const resp = await fetch(`${baseUrl}/api/tags`).catch(() => null);
    if (!resp || !resp.ok) {
      return { error: `Ollama server not reachable at ${baseUrl}` };
    }
    let tags: any = null;
    try { tags = await resp.json(); } catch { /* ignore */ }
  const models: any[] = Array.isArray(tags?.models) ? tags.models : [];

    // Heuristic parser: convert model tag name to approximate parameter count (lower = smaller model).
    // Helper to resolve canonical allowed name from an Ollama tag record (.name or .model).
    function canonicalName(rawName: string): string | undefined {
      if (allowedNames.has(rawName)) return rawName;
      // Some models might have versioned tags like llama3:8b – treat that as 'llama3' base if present in allowed list.
      const base = rawName.split(':')[0];
      if (allowedNames.has(base)) return base === 'smollm' ? 'smollm:135m' : base; // ensure smollm retains 135m suffix
      return undefined;
    }

    let chosenModel: string | undefined = explicitModel;
    if (explicitModel) {
      const exists = models.some((m: any) => canonicalName(m?.name || m?.model || '') === explicitModel);
      if (!exists) {
        return { error: `Allowed model '${explicitModel}' not found (pull one of: ${[...allowedNames].join(', ')})` };
      }
    } else {
      // Filter only allowed models actually installed
      const allowedAvailable = models
        .map((m: any) => canonicalName(m?.name || m?.model || ''))
        .filter((n: string | undefined): n is string => !!n);
      const unique = Array.from(new Set(allowedAvailable));
      if (unique.length === 0) {
        return { error: `No allowed models installed. Install one of: ${[...allowedNames].join(', ')}` };
      }
      // Pick smallest by size list above
      const sizeMap = new Map(ALLOWED.map(m => [m.name, m.size] as const));
      unique.sort((a, b) => (sizeMap.get(a)! - sizeMap.get(b)!) || a.localeCompare(b));
      chosenModel = unique[0];
    }

  const modelName = chosenModel!; // ensured above
  // Allow env overrides for generation behavior
  const temperature = parseFloat(process.env.OLLAMA_TEMPERATURE || '0.4');
  const topP = process.env.OLLAMA_TOP_P ? parseFloat(process.env.OLLAMA_TOP_P) : undefined;
  const raw = new Ollama({ baseUrl, model: modelName, temperature, topP } as any);

    // Per-model chat template + stop sequences
    interface Template { build: (sys: string, user: string) => { prompt: string; stop?: string[] } }
    const templates: Record<string, Template> = {
      // ChatML style
      'smollm:135m': {
        build: (s, u) => ({
          prompt: `<|im_start|>system\n${s}<|im_end|>\n<|im_start|>user\n${u}<|im_end|>\n<|im_start|>assistant\n`,
          stop: ['<|im_end|>', '<|im_start|>user', '<|im_start|>system']
        })
      },
      // Zephyr style
      tinyllama: {
        build: (s, u) => ({
          prompt: `<|system|>\n${s}</s>\n<|user|>\n${u}</s>\n<|assistant|>\n`,
          stop: ['</s>\n<|user|>', '</s>\n<|system|>']
        })
      },
      // Mistral [INST] format
      mistral: {
        build: (s, u) => ({
          prompt: `<s>[INST] ${s}\n${u} [/INST]`,
          stop: ['</s>', '[INST]']
        })
      },
      // Phi-3 chat format
      phi: {
        build: (s, u) => ({
          prompt: `<|system|>\n${s}<|end|>\n<|user|>\n${u}<|end|>\n<|assistant|>\n`,
          stop: ['<|end|>\n<|user|>', '<|system|>']
        })
      },
      // Llama 3 format
      llama3: {
        build: (s, u) => ({
          prompt: `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n${s}<|eot_id|><|start_header_id|>user<|end_header_id|>\n${u}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n`,
          stop: ['<|eot_id|><|start_header_id|>user', '<|eot_id|><|start_header_id|>system']
        })
      },
    };

    function pickTemplate(name: string): Template {
      return templates[name] || {
        build: (s, u) => ({ prompt: `${s}\n\n${u}\n\nAnswer:` })
      };
    }
    const wrapped: MinimalChatModel = {
      bindTools: () => wrapped,
      invoke: async (messages) => {
        const lastUser = [...messages].reverse().find(m => m.role === 'user');
        const lastSystem = [...messages].reverse().find(m => m.role === 'system');
        // Base system instruction sanitized: remove ISO timestamps & curb greetings repetition
        const rawSystem = (typeof lastSystem?.content === 'string' ? lastSystem?.content : '')
          .replace(/\d{4}-\d{2}-\d{2}T\d{2}:[0-9:.TZ-]+/g, '')
          .trim();
        const userContent = typeof lastUser?.content === 'string' ? lastUser?.content : (lastUser ? JSON.stringify(lastUser.content) : 'Hello');
        const userIsGreeting = /^\s*(hi|hello|hey)\b/i.test(userContent) && userContent.length < 30;
        const guidance = userIsGreeting
          ? 'Respond with a brief friendly greeting. Do not add date/time.'
          : 'Answer directly without prefacing with greetings, date/time, or restating the question. Do not fabricate multi-turn dialogue.';
        const systemInstruction = (rawSystem || 'You are a helpful AI assistant.') + ' ' + guidance;
        const { prompt, stop } = pickTemplate(modelName).build(systemInstruction, userContent);

        let result: any;
        try {
          result = await (raw as any).invoke(prompt, stop ? { stop } : undefined);
        } catch {
          result = await raw.invoke(prompt);
        }
        let text = typeof result === 'string' ? result : (result?.content ?? result?.text ?? JSON.stringify(result));
        if (text.startsWith(prompt)) {
          text = text.slice(prompt.length).trimStart();
        }
        // Strip any leading role/header tokens or repeated greeting with date
        text = text.replace(/^\s*(<\|im_start\|>assistant|<\|assistant\|>|<\|start_header_id\|>assistant<\|end_header_id\|>|Assistant:)\s*/i, '');
        // Remove echoed date/time strings if any slipped through
        text = text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:[0-9:.TZ-]+/g, '').trim();
        // If model still fabricated a new user/system turn deep into answer, trim after that
        const fabricatedIdx = text.search(/\n(?:User question:|### Instruction:|<\|im_start\|>user|<\|user\|>|User:|System:|<\|start_header_id\|>user)/);
        if (fabricatedIdx > 160) {
          text = text.slice(0, fabricatedIdx).trimEnd();
        }
        // If greeting suppression applies (not a greeting input) and text starts with greeting, strip it
        if (!userIsGreeting) {
          text = text.replace(/^\s*(hi|hello|hey)[,!\.]?\s+/i, '');
        }
        if (!text.trim()) text = userIsGreeting ? 'Hello! How can I help you today?' : 'Let me know what you would like to explore next.';
        return new AIMessage({ content: text });
      },
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
