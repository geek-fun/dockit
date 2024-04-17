import { defineStore } from 'pinia';
import { ulid } from 'ulidx';
import { lang } from '../lang';
import { pureObject } from '../common';

enum MessageStatus {
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}
export enum ChatMessageRole {
  USER = 'USER',
  BOT = 'BOT',
}
const { chatBotApi, storeAPI } = window;

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
    openaiConfig: { apiKey: string; model: string; prompt: string };
  } => {
    return {
      chats: [],
      openaiConfig: { apiKey: '', model: '', prompt: '' },
    };
  },
  actions: {
    async sendMessage(content: string) {
      const chat = this.chats[0];

      if (!chat) {
        const { openAi } = await storeAPI.getSecret('aigcConfig', { openAi: undefined });
        console.log('openAi', openAi);
        if (!openAi) {
          throw new Error(lang.global.t('setting.ai.missing'));
        }
        this.openaiConfig = openAi;
        const chats = await storeAPI.get('chats', undefined);
        if (chats) {
          this.chats = chats;
        } else {
          try {
            const { assistantId, threadId } = await chatBotApi.initialize(openAi);
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
        await chatBotApi.ask({
          question: content,
          assistantId,
          threadId,
          apiKey: this.openaiConfig.apiKey,
        });
      } catch (err) {
        messages[messages.length - 1].status = MessageStatus.FAILED;
        await storeAPI.set('chats', pureObject(this.chats));
        throw new Error(err.message);
      }
    },
  },
});
