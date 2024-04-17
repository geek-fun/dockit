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
  assistantId?: string;
  threadId?: string;
};

const ASSISTANT_NAME = 'dockit-assistant';

const createOpenaiClient = ({ apiKey }: { apiKey: string }) => {
  const httpAgent = process.env.https_proxy
    ? new HttpsProxyAgent(process.env.https_proxy)
    : undefined;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return new OpenAI({ httpAgent, apiKey, fetch });
};

const chatBotApi = {
  initialize: async ({
    openai,
    prompt,
    model,
  }: {
    openai: OpenAI;
    prompt: string;
    model: string;
  }) => {
    const assistant = await openai.beta.assistants.create({
      name: ASSISTANT_NAME,
      instructions: prompt,
      model: model,
    });
    const thread = await openai.beta.threads.create();
    console.log(`thread: ${thread}, assistant: ${assistant}`);

    return { assistantId: assistant.id, threadId: thread.id };
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
  let openai: OpenAI;

  ipcMain.handle(
    'chatBotApi',
    async (
      _,
      { method, question, apiKey, prompt, model, assistantId, threadId }: ChatBotApiInput,
    ) => {
      console.log(`chatBotApi method: ${method}`);
      if (method === ChatBotApiMethods.INITIALIZE) {
        openai = createOpenaiClient({ apiKey });

        const { assistantId, threadId } = await chatBotApi.initialize({
          openai,
          prompt,
          model,
        });
        console.log(`assistantId: ${assistantId}, threadId: ${threadId}`);
        return { assistantId, threadId };
      }
      if (method === ChatBotApiMethods.ASK) {
        if (!openai) {
          openai = createOpenaiClient({ apiKey });
        }
        await chatBotApi.ask({ openai, assistantId, threadId, question: question });
      }
    },
  );
};

export { registerChatBotApiListener };
