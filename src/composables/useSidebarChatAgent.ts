import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';
import {
  useDataStudioStore,
  type AgentToolCall,
  type AgentToolCallStatus,
  type AgentSession,
  type AgentMessage,
  type ConfirmationRule,
} from '@/store/dataStudioStore';
import { useTabStore } from '@/store/tabStore';
import { DatabaseType, type ElasticsearchConnection } from '@/store/connectionStore';
import { useChatAgent, type UseChatAgentConfig } from './useChatAgent';
import { buildConnectionConfig } from './connectionConfig';
import { clearSessionRuntime } from './agentRuntime';
import type {
  ChatMessage,
  ChatSession,
  ChatSessionStatus,
  ChatMessageStatus,
  ChatMessageRole,
  ChatContextConfig,
} from '@/types/chat';

const adaptMessage = (msg: AgentMessage): ChatMessage => ({
  id: msg.id,
  role: msg.role as ChatMessageRole,
  content: msg.content,
  status: msg.status as ChatMessageStatus,
  timestamp: msg.timestamp,
  thinking: msg.thinking,
  thinkingDuration: msg.thinkingDuration,
  toolCalls: msg.toolCalls,
  toolCallId: msg.toolCallId,
  compaction: msg.compaction,
  compactionInProgress: msg.compactionInProgress,
  preparingInProgress: msg.preparingInProgress,
});

const adaptSession = (session: AgentSession): ChatSession => ({
  id: session.id,
  messages: session.messages.map(adaptMessage),
  status: session.status as ChatSessionStatus,
  sources: session.sources,
  maxIterations: session.maxIterations,
  stopReason: session.stopReason,
  stopMessage: session.stopMessage,
});

const getSidebarContext = (): ChatContextConfig => {
  const tabStore = useTabStore();
  const activePanel = tabStore.activePanel;
  const activeConnection = activePanel?.connection;
  const context: ChatContextConfig = {};

  if (activeConnection) {
    context.databaseType = activeConnection.type;
    context.connections = {
      default: {
        ...buildConnectionConfig(activeConnection),
        dbType: activeConnection.type,
        permissions: { read: true, create: false, update: false, delete: false },
      },
    };

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
    const sid = store.sidebarSessionId;
    if (!sid) return undefined;
    const found = rawSessions.value.find(session => session.id === sid);
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
          role: message.role as 'user' | 'assistant' | 'tool' | 'system',
          content: message.content,
          status: message.status as 'pending' | 'streaming' | 'done' | 'error',
          timestamp: message.timestamp,
          thinking: message.thinking,
          thinkingDuration: message.thinkingDuration,
          toolCalls: message.toolCalls,
          toolCallId: message.toolCallId,
          compaction: message.compaction,
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
      removeOrphanedStreamingMessages: (sessionId: string, finalizedMessageId: string) =>
        store.removeOrphanedStreamingMessages(sessionId, finalizedMessageId),
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
          status as 'idle' | 'running' | 'waiting_confirmation' | 'error' | 'stopped',
        ),
      setSessionStopped: (sessionId, reason, message) =>
        store.setSessionStopped(sessionId, reason, message),
      clearSessionStop: (sessionId: string) => store.clearSessionStop(sessionId),
      setSessionSchema: (_sessionId, _schema) => undefined,
      clearSession: sessionId => store.clearSession(sessionId),
      getOrCreateSession: () => store.getOrCreateSidebarSession(),
      reloadSessionMessages: (sessionId: string) => store.reloadSessionMessages(sessionId),
    },
    contextProvider: getSidebarContext,
    confirmationRules: confirmationRules as Ref<ConfirmationRule[]>,
    addConfirmationRule: rule => store.addConfirmationRule(rule),
    findConfirmationRule: (sessionId, toolName) => store.findConfirmationRule(sessionId, toolName),
    autoMode: ref(false),
  };

  const agent = useChatAgent(config);
  const messages = computed(() => agent.activeSession.value?.messages ?? []);

  const sendMessage = async (content: string) => {
    const context = getSidebarContext();
    await agent.sendMessage({ content, context });
  };

  const startNewSession = () => {
    const oldSessionId = store.sidebarSessionId;
    if (oldSessionId) {
      clearSessionRuntime(oldSessionId);
    }
    store.sidebarSessionId = undefined;
  };

  return {
    isLoading: agent.isLoading,
    error: agent.error,
    activeSession: agent.activeSession,
    lastSettings: agent.lastSettings,
    initContextSettings: agent.initContextSettings,
    messages,
    sendMessage,
    cancelSession: agent.cancelSession,
    handleConfirmation: agent.handleConfirmation,
    clearChat: agent.clearChat,
    startNewSession,
  };
};
