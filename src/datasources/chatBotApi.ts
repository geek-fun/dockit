import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { tauriClient } from './ApiClients.ts';
import { jsonify } from '../common';

export enum ProviderEnum {
  OPENAI = 'OPENAI',
  DEEP_SEEK = 'DEEP_SEEK',
  OPENROUTER = 'OPENROUTER',
  OLLAMA = 'OLLAMA',
  LM_STUDIO = 'LM_STUDIO',
}

export enum ChatMessageStatus {
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  RECEIVED = 'RECEIVED',
}

export enum ChatMessageRole {
  USER = 'USER',
  BOT = 'BOT',
}

export type ChatMessage = {
  id: string;
  status: ChatMessageStatus;
  content: string;
  role: ChatMessageRole;
};

let receiveRegistration = false;

const chatBotApi = {
  createAssistant: async ({
    apiKey,
    prompt,
    model,
    httpProxy,
  }: {
    provider: ProviderEnum;
    apiKey: string;
    prompt: string;
    model: string;
    httpProxy?: string;
  }): Promise<{ assistantId: string; threadId: string }> => {
    const {
      data: { assistant_id, thread_id },
    } = await tauriClient.invoke('create_assistant', {
      apiKey,
      model,
      instructions: prompt,
      httpProxy,
    });

    return { assistantId: assistant_id as string, threadId: thread_id as string };
  },

  modifyAssistant: async ({
    apiKey,
    prompt,
    model,
    assistantId,
    httpProxy,
  }: {
    provider: ProviderEnum;
    apiKey: string;
    prompt: string;
    model: string;
    httpProxy?: string;
    assistantId: string;
  }) => {
    const assistant = tauriClient.invoke('find_assistant', {
      apiKey,
      assistantId,
      model,
      httpProxy,
    });

    if (!assistant) {
      throw new Error('Assistant not found');
    }
    await tauriClient.invoke('modify_assistant', {
      apiKey,
      assistantId,
      model,
      instructions: prompt,
      httpProxy,
    });
  },
  findAssistant: async ({
    apiKey,
    assistantId,
    model,
    httpProxy,
  }: {
    apiKey: string;
    assistantId: string;
    model: string;
    httpProxy?: string;
    provider: ProviderEnum;
  }) => {
    return await tauriClient.invoke('find_assistant', {
      apiKey,
      assistantId,
      model,
      httpProxy,
    });
  },
  chatAssistant: async (
    {
      assistantId,
      threadId,
      question,
    }: {
      assistantId: string;
      threadId: string;
      question: string;
    },
    callback: (event: {
      role: ChatMessageRole;
      content: Array<{ text: { value: string } }>;
      state: string;
    }) => void,
  ) => {
    if (!receiveRegistration) {
      await listen<string>('chatbot-message', event => {
        callback(jsonify.parse(event.payload));
      });
      receiveRegistration = true;
    }
    await tauriClient.invoke('chat_assistant', {
      assistantId,
      threadId,
      question,
    });
  },
  validateConfig: async (config: {
    provider: string;
    apiKey: string;
    model: string;
    httpProxy?: string;
    proxyMode?: string;
    baseUrl?: string;
  }): Promise<{ valid: boolean; error?: string }> => {
    console.log('[DEBUG] validateConfig called with:', {
      provider: config.provider,
      model: config.model,
      proxyMode: config.proxyMode,
      httpProxy: config.httpProxy || '(none)',
      baseUrl: config.baseUrl,
      apiKeyLength: config.apiKey?.length || 0,
    });
    const VALIDATE_TIMEOUT_MS = 35_000;
    try {
      const result = await Promise.race([
        invoke<boolean>('validate_llm_config', config),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timed out')), VALIDATE_TIMEOUT_MS),
        ),
      ]);
      console.log('[DEBUG] validateConfig result:', result);
      return { valid: result };
    } catch (err) {
      console.error('[DEBUG] validateConfig error:', (err as Error).message || String(err));
      return { valid: false, error: (err as Error).message || String(err) };
    }
  },
  listModels: async (config: {
    provider: string;
    apiKey: string;
    httpProxy?: string;
    proxyMode?: string;
    baseUrl?: string;
  }) => {
    const LIST_MODELS_TIMEOUT_MS = 60_000;
    const result = await Promise.race([
      invoke<Array<string>>('list_llm_models', config),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Model listing timed out')), LIST_MODELS_TIMEOUT_MS),
      ),
    ]);
    return result;
  },
};

export { chatBotApi };
