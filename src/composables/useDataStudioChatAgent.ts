import { computed, type Ref, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';
import {
  useDataStudioStore,
  type AgentToolCall,
  type AgentToolCallStatus,
  type AgentSession,
  type AgentMessage,
} from '@/store/dataStudioStore';
import { useConnectionStore } from '@/store/connectionStore';
import { useChatAgent, type UseChatAgentConfig } from './useChatAgent';
import type { ChatMessage, ChatSession, ChatSessionStatus, ChatMessageStatus } from '@/types/chat';

const adaptDataStudioMessage = (msg: AgentMessage): ChatMessage => ({
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

const adaptDataStudioSession = (session: AgentSession): ChatSession => ({
  id: session.id,
  connectionId: session.connectionId,
  messages: session.messages.map(adaptDataStudioMessage),
  status: session.status as ChatSessionStatus,
  schema: session.schema,
  maxIterations: session.maxIterations,
});

export const useDataStudioChatAgent = () => {
  const dataStudioStore = useDataStudioStore();
  const connectionStore = useConnectionStore();
  const {
    connectedSources,
    activeConnectionId,
    confirmationRules,
    sessions: rawSessions,
    activeSessionId: rawActiveSessionId,
  } = storeToRefs(dataStudioStore);

  const sessions = computed(() => rawSessions.value.map(adaptDataStudioSession));
  const activeSession = computed(() => {
    const found = rawSessions.value.find(s => s.id === dataStudioStore.activeSessionId);
    return found ? adaptDataStudioSession(found) : undefined;
  });

  const activeSource = computed(() =>
    activeConnectionId.value !== undefined
      ? (connectedSources.value.find(s => s.connectionId === activeConnectionId.value) ?? null)
      : null,
  );

  const config: UseChatAgentConfig = {
    feature: 'dataStudio',
    sessionStore: {
      sessions: sessions as unknown as Ref<Array<ChatSession>>,
      activeSessionId: rawActiveSessionId,
      activeSession: activeSession as ComputedRef<ChatSession | undefined>,
      addMessage: (sessionId: string, message: ChatMessage) => {
        dataStudioStore.addMessage(sessionId, {
          id: message.id,
          role: message.role as 'user' | 'assistant' | 'tool',
          content: message.content,
          status: message.status as 'pending' | 'streaming' | 'done' | 'error',
          timestamp: message.timestamp,
          thinking: message.thinking,
          thinkingDuration: message.thinkingDuration,
          toolCalls: message.toolCalls,
          toolCallId: message.toolCallId,
        });
      },
      updateStreamingContent: (sessionId: string, messageId: string, chunk: string) =>
        dataStudioStore.updateStreamingContent(sessionId, messageId, chunk),
      updateStreamingThinking: (sessionId: string, messageId: string, chunk: string) =>
        dataStudioStore.updateStreamingThinking(sessionId, messageId, chunk),
      setMessageStatus: (sessionId: string, messageId: string, status: ChatMessageStatus) =>
        dataStudioStore.setMessageStatus(
          sessionId,
          messageId,
          status as 'pending' | 'streaming' | 'done' | 'error',
        ),
      setMessageToolCalls: (
        sessionId: string,
        messageId: string,
        toolCalls: Array<AgentToolCall>,
      ) => dataStudioStore.setMessageToolCalls(sessionId, messageId, toolCalls),
      updateToolCallStatus: (
        sessionId: string,
        messageId: string,
        toolCallId: string,
        status: AgentToolCallStatus,
        result?: string,
      ) => dataStudioStore.updateToolCallStatus(sessionId, messageId, toolCallId, status, result),
      setSessionStatus: (sessionId: string, status: ChatSessionStatus) =>
        dataStudioStore.setSessionStatus(
          sessionId,
          status as 'idle' | 'running' | 'waiting_confirmation' | 'error',
        ),
      setSessionSchema: (sessionId: string, schema: string) =>
        dataStudioStore.setSessionSchema(sessionId, schema),
      clearSession: (sessionId: string) => dataStudioStore.clearSession(sessionId),
      getOrCreateSession: (connectionId: number) =>
        dataStudioStore.getOrCreateSession(connectionId),
    },
    confirmationRules,
    addConfirmationRule: rule => dataStudioStore.addConfirmationRule(rule),
    findConfirmationRule: (connectionId: number, toolName: string) =>
      dataStudioStore.findConfirmationRule(connectionId, toolName),
    autoMode: computed(() => activeSource.value?.autoMode ?? false) as Ref<boolean>,
    permissions: computed(
      () =>
        activeSource.value?.permissions ?? {
          read: true,
          create: false,
          update: false,
          delete: false,
        },
    ) as Ref<{ read: boolean; create: boolean; update: boolean; delete: boolean }>,
  };

  const agent = useChatAgent(config);

  const messages = computed(() => agent.activeSession.value?.messages ?? []);

  const sendMessage = async (content: string) => {
    const connId = activeConnectionId.value ?? undefined;
    const connection =
      connId !== undefined ? connectionStore.connections.find(c => c.id === connId) : undefined;
    await agent.sendMessage({
      content,
      connectionId: connId,
      context: connection
        ? { databaseType: connection.type as 'ELASTICSEARCH' | 'DYNAMODB' }
        : undefined,
    });
  };

  return {
    isLoading: agent.isLoading,
    error: agent.error,
    activeSession: agent.activeSession,
    messages,
    sendMessage,
    handleConfirmation: agent.handleConfirmation,
    clearChat: agent.clearChat,
    connectedSources,
    activeConnectionId,
    activeSource,
    confirmationRules,
  };
};
