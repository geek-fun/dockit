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
    mainWindow,
  }: {
    openai: OpenAI;
    assistantId: string;
    threadId: string;
    question: string;
    mainWindow: Electron.BrowserWindow;
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
      .on('messageDelta', (delta, snapshot) => {
        console.log('messageDelta, delta:', delta, 'snapshot:', snapshot);
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
};

const registerChatBotApiListener = (
  ipcMain: Electron.IpcMain,
  mainWindow: Electron.BrowserWindow,
) => {
  let openai: OpenAI;

  ipcMain.handle(
    'chatBotApi',
    async (
      _,
      { method, question, apiKey, prompt, model, assistantId, threadId }: ChatBotApiInput,
    ) => {
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
        await chatBotApi.ask({ openai, assistantId, threadId, question: question, mainWindow });
      }
    },
  );
};

export { registerChatBotApiListener };
