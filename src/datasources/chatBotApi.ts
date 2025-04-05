import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { tauriClient } from './ApiClients.ts';

export enum ProviderEnum {
  OPENAI = 'OPENAI',
  DEEP_SEEK = 'DEEP_SEEK',
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
    try {
      const {
        data: { assistant_id, thread_id },
      } = await tauriClient.invoke('create_assistant', {
        apiKey,
        model,
        instructions: prompt,
        httpProxy,
      });

      return { assistantId: assistant_id as string, threadId: thread_id as string };
    } catch (err) {
      throw err;
    }
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
        callback(JSON.parse(event.payload));
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
    provider: ProviderEnum;
    apiKey: string;
    model: string;
    httpProxy?: string;
  }) => {
    try {
      await invoke('create_openai_client', config);
      return true;
    } catch (err) {
      return false;
    }
  },
  createClient: async (config: {
    provider: ProviderEnum;
    apiKey: string;
    model: string;
    httpProxy?: string;
  }) => {
    try {
      await invoke('create_openai_client', config);
    } catch (err) {
      throw err;
    }
  },
  chatStream: async (
    config: {
      provider: ProviderEnum;
      model: string;
      question: string;
      history: Array<ChatMessage>;
    },
    callback: (event: {
      role: ChatMessageRole;
      content: Array<{ text: { value: string } }>;
      state: string;
    }) => void,
  ) => {
    if (!receiveRegistration) {
      await listen<string>('chatbot-message', event => {
        callback(JSON.parse(event.payload));
      });
      receiveRegistration = true;
    }

    try {
      await invoke('chat_stream', config);
    } catch (err) {
      throw err;
    }
  },
};

export { chatBotApi };
