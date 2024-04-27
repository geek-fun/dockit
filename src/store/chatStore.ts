import { defineStore } from 'pinia';
import { ulid } from 'ulidx';
import { lang } from '../lang';
import { pureObject } from '../common';
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

const getOpenAiConfig = async () => {
  const { openAi } = await storeAPI.getSecret('aigcConfig', { openAi: undefined });
  if (!openAi) {
    throw new Error(lang.global.t('setting.ai.missing'));
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
      console.log('chats', JSON.stringify({ chats }));
      if (!chats || !chats.length) {
        return;
      }
      const { assistantId } = chats[0];
      const { apiKey } = await getOpenAiConfig();
      const assistant = await chatBotApi.findAssistant({ apiKey, assistantId });
      console.log('assistant', JSON.stringify({ assistant }));
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
      const { apiKey, prompt, model } = await getOpenAiConfig();
      await chatBotApi.modifyAssistant({
        apiKey,
        prompt: prompt ?? lang.global.t('setting.ai.defaultPrompt'),
        model,
        assistantId,
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

      if (!this.chats[0]) {
        const chats = await storeAPI.get('chats', undefined);
        if (chats && chats.length) {
          this.chats = chats;
        } else {
          try {
            const { apiKey, prompt, model } = await getOpenAiConfig();
            const { assistantId, threadId } = await chatBotApi.initialize({
              apiKey,
              model,
              prompt: prompt ?? lang.global.t('setting.ai.defaultPrompt'),
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
        const openaiConfig = await getOpenAiConfig();

        await chatBotApi.ask({
          question,
          assistantId,
          threadId,
          apiKey: openaiConfig.apiKey,
        });
      } catch (err) {
        messages[messages.length - 1].status = MessageStatus.FAILED;
        await storeAPI.set('chats', pureObject(this.chats));
        throw new Error(err.message);
      }
    },
  },
});
