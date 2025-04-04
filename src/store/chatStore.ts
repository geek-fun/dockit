import { defineStore } from 'pinia';
import { ulid } from 'ulidx';
import { lang } from '../lang';
import { CustomError, ErrorCodes, pureObject } from '../common';
import { useConnectionStore } from './connectionStore';
import { chatBotApi, storeApi } from '../datasources';
import { AiConfig, ProviderEnum } from './appStore.ts';
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
  const aigcConfigs = await storeApi.getSecret('aigcConfigs', []);
  const enabledAigc = aigcConfigs.find((config: AiConfig) => config.enabled);

  if (!enabledAigc) {
    throw new CustomError(ErrorCodes.MISSING_GPT_CONFIG, lang.global.t('setting.ai.missing'));
  }
  return enabledAigc;
};

type Chat = {
  id: string;
  provider: ProviderEnum;
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
  state: (): { activeChat: Chat | undefined; chats: Array<Chat>; insertBoard: string } => {
    return {
      chats: [],
      activeChat: undefined,
      insertBoard: '',
    };
  },
  actions: {
    async fetchChats() {
      const { chats, activeChat } = await storeApi.get<{ chats: Chat[]; activeChat: Chat }>(
        'chatStore',
        {} as { chats: Chat[]; activeChat: Chat },
      );

      const { apiKey, httpProxy, model, provider } = await getOpenAiConfig();
      if (!chats?.length) {
        return;
      }
      this.activeChat = activeChat ?? chats.reverse().find(chat => chat.provider === provider);
      this.chats = chats;

      const { assistantId } = this.activeChat;
      try {
        const assistant = await chatBotApi.findAssistant({ apiKey, assistantId, httpProxy, model });
        this.chats = assistant ? chats : [];
        this.activeChat = assistant ? this.activeChat : undefined;
        await storeApi.set(
          'chatStore',
          pureObject({ activeChat: this.activeChat, chats: this.chats }),
        );
      } catch (err) {
        if ((err as ApiClientError).status === 404) {
          this.chats = [];
          this.activeChat = undefined;
          await storeApi.set(
            'chatStore',
            pureObject({ activeChat: this.activeChat, chats: this.chats }),
          );
        } else {
          throw err;
        }
      }
    },

    async modifyAssistant() {
      const { assistantId } = this.activeChat ?? {};
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
      const { apiKey, prompt, model, httpProxy, provider } = await getOpenAiConfig();
      let activeChat =
        this.activeChat ?? this.chats.reverse().find(chat => chat.provider === provider);

      if (!activeChat) {
        try {
          const { assistantId, threadId } = await chatBotApi.createAssistant({
            apiKey,
            model,
            prompt: prompt ?? lang.global.t('setting.ai.defaultPrompt'),
            httpProxy,
          });
          activeChat = {
            id: ulid(),
            provider: provider,
            messages: [],
            assistantId,
            threadId,
          };
          this.activeChat = activeChat;
          this.chats.push(this.activeChat);
          await storeApi.set(
            'chatStore',
            pureObject({ activeChat: this.activeChat, chats: this.chats }),
          );
        } catch (err) {
          throw new Error((err as Error).message);
        }
      }
      const { messages, assistantId, threadId } = activeChat;
      messages.push({
        id: ulid(),
        status: MessageStatus.SENT,
        role: ChatMessageRole.USER,
        content,
      });
      await storeApi.set(
        'chatStore',
        pureObject({ activeChat: this.activeChat, chats: this.chats }),
      );

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
            if (event.state.toUpperCase() === 'CREATED') {
              activeChat.messages.push({
                id: ulid(),
                status: MessageStatus.RECEIVED,
                role: ChatMessageRole.BOT,
                content: '',
              });
            } else if (event.state.toUpperCase() === 'IN_PROGRESS') {
              const messageChunk = event.content.map(({ text }) => text.value).join('');
              activeChat.messages[activeChat.messages.length - 1].content += messageChunk;
            } else if (event.state.toUpperCase() === 'COMPLETED') {
              storeApi.set('chats', pureObject(this.chats));
              storeApi.set(
                'chatStore',
                pureObject({ activeChat: this.activeChat, chats: this.chats }),
              );
            }
          },
        );
      } catch (err) {
        messages[messages.length - 1].status = MessageStatus.FAILED;
        await storeApi.set(
          'chatStore',
          pureObject({ activeChat: this.activeChat, chats: this.chats }),
        );
        throw new Error((err as Error).message);
      }
    },
  },
});
