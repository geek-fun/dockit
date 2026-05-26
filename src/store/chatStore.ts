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
import { useAppStore, type ProviderConfig, type ModelRef } from './appStore.ts';
import { agentApi } from '../datasources/agentApi';

export const getFeatureModelConfig = async (feature: 'sidebarAssistant' | 'dataStudio') => {
  const appStore = useAppStore();
  await appStore.fetchLlmSettings();
  const resolved = appStore.getResolvedFeatureModel(feature);

  if (!resolved) {
    throw new CustomError(ErrorCodes.MISSING_GPT_CONFIG, lang.global.t('setting.ai.missing'));
  }

  return resolved as { provider: ProviderConfig; model: ModelRef };
};

type Chat = {
  id: string;
  provider: ProviderEnum;
  messages: Array<ChatMessage>;
};

export const useChatStore = defineStore('chat', {
  state: (): {
    activeChat: Chat | undefined;
    chats: Array<Chat>;
    pendingChatIds: Set<string>;
  } => {
    return {
      chats: [],
      activeChat: undefined,
      pendingChatIds: new Set(),
    };
  },
  actions: {
    async fetchChats() {
      const {
        provider: { kind },
      } = await getFeatureModelConfig('sidebarAssistant');
      const provider = kindToProviderEnum(kind);

      const { chats = [], activeChat } = await storeApi.get<{ chats: Chat[]; activeChat: Chat }>(
        'chatStore',
        {} as { chats: Chat[]; activeChat: Chat },
      );

      this.chats = chats;
      const storedActiveMatches =
        activeChat && activeChat.provider === provider ? activeChat : undefined;
      this.activeChat =
        storedActiveMatches ??
        [...this.chats].reverse().find((chat: Chat) => chat.provider === provider);

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

      const chatId = this.activeChat.id;
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

      const assistantMsgId = ulid();
      const findChat = () => this.chats.find(chat => chat.id === chatId);
      const findMessage = (msgId: string) => findChat()?.messages.find(m => m.id === msgId);

      this.pendingChatIds.add(chatId);
      try {
        const { provider, model } = await getFeatureModelConfig('sidebarAssistant');
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
          const assistantMsg = findMessage(assistantMsgId);
          if (assistantMsg) {
            assistantMsg.content += event.content;
          }
        });

        const userMsg = findMessage(requestMsg.id);
        if (userMsg) userMsg.status = ChatMessageStatus.SENT;

        const targetChat = findChat();
        if (targetChat) {
          targetChat.messages.push({
            id: assistantMsgId,
            status: ChatMessageStatus.SENDING,
            role: ChatMessageRole.BOT,
            content: '',
          });
        }

        try {
          await agentApi.runAgentStep({
            requestId,
            provider: provider.apiCompatibility,
            model: model.label,
            messages: openAiMessages,
            tools: [],
            httpProxy: provider.proxy || undefined,
            apiKey: provider.apiKey ?? '',
            baseUrl: provider.baseUrl,
          });
          const assistantMsg = findMessage(assistantMsgId);
          if (assistantMsg) assistantMsg.status = ChatMessageStatus.RECEIVED;
        } finally {
          unlistenDelta();
          await storeApi.set(
            'chatStore',
            pureObject({ activeChat: this.activeChat, chats: this.chats }),
          );
        }
      } catch (err) {
        const userMsg = findMessage(requestMsg.id);
        if (userMsg) userMsg.status = ChatMessageStatus.FAILED;
        const assistantMsg = findMessage(assistantMsgId);
        if (assistantMsg) assistantMsg.status = ChatMessageStatus.FAILED;
        await storeApi.set(
          'chatStore',
          pureObject({ activeChat: this.activeChat, chats: this.chats }),
        );
        throw new CustomError(ErrorCodes.OPENAI_CLIENT_ERROR, (err as Error).message);
      } finally {
        this.pendingChatIds.delete(chatId);
      }
    },

    async deleteChat() {
      if (!this.activeChat) {
        return;
      }

      if (this.pendingChatIds.has(this.activeChat.id)) {
        throw new CustomError(
          ErrorCodes.OPENAI_CLIENT_ERROR,
          'Cannot delete chat while a message is in flight',
        );
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

const kindToProviderEnum = (kind: ProviderConfig['kind']): ProviderEnum => {
  switch (kind) {
    case 'deepseek':
      return ProviderEnum.DEEP_SEEK;
    case 'openrouter':
      return ProviderEnum.OPENROUTER;
    case 'ollama':
      return ProviderEnum.OLLAMA;
    case 'lm-studio':
      return ProviderEnum.LM_STUDIO;
    case 'anthropic':
    case 'custom-anthropic':
    case 'gemini':
    case 'grok':
    case 'mistral':
    case 'azure-openai':
    default:
      return ProviderEnum.OPENAI;
  }
};
