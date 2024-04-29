import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';
import { isEmpty } from 'lodash';

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

const createOpenaiClient = ({ apiKey, httpProxy }: { apiKey: string; httpProxy?: string }) => {
  const proxy = !isEmpty(httpProxy) ? httpProxy : process.env.https_proxy;
  const httpAgent = !isEmpty(proxy) ? new HttpsProxyAgent(proxy) : undefined;
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
    const openai = createOpenaiClient({ apiKey, httpProxy });
    const assistant = await openai.beta.assistants.retrieve(assistantId);
    if (!assistant) {
      throw new Error('Assistant not found');
    }
    await openai.beta.assistants.update(assistantId, {
      name: ASSISTANT_NAME,
      model,
      instructions: prompt,
    });
  },
  findAssistant: async ({
    apiKey,
    assistantId,
    httpProxy,
  }: {
    apiKey: string;
    assistantId: string;
    httpProxy?: string;
  }) => {
    try {
      const openai = createOpenaiClient({ apiKey, httpProxy });
      return await openai.beta.assistants.retrieve(assistantId);
    } catch ({ status, details }) {
      if (status === 404) {
        return undefined;
      } else {
        throw new Error(`Error finding assistant, status: ${status}, details: ${details}`);
      }
    }
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
      {
        method,
        question,
        apiKey,
        prompt,
        model,
        assistantId,
        threadId,
        httpProxy,
      }: ChatBotApiInput,
    ) => {
      if (method === ChatBotApiMethods.INITIALIZE) {
        openai = createOpenaiClient({ apiKey, httpProxy });

        const { assistantId, threadId } = await chatBotApi.initialize({
          openai,
          prompt,
          model,
        });
        return { assistantId, threadId };
      }

      if (method === ChatBotApiMethods.ASK) {
        if (!openai) {
          openai = createOpenaiClient({ apiKey, httpProxy });
        }
        await chatBotApi.ask({ openai, assistantId, threadId, question: question, mainWindow });
      }

      if (method === ChatBotApiMethods.MODIFY_ASSISTANT) {
        await chatBotApi.modifyAssistant({ apiKey, prompt, model, assistantId, httpProxy });
      }

      if (method === ChatBotApiMethods.FIND_ASSISTANT) {
        return await chatBotApi.findAssistant({ apiKey, assistantId, httpProxy });
      }
    },
  );
};

export { registerChatBotApiListener };
