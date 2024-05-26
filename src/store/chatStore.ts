import { defineStore } from 'pinia';
import { ulid } from 'ulidx';
import { lang } from '../lang';
import { CustomError, pureObject, ErrorCodes } from '../common';
import { useConnectionStore } from './connectionStore';

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
const { chatBotApi, storeAPI } = window;

let receiveRegistration = false;

export const getOpenAiConfig = async () => {
  const { openAi } = await storeAPI.getSecret('aigcConfig', { openAi: null });
  if (!openAi) {
    throw new CustomError(ErrorCodes.MISSING_GPT_CONFIG, lang.global.t('setting.ai.missing'));
  }
  return openAi;
};

export const useChatStore = defineStore('chat', {
  state: (): {
    chats: Array<{
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
    }>;
    insertBoard: string;
  } => {
    return {
      chats: [],
      insertBoard: '',
    };
  },
  actions: {
    async fetchChats() {
      const chats = await storeAPI.get('chats', undefined);
      const { apiKey, httpProxy } = await getOpenAiConfig();
      if (!chats || !chats.length) {
        return;
      }
      const { assistantId } = chats[0];
      const assistant = await chatBotApi.findAssistant({ apiKey, assistantId, httpProxy });
      if (!assistant) {
        this.chats = [];
        await storeAPI.set('chats', []);
        return;
      }
      this.chats = chats ?? [];
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
      if (!receiveRegistration) {
        chatBotApi.onMessageReceived(({ delta, msgEvent }) => {
          if (msgEvent === 'messageCreated') {
            this.chats[0].messages.push({
              id: ulid(),
              status: MessageStatus.RECEIVED,
              role: ChatMessageRole.BOT,
              content: '',
            });
          } else if (msgEvent === 'messageDelta') {
            const messageChunk = delta.content.map(({ text }) => text.value).join('');
            this.chats[0].messages[this.chats[0].messages.length - 1].content += messageChunk;
          } else if (msgEvent === 'messageDone') {
            storeAPI.set('chats', pureObject(this.chats));
          }
        });
        receiveRegistration = true;
      }
      const { apiKey, prompt, model, httpProxy } = await getOpenAiConfig();
      if (!this.chats[0]) {
        const chats = await storeAPI.get('chats', undefined);
        if (chats && chats.length) {
          this.chats = chats;
        } else {
          try {
            const { assistantId, threadId } = await chatBotApi.initialize({
              apiKey,
              model,
              prompt: prompt ?? lang.global.t('setting.ai.defaultPrompt'),
              httpProxy,
            });
            this.chats.push({ id: ulid(), type: 'openai', messages: [], assistantId, threadId });
            await storeAPI.set('chats', pureObject(this.chats));
          } catch (err) {
            throw new Error(err.message);
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
      await storeAPI.set('chats', pureObject(this.chats));
      const connectionStore = useConnectionStore();
      const index = connectionStore.$state.established?.activeIndex;
      const question = index
        ? `user's question: ${content} context: indexName - ${index.index}, indexMapping - ${index.mapping}`
        : `user's question: ${content}`;
      try {
        await chatBotApi.ask({
          question,
          assistantId,
          threadId,
          apiKey,
          httpProxy,
        });
      } catch (err) {
        messages[messages.length - 1].status = MessageStatus.FAILED;
        await storeAPI.set('chats', pureObject(this.chats));
        throw new Error(err.message);
      }
    },
  },
});
