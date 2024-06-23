import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { tauriClient } from './ApiClients.ts';
import { ChatMessageRole } from '../store';

let receiveRegistration = false;

const chatBotApi = {
  createAssistant: async ({
    apiKey,
    prompt,
    model,
    httpProxy,
  }: {
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
      console.log('createAssistant error', JSON.stringify(err));
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
  }) => {
    console.log('findAssistant', { apiKey, assistantId, model, httpProxy });
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
    console.log('start chatAssistant');
    if (!receiveRegistration) {
      console.log('register chatbot-message event');
      await listen<string>('chatbot-message', event => {
        console.log(
          `Receive chatbot-message in window ${event.windowLabel}, payload: ${event.payload}`,
        );
        callback(JSON.parse(event.payload));
      });
      receiveRegistration = true;
    }
    console.log('invoke chat_assistant', { assistantId, threadId, question });
    await tauriClient.invoke('chat_assistant', {
      assistantId,
      threadId,
      question,
    });
  },
  validateConfig: async ({
    apiKey,
    model,
    httpProxy,
  }: {
    apiKey: string;
    model: string;
    httpProxy?: string;
  }) => {
    try {
      await invoke('create_openai_client', { apiKey, model, httpProxy });
      return true;
    } catch (err) {
      return false;
    }
  },
};

export { chatBotApi };
