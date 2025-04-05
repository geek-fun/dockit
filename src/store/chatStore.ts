import { defineStore } from 'pinia';
import { ulid } from 'ulidx';
import { lang } from '../lang';
import { CustomError, ErrorCodes, pureObject } from '../common';
import { useConnectionStore } from './connectionStore';
import {
  chatBotApi,
  ChatMessage,
  ChatMessageRole,
  ChatMessageStatus,
  ProviderEnum,
  storeApi,
} from '../datasources';
import { AiConfig } from './appStore.ts';

export const getOpenAiConfig = async () => {
  const aigcConfigs = await storeApi.getSecret('aiConfigs', []);
  const enabledAigc = aigcConfigs.find((config: AiConfig) => config.enabled);

  if (!enabledAigc) {
    throw new CustomError(ErrorCodes.MISSING_GPT_CONFIG, lang.global.t('setting.ai.missing'));
  }
  return enabledAigc;
};

type Chat = {
  id: string;
  provider: ProviderEnum;
  messages: Array<ChatMessage>;
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
      const { apiKey, httpProxy, model, provider } = await getOpenAiConfig();

      const { chats = [], activeChat } = await storeApi.get<{ chats: Chat[]; activeChat: Chat }>(
        'chatStore',
        {} as { chats: Chat[]; activeChat: Chat },
      );

      this.chats = chats;
      this.activeChat = activeChat ?? this.chats.reverse().find(chat => chat.provider === provider);

      if (!this.activeChat) {
        this.activeChat = {
          id: ulid(),
          provider: provider,
          messages: [],
        };
        this.chats.push(this.activeChat);
      }

      try {
        await chatBotApi.createClient({ provider, apiKey, model, httpProxy });
        this.activeChat.messages[0] = {
          id: ulid(),
          status: ChatMessageStatus.SENDING,
          role: ChatMessageRole.BOT,
          content: lang.global.t('setting.ai.firstMsg'),
        };
      } catch (err) {
        throw new CustomError(ErrorCodes.OPENAI_CLIENT_ERROR, (err as Error).message);
      }

      await storeApi.set(
        'chatStore',
        pureObject({ activeChat: this.activeChat, chats: this.chats }),
      );
    },

    async sendMessage(content: string) {
      if (!this.activeChat) {
        throw new CustomError(ErrorCodes.MISSING_GPT_CONFIG, lang.global.t('setting.ai.missing'));
      }

      const { messages } = this.activeChat;
      const requestMsg = {
        id: ulid(),
        status: ChatMessageStatus.SENDING,
        role: ChatMessageRole.USER,
        content,
      };
      messages.push(requestMsg);
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
        const { model, provider } = await getOpenAiConfig();
        const history = messages.filter(({ status }) =>
          [ChatMessageStatus.RECEIVED, ChatMessageStatus.SENT].includes(status),
        );
        let receivedMsg = {
          id: ulid(),
          status: ChatMessageStatus.RECEIVED,
          role: ChatMessageRole.BOT,
          content: '',
        };

        await chatBotApi.chatStream({ provider, model, question, history }, event => {
          console.log('event:', event);
          const receivedStr = event.content.map(({ text }) => text.value).join('');

          if (event.state === 'CREATED') {
            requestMsg.status = ChatMessageStatus.SENT;
            receivedMsg.content = receivedStr;
            this.activeChat!.messages.push(receivedMsg);
          } else if (event.state === 'IN_PROGRESS') {
            receivedMsg.content += receivedStr;
          } else if (event.state === 'COMPLETED') {
            storeApi.set(
              'chatStore',
              pureObject({ activeChat: this.activeChat, chats: this.chats }),
            );
          }
        });
      } catch (err) {
        console.log('sendMessage error:', err);
        requestMsg.status = ChatMessageStatus.FAILED;
        await storeApi.set(
          'chatStore',
          pureObject({ activeChat: this.activeChat, chats: this.chats }),
        );
        throw new CustomError(ErrorCodes.OPENAI_CLIENT_ERROR, (err as Error).message);
      }
    },
  },
});
