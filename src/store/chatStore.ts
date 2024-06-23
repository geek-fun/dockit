import { defineStore } from 'pinia';
import { ulid } from 'ulidx';
import { lang } from '../lang';
import { CustomError, ErrorCodes, pureObject } from '../common';
import { useConnectionStore } from './connectionStore';
import { chatBotApi, storeApi } from '../datasources';
import { OpenAiConfig } from './appStore.ts';
import { ApiClientError } from '../datasources/ApiClients.ts';

enum MessageStatus {
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  RECEIVED = 'RECEIVED',
}

export enum ChatMessageRole {
  USER = 'USER',
  BOT = 'BOT',
}

export const getOpenAiConfig = async () => {
  const { openAi } = await storeApi.getSecret<{ openAi: OpenAiConfig }>('aigcConfig', {
    openAi: null as unknown as OpenAiConfig,
  });
  if (!openAi) {
    throw new CustomError(ErrorCodes.MISSING_GPT_CONFIG, lang.global.t('setting.ai.missing'));
  }
  return openAi;
};
type Chat = {
  id: string;
  type: string;
  assistantId: string;
  threadId: string;
  messages: Array<{
    id: string;
    status: MessageStatus;
    content: string;
    role: ChatMessageRole;
  }>;
};
export const useChatStore = defineStore('chat', {
  state: (): { chats: Array<Chat>; insertBoard: string } => {
    return {
      chats: [],
      insertBoard: '',
    };
  },
  actions: {
    async fetchChats() {
      const chats = await storeApi.get<Array<Chat>>('chats', []);
      const { apiKey, httpProxy, model } = await getOpenAiConfig();
      if (!chats || !chats.length) {
        return;
      }
      const { assistantId } = chats[0];
      try {
        const assistant = await chatBotApi.findAssistant({ apiKey, assistantId, httpProxy, model });
        this.chats = assistant ? chats : [];
        await storeApi.set('chats', pureObject(this.chats));
      } catch (err) {
        if ((err as ApiClientError).status === 404) {
          this.chats = [];
          await storeApi.set('chats', pureObject(this.chats));
        } else {
          throw err;
        }
      }
    },
    async modifyAssistant() {
      const { assistantId } = this.chats[0] || {};
      if (!assistantId) {
        return;
      }
      const { apiKey, prompt, model, httpProxy } = await getOpenAiConfig();
      await chatBotApi.modifyAssistant({
        apiKey,
        prompt: prompt ?? lang.global.t('setting.ai.defaultPrompt'),
        model,
        assistantId,
        httpProxy,
      });
    },

    async sendMessage(content: string) {
      // if (!receiveRegistration) {
      //
      //   chatBotApi.onMessageReceived(({z delta, msgEvent }) => {
      //     if (msgEvent === 'messageCreated') {
      //       this.chats[0].messages.push({
      //         id: ulid(),
      //         status: MessageStatus.RECEIVED,
      //         role: ChatMessageRole.BOT,
      //         content: '',
      //       });
      //     } else if (msgEvent === 'messageDelta') {
      //       const messageChunk = delta.content.map(({ text }) => text.value).join('');
      //       this.chats[0].messages[this.chats[0].messages.length - 1].content += messageChunk;
      //     } else if (msgEvent === 'messageDone') {
      //       storeAPI.set('chats', pureObject(this.chats));
      //     }
      //   });
      //   receiveRegistration = true;
      // }
      const { apiKey, prompt, model, httpProxy } = await getOpenAiConfig();
      if (!this.chats[0]) {
        const chats = await storeApi.get<Chat[] | undefined>('chats', undefined);
        if (chats && chats.length) {
          this.chats = chats;
        } else {
          try {
            const { assistantId, threadId } = await chatBotApi.createAssistant({
              apiKey,
              model,
              prompt: prompt ?? lang.global.t('setting.ai.defaultPrompt'),
              httpProxy,
            });
            this.chats.push({ id: ulid(), type: 'openai', messages: [], assistantId, threadId });
            await storeApi.set('chats', pureObject(this.chats));
          } catch (err) {
            console.log('createAssistant error', err);
            throw new Error((err as Error).message);
          }
        }
      }
      const { messages, assistantId, threadId } = this.chats[0];
      messages.push({
        id: ulid(),
        status: MessageStatus.SENT,
        role: ChatMessageRole.USER,
        content,
      });
      await storeApi.set('chats', pureObject(this.chats));
      const connectionStore = useConnectionStore();
      const index = connectionStore.$state.established?.activeIndex;
      const question = index
        ? `user's question: ${content} context: indexName - ${index.index}, indexMapping - ${index.mapping}`
        : `user's question: ${content}`;
      try {
        await chatBotApi.chatAssistant(
          {
            assistantId,
            threadId,
            question,
          },
          event => {
            console.log('chatStore received event:', typeof event);

            if (event.state.toUpperCase() === 'CREATED') {
              this.chats[0].messages.push({
                id: ulid(),
                status: MessageStatus.RECEIVED,
                role: ChatMessageRole.BOT,
                content: '',
              });
            } else if (event.state.toUpperCase() === 'IN_PROGRESS') {
              const messageChunk = event.content.map(({ text }) => text.value).join('');
              this.chats[0].messages[this.chats[0].messages.length - 1].content += messageChunk;
            } else if (event.state.toUpperCase() === 'COMPLETED') {
              storeApi.set('chats', pureObject(this.chats));
            }
          },
        );
      } catch (err) {
        console.log('chatAssistant error', err);
        messages[messages.length - 1].status = MessageStatus.FAILED;
        await storeApi.set('chats', pureObject(this.chats));
        throw new Error((err as Error).message);
      }
    },
  },
});
