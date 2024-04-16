import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';

export enum ChatBotApiMethods {
  ASK = 'ASK',
  INITIALIZE = 'INITIALIZE',
}

export type ChatBotApiInput = {
  method: ChatBotApiMethods;
  question?: string;
  apiKey?: string;
  prompt?: string;
  model?: string;
};

const ASSISTANT_NAME = 'dockit-assistant';

const chatBotApi = {
  initialize: async ({
    apiKey,
    prompt,
    model,
  }: {
    apiKey: string;
    prompt: string;
    model: string;
  }) => {
    const httpAgent = process.env.https_proxy
      ? new HttpsProxyAgent(process.env.https_proxy)
      : undefined;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const openai = new OpenAI({ httpAgent, apiKey, fetch });

    const assistant = await openai.beta.assistants.create({
      name: ASSISTANT_NAME,
      instructions: prompt,
      model: model,
    });
    const thread = await openai.beta.threads.create();

    return { openai, assistant, thread };
  },
  ask: async ({
    openai,
    assistantId,
    threadId,
    question,
  }: {
    openai: OpenAI;
    assistantId: string;
    threadId: string;
    question: string;
  }) => {
    await openai.beta.threads.messages.create(threadId, { role: 'user', content: question });

    openai.beta.threads.runs
      .stream(threadId, { assistant_id: assistantId })
      .on('textCreated', text => console.log('textCreated, text:', text))
      .on('textDelta', (textDelta, snapshot) =>
        console.log('textDelta, textDelta:', JSON.stringify({ textDelta, snapshot })),
      );
  },
};
const registerChatBotApiListener = (ipcMain: Electron.IpcMain) => {
  let instance: {
    openai: OpenAI;
    assistant: OpenAI.Beta.Assistants.Assistant;
    thread: OpenAI.Beta.Threads.Thread;
  };
  ipcMain.handle(
    'chatBotApi',
    async (_, { method, question, apiKey, prompt, model }: ChatBotApiInput) => {
      if (method === ChatBotApiMethods.INITIALIZE.toLowerCase()) {
        instance = await chatBotApi.initialize({ apiKey, prompt, model });
        // @TODO implement openai stateful client
      }
      if (method === ChatBotApiMethods.ASK.toLowerCase()) {
        if (!instance) {
          throw new Error('internal error');
        }
        await chatBotApi.ask({
          openai: instance.openai,
          assistantId: instance.assistant.id,
          threadId: instance.thread.id,
          question: question,
        });
      }
    },
  );
};

export { registerChatBotApiListener };
