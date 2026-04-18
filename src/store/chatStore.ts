import { defineStore } from 'pinia';
import { ulid } from 'ulidx';
import { lang } from '../lang';
import { CustomError, ErrorCodes, pureObject } from '../common';
import { useAgentContext } from '../composables/useAgentContext';
import {
  ChatMessage,
  ChatMessageRole,
  ChatMessageStatus,
  ProviderEnum,
  storeApi,
} from '../datasources';
import { AiConfig } from './appStore.ts';
import { agentApi } from '../datasources/agentApi';

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
  state: (): { activeChat: Chat | undefined; chats: Array<Chat> } => {
    return {
      chats: [],
      activeChat: undefined,
    };
  },
  actions: {
    async fetchChats() {
      const { provider } = await getOpenAiConfig();

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

      if (this.activeChat.messages.length === 0) {
        this.activeChat.messages[0] = {
          id: ulid(),
          status: ChatMessageStatus.RECEIVED,
          role: ChatMessageRole.BOT,
          content: lang.global.t('setting.ai.firstMsg'),
        };
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

      const agentContext = useAgentContext();
      const question = agentContext.buildPromptWithContext(
        content,
        lang.global.t('setting.ai.defaultPrompt'),
      );

      try {
        const { model, provider, apiKey, httpProxy } = await getOpenAiConfig();
        const history = messages.filter(({ status }) =>
          [ChatMessageStatus.RECEIVED, ChatMessageStatus.SENT].includes(status),
        );

        const openAiMessages = history.map(msg => ({
          role: msg.role === ChatMessageRole.BOT ? 'assistant' : 'user',
          content: msg.content,
        }));
        openAiMessages.push({ role: 'user', content: question });

        const requestId = ulid();
        const unlistenDelta = await agentApi.onAgentDelta(event => {
          if (event.requestId !== requestId) return;
          this.activeChat!.messages[this.activeChat!.messages.length - 1].content += event.content;
        });

        this.activeChat!.messages[this.activeChat!.messages.length - 1].status =
          ChatMessageStatus.SENT;
        this.activeChat!.messages.push({
          id: ulid(),
          status: ChatMessageStatus.SENDING,
          role: ChatMessageRole.BOT,
          content: '',
        });

        try {
          await agentApi.runAgentStep({
            requestId,
            provider,
            model,
            messages: openAiMessages,
            tools: [],
            httpProxy,
            apiKey,
          });
          this.activeChat!.messages[this.activeChat!.messages.length - 1].status =
            ChatMessageStatus.RECEIVED;
        } finally {
          unlistenDelta();
          await storeApi.set(
            'chatStore',
            pureObject({ activeChat: this.activeChat, chats: this.chats }),
          );
        }
      } catch (err) {
        requestMsg.status = ChatMessageStatus.FAILED;
        this.activeChat!.messages[this.activeChat!.messages.length - 1].status =
          ChatMessageStatus.FAILED;
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
