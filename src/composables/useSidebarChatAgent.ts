import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';
import {
  useDataStudioStore,
  type AgentToolCall,
  type AgentToolCallStatus,
  type AgentSession,
  type AgentMessage,
} from '@/store/dataStudioStore';
import { useTabStore } from '@/store/tabStore';
import { DatabaseType, type ElasticsearchConnection } from '@/store/connectionStore';
import { useChatAgent, type UseChatAgentConfig } from './useChatAgent';
import type {
  ChatMessage,
  ChatSession,
  ChatSessionStatus,
  ChatMessageStatus,
  ChatContextConfig,
} from '@/types/chat';

const adaptMessage = (msg: AgentMessage): ChatMessage => ({
  id: msg.id,
  role: msg.role as 'user' | 'assistant' | 'tool',
  content: msg.content,
  status: msg.status as ChatMessageStatus,
  timestamp: msg.timestamp,
  thinking: msg.thinking,
  thinkingDuration: msg.thinkingDuration,
  toolCalls: msg.toolCalls,
  toolCallId: msg.toolCallId,
});

const adaptSession = (session: AgentSession): ChatSession => ({
  id: session.id,
  connectionId: session.connectionId,
  messages: session.messages.map(adaptMessage),
  status: session.status as ChatSessionStatus,
  schema: session.schema,
  maxIterations: session.maxIterations,
});

const getSidebarContext = (): ChatContextConfig => {
  const tabStore = useTabStore();
  const activePanel = tabStore.activePanel;
  const activeConnection = activePanel?.connection;
  const context: ChatContextConfig = {};
  if (activeConnection) {
    context.connectionId =
      typeof activeConnection.id === 'number' ? activeConnection.id : undefined;
    context.databaseType = activeConnection.type;
    if (activeConnection.type === DatabaseType.ELASTICSEARCH) {
      const es = activeConnection as ElasticsearchConnection;
      context.activePanel = {
        connectionType: 'Elasticsearch',
        indexName: es.activeIndex?.index,
        editorContent: activePanel.content,
      };
    } else if (activeConnection.type === DatabaseType.DYNAMODB) {
      context.activePanel = {
        connectionType: 'DynamoDB',
        editorContent: activePanel.content,
      };
    }
  } else if (activePanel?.content) {
    context.activePanel = { editorContent: activePanel.content };
  }
  return context;
};

export const useSidebarChatAgent = () => {
  const store = useDataStudioStore();
  const { confirmationRules, sessions: rawSessions, activeSessionId } = storeToRefs(store);

  const sessions = computed(() => rawSessions.value.map(adaptSession));
  const activeSession = computed(() => {
    const found = rawSessions.value.find(s => s.id === store.activeSessionId);
    return found ? adaptSession(found) : undefined;
  });

  const config: UseChatAgentConfig = {
    feature: 'sidebarAssistant',
    sessionStore: {
      sessions: sessions as unknown as Ref<Array<ChatSession>>,
      activeSessionId: activeSessionId as Ref<string | undefined>,
      activeSession: activeSession as ComputedRef<ChatSession | undefined>,
      addMessage: (sessionId: string, message: ChatMessage) =>
        store.addMessage(sessionId, {
          id: message.id,
          role: message.role as 'user' | 'assistant' | 'tool',
          content: message.content,
          status: message.status as 'pending' | 'streaming' | 'done' | 'error',
          timestamp: message.timestamp,
          thinking: message.thinking,
          thinkingDuration: message.thinkingDuration,
          toolCalls: message.toolCalls,
          toolCallId: message.toolCallId,
        }),
      updateStreamingContent: (sessionId, messageId, chunk) =>
        store.updateStreamingContent(sessionId, messageId, chunk),
      updateStreamingThinking: (sessionId, messageId, chunk) =>
        store.updateStreamingThinking(sessionId, messageId, chunk),
      setMessageStatus: (sessionId, messageId, status) =>
        store.setMessageStatus(
          sessionId,
          messageId,
          status as 'pending' | 'streaming' | 'done' | 'error',
        ),
      setMessageToolCalls: (
        sessionId: string,
        messageId: string,
        toolCalls: Array<AgentToolCall>,
      ) => store.setMessageToolCalls(sessionId, messageId, toolCalls),
      updateToolCallStatus: (
        sessionId: string,
        messageId: string,
        toolCallId: string,
        status: AgentToolCallStatus,
        result?: string,
        durationMs?: number,
      ) => store.updateToolCallStatus(sessionId, messageId, toolCallId, status, result, durationMs),
      setSessionStatus: (sessionId, status) =>
        store.setSessionStatus(
          sessionId,
          status as 'idle' | 'running' | 'waiting_confirmation' | 'error',
        ),
      setSessionSchema: (sessionId, schema) => store.setSessionSchema(sessionId, schema),
      clearSession: sessionId => store.clearSession(sessionId),
      getOrCreateSession: (connectionId?: number) => store.getOrCreateSession(connectionId ?? -1),
    },
    contextProvider: getSidebarContext,
    confirmationRules,
    addConfirmationRule: rule => store.addConfirmationRule(rule),
    findConfirmationRule: (connectionId, toolName) =>
      store.findConfirmationRule(connectionId, toolName),
    autoMode: ref(false),
    permissions: ref({ read: true, create: false, update: false, delete: false }),
  };

  const agent = useChatAgent(config);
  const messages = computed(() => agent.activeSession.value?.messages ?? []);

  const sendMessage = async (content: string) => {
    const context = getSidebarContext();
    await agent.sendMessage({ content, connectionId: context.connectionId, context });
  };

  return {
    isLoading: agent.isLoading,
    error: agent.error,
    activeSession: agent.activeSession,
    messages,
    sendMessage,
    handleConfirmation: agent.handleConfirmation,
    clearChat: agent.clearChat,
  };
};
