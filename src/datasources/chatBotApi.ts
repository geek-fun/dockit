import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { tauriClient } from './ApiClients.ts';

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
    callback: (event: unknown) => void,
  ) => {
    console.log('start chatAssistant');
    if (!receiveRegistration) {
      console.log('register chatbot-message event');
      await listen<string>('chatbot-message', event => {
        console.log(`Got error in window ${event.windowLabel}, payload: ${event.payload}`);
        callback(event);
      });
      receiveRegistration = true;
    }
    console.log('invoke chat_assistant', { assistantId, threadId, question });
    const chat_assistant = await tauriClient.invoke('chat_assistant', {
      assistantId,
      threadId,
      question,
    });
    console.log('chat_assistant', chat_assistant);
    //
    // await openai.beta.threads.messages.create(threadId, { role: 'user', content: question });
    //
    // openai.beta.threads.runs
    //   .stream(threadId, { assistant_id: assistantId })
    //   .on('messageCreated', message =>
    //     mainWindow.webContents.send('chat-bot-api-message-delta', {
    //       msgEvent: 'messageCreated',
    //       message,
    //     }),
    //   )
    //   .on('messageDelta', delta => {
    //     mainWindow.webContents.send('chat-bot-api-message-delta', {
    //       msgEvent: 'messageDelta',
    //       delta,
    //     });
    //   })
    //   .on('messageDone', message =>
    //     mainWindow.webContents.send('chat-bot-api-message-delta', {
    //       msgEvent: 'messageDone',
    //       message,
    //     }),
    //   );
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
