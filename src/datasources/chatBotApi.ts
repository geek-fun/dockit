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
  // initialize: async ({
  //   openai,
  //   prompt,
  //   model,
  // }: {
  //   openai: OpenAI;
  //   prompt: string;
  //   model: string;
  // }) => {
  //   const assistant = await openai.beta.assistants.create({
  //     name: ASSISTANT_NAME,
  //     instructions: prompt,
  //     model: model,
  //   });
  //   const thread = await openai.beta.threads.create();
  //
  //   return { assistantId: assistant.id, threadId: thread.id };
  // },
  // ask: async ({
  //   openai,
  //   assistantId,
  //   threadId,
  //   question,
  //   mainWindow,
  // }: {
  //   openai: OpenAI;
  //   assistantId: string;
  //   threadId: string;
  //   question: string;
  // }) => {
  //   await openai.beta.threads.messages.create(threadId, { role: 'user', content: question });
  //
  //   openai.beta.threads.runs
  //     .stream(threadId, { assistant_id: assistantId })
  //     .on('messageCreated', message =>
  //       mainWindow.webContents.send('chat-bot-api-message-delta', {
  //         msgEvent: 'messageCreated',
  //         message,
  //       }),
  //     )
  //     .on('messageDelta', delta => {
  //       mainWindow.webContents.send('chat-bot-api-message-delta', {
  //         msgEvent: 'messageDelta',
  //         delta,
  //       });
  //     })
  //     .on('messageDone', message =>
  //       mainWindow.webContents.send('chat-bot-api-message-delta', {
  //         msgEvent: 'messageDone',
  //         message,
  //       }),
  //     );
  // },
  // modifyAssistant: async ({
  //   apiKey,
  //   prompt,
  //   model,
  //   assistantId,
  //   httpProxy,
  // }: {
  //   apiKey: string;
  //   prompt: string;
  //   model: string;
  //   httpProxy?: string;
  //   assistantId: string;
  // }) => {
  //   // get the assistant by assistantId
  //   const openai = createOpenaiClient({ apiKey, httpProxy });
  //   const assistant = await openai.beta.assistants.retrieve(assistantId);
  //   if (!assistant) {
  //     throw new Error('Assistant not found');
  //   }
  //   await openai.beta.assistants.update(assistantId, {
  //     name: ASSISTANT_NAME,
  //     model,
  //     instructions: prompt,
  //   });
  // },
  // findAssistant: async ({
  //   apiKey,
  //   assistantId,
  //   httpProxy,
  // }: {
  //   apiKey: string;
  //   assistantId: string;
  //   httpProxy?: string;
  // }) => {
  //   try {
  //     const openai = createOpenaiClient({ apiKey, httpProxy });
  //     return await openai.beta.assistants.retrieve(assistantId);
  //   } catch ({ status, details }) {
  //     if (status === 404) {
  //       return undefined;
  //     } else {
  //       throw new Error(`Error finding assistant, status: ${status}, details: ${details}`);
  //     }
  //   }
  // },
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
