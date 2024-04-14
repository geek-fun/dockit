import { defineStore } from 'pinia';
import { ulid } from 'ulidx';

enum MessageStatus {
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}
export enum ChatMessageRole {
  USER = 'USER',
  BOT = 'BOT',
}
export const useChatStore = defineStore('chat', {
  state: (): {
    messages: Array<{ id: string; status: MessageStatus; content: string; role: ChatMessageRole }>;
  } => {
    return {
      messages: [],
    };
  },
  actions: {
    async sendMessage(content: string) {
      const id = ulid();
      this.messages.push({
        id,
        status: MessageStatus.SENT,
        role: ChatMessageRole.USER,
        content,
      });
    },
  },
});
