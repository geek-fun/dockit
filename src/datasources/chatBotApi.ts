import { invoke } from '@tauri-apps/api/tauri';

export enum ChatBotApiMethods {
  ASK = 'ASK',
  INITIALIZE = 'INITIALIZE',
  MODIFY_ASSISTANT = 'MODIFY_ASSISTANT',
  FIND_ASSISTANT = 'FIND_ASSISTANT',
}

export type ChatBotApiInput = {
  method: ChatBotApiMethods;
  question?: string;
  apiKey?: string;
  prompt?: string;
  model?: string;
  assistantId?: string;
  threadId?: string;
  httpProxy?: string;
};

const ASSISTANT_NAME = 'dockit-assistant';
//
// const createOpenaiClient = ({ apiKey, httpProxy }: { apiKey: string; httpProxy?: string }) => {
//   const proxy = !isEmpty(httpProxy) ? httpProxy : process.env.https_proxy;
//   const httpAgent = !isEmpty(proxy) ? new HttpsProxyAgent(proxy) : undefined;
//   // eslint-disable-next-line @typescript-eslint/ban-ts-comment
//   // @ts-ignore
//   return new OpenAI({ httpAgent, apiKey, fetch });
// };

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
  }) => {
    // const openai = createOpenaiClient({ apiKey, httpProxy });
    // const { assistantId, threadId } = await chatBotApi.initialize({ openai, prompt, model });
    // return { assistantId, threadId };
    return await invoke('create_assistant', { apiKey, prompt, model, httpProxy });
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
    // get the assistant by assistantId
    const assistant = await invoke('find_assistant', {
      apiKey,
      assistantId,
      model,
      httpProxy,
    });
    if (!assistant) {
      throw new Error('Assistant not found');
    }
    await invoke('modify_assistant', { apiKey, assistantId, model, prompt, httpProxy });
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
    try {
      return await invoke('find_assistant', { apiKey, assistantId, model, httpProxy });
    } catch (err) {
      const error = err as Error;
      // if (error.=== 404) {
      //   return undefined;
      // } else {
      throw new Error(
        `Error finding assistant, status:, details: ${error.message}, stack: ${error.stack}`,
      );
      // }
    }
  },
  chatAssistant: async ({
    assistantId,
    threadId,
    question,
  }: {
    assistantId: string;
    threadId: string;
    question: string;
  }) => {
    await openai.beta.threads.messages.create(threadId, { role: 'user', content: question });

    openai.beta.threads.runs
      .stream(threadId, { assistant_id: assistantId })
      .on('messageCreated', message =>
        mainWindow.webContents.send('chat-bot-api-message-delta', {
          msgEvent: 'messageCreated',
          message,
        }),
      )
      .on('messageDelta', delta => {
        mainWindow.webContents.send('chat-bot-api-message-delta', {
          msgEvent: 'messageDelta',
          delta,
        });
      })
      .on('messageDone', message =>
        mainWindow.webContents.send('chat-bot-api-message-delta', {
          msgEvent: 'messageDone',
          message,
        }),
      );
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
