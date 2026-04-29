import { defineStore } from 'pinia';
import { ulid } from 'ulidx';
import { lang } from '../lang';
import { CustomError, ErrorCodes, pureObject } from '../common';
import { useTabStore } from './tabStore';
import {
  chatBotApi,
  ChatMessage,
  ChatMessageRole,
  ChatMessageStatus,
  ProviderEnum,
  storeApi,
} from '../datasources';
import { AiConfig } from './appStore.ts';
import { ElasticsearchConnection } from './connectionStore.ts';

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

      const tabStore = useTabStore();
      const { activeConnection } = tabStore;

      const index = (activeConnection as ElasticsearchConnection)?.activeIndex;

      const question = index
        ? `${lang.global.t('setting.ai.defaultPrompt')}
          database context:
            - database: ElasticSearch
            - indexName: ${index.index}, 
            - indexMapping: ${index.mapping}
          user's question: ${content} `
        : `${lang.global.t('setting.ai.defaultPrompt')}
        database context:
            - database: ElasticSearch
        user's question: ${content}`;

      try {
        const { model, provider } = await getOpenAiConfig();
        const history = messages.filter(({ status }) =>
          [ChatMessageStatus.RECEIVED, ChatMessageStatus.SENT].includes(status),
        );
        await chatBotApi.chatStream({ provider, model, question, history }, event => {
          const receivedStr = event.content.map(({ text }) => text.value).join('');
          if (event.state === 'CREATED') {
            this.activeChat!.messages[this.activeChat!.messages.length - 1].status =
              ChatMessageStatus.SENT;
            this.activeChat!.messages.push({
              id: ulid(),
              status: ChatMessageStatus.RECEIVED,
              role: ChatMessageRole.BOT,
              content: receivedStr,
            });
          } else if (event.state === 'IN_PROGRESS') {
            this.activeChat!.messages[this.activeChat!.messages.length - 1].content += receivedStr;
          } else if (event.state === 'COMPLETED') {
            storeApi.set(
              'chatStore',
              pureObject({ activeChat: this.activeChat, chats: this.chats }),
            );
          }
        });
      } catch (err) {
        requestMsg.status = ChatMessageStatus.FAILED;
        await storeApi.set(
          'chatStore',
          pureObject({ activeChat: this.activeChat, chats: this.chats }),
        );
        throw new CustomError(ErrorCodes.OPENAI_CLIENT_ERROR, (err as Error).message);
      }
    },

    async deleteChat() {
      if (!this.activeChat) {
        return;
      }

      const chatIndex = this.chats.findIndex(chat => chat.id === this.activeChat!.id);
      if (chatIndex !== -1) {
        this.chats.splice(chatIndex, 1);
        this.activeChat = undefined;
        await storeApi.set('chatStore', pureObject({ activeChat: undefined, chats: this.chats }));
      }
    },
  },
});
