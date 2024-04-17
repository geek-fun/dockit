import { defineStore } from 'pinia';
import { ulid } from 'ulidx';
import { lang } from '../lang';
import { pureObject } from '../common';

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
      messages: Array<{
        id: string;
        status: MessageStatus;
        content: string;
        role: ChatMessageRole;
      }>;
      assistantId: string;
      threadId: string;
    }>;
  } => {
    return {
      chats: [],
    };
  },
  actions: {
    async fetchChats() {
      const chats = await storeAPI.get('chats', undefined);
      this.chats = chats ?? [];
    },
    async sendMessage(content: string) {
      if (!receiveRegistration) {
        console.log('register onMessageReceived');
        chatBotApi.onMessageReceived(({ delta, msgEvent }) => {
          console.log('onMessageReceived', delta, msgEvent);
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
        if (chats) {
          this.chats = chats;
        } else {
          try {
            const { assistantId, threadId } = await chatBotApi.initialize(await getOpenAiConfig());
            this.chats.push({ id: ulid(), type: 'openai', messages: [], assistantId, threadId });
            await storeAPI.set('chats', pureObject(this.chats));
          } catch (err) {
            console.error(err);
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
      try {
        const openaiConfig = await getOpenAiConfig();
        await chatBotApi.ask({
          question: content,
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
