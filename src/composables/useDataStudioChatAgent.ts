import { computed, type Ref, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';
import {
  useDataStudioStore,
  type AgentToolCall,
  type AgentToolCallStatus,
  type AgentSession,
  type AgentMessage,
  type AttachedSource,
  type ConfirmationRule,
  type SessionSource,
} from '@/store/dataStudioStore';
import { useConnectionStore } from '@/store/connectionStore';
import { useChatAgent, type UseChatAgentConfig } from './useChatAgent';
import { buildConnectionConfig } from './connectionConfig';
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
  messages: session.messages.map(adaptDataStudioMessage),
  status: session.status as ChatSessionStatus,
  sources: session.sources,
  maxIterations: session.maxIterations,
});

const getNonDetachedSources = (sources: SessionSource[]): SessionSource[] =>
  sources.filter(source => !source.detached);

const getSourcePermissions = (sources: SessionSource[]) => {
  const activeSources = getNonDetachedSources(sources);
  const [firstSource, ...rest] = activeSources;

  if (!firstSource) {
    return {
      read: true,
      create: false,
      update: false,
      delete: false,
    };
  }

  return rest.reduce(
    (acc, source) => ({
      read: acc.read && source.permissions.read,
      create: acc.create && source.permissions.create,
      update: acc.update && source.permissions.update,
      delete: acc.delete && source.permissions.delete,
    }),
    { ...firstSource.permissions },
  );
};

const resolveDatabaseSource = (
  attachedSources: AttachedSource[],
  sessionSource: SessionSource,
): AttachedSource | undefined =>
  attachedSources.find(source => source.sourceId === sessionSource.sourceId);

export const useDataStudioChatAgent = () => {
  const dataStudioStore = useDataStudioStore();
  const connectionStore = useConnectionStore();
  const {
    attachedSources,
    confirmationRules,
    sessions: rawSessions,
    activeSessionId: rawActiveSessionId,
  } = storeToRefs(dataStudioStore);

  const sessions = computed(() => rawSessions.value.map(adaptDataStudioSession));
  const activeSession = computed(() => {
    const found = rawSessions.value.find(session => session.id === dataStudioStore.activeSessionId);
    return found ? adaptDataStudioSession(found) : undefined;
  });

  const activeSessionSources = computed(() => {
    const session = rawSessions.value.find(entry => entry.id === dataStudioStore.activeSessionId);
    return session ? getNonDetachedSources(session.sources) : [];
  });

  const contextProvider = () => {
    const session = rawSessions.value.find(entry => entry.id === dataStudioStore.activeSessionId);
    const activeSources = session ? getNonDetachedSources(session.sources) : [];

    const connections = activeSources.reduce<Record<string, Record<string, unknown>>>(
      (acc, sessionSource) => {
        const attachedSource = resolveDatabaseSource(attachedSources.value, sessionSource);
        if (!attachedSource || attachedSource.kind !== 'database') {
          return acc;
        }

        const connection = connectionStore.connections.find(
          candidate => Number(candidate.id) === Number(attachedSource.connectionId),
        );

        if (!connection) {
          return acc;
        }

        acc[sessionSource.alias] = buildConnectionConfig(connection);
        return acc;
      },
      {},
    );

    const databaseTypes = activeSources.reduce<Record<string, string>>((acc, sessionSource) => {
      const attachedSource = resolveDatabaseSource(attachedSources.value, sessionSource);
      if (attachedSource?.kind === 'database') {
        acc[sessionSource.alias] = attachedSource.databaseType;
      }
      return acc;
    }, {});

    return { connections, databaseTypes };
  };

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
        durationMs?: number,
      ) =>
        dataStudioStore.updateToolCallStatus(
          sessionId,
          messageId,
          toolCallId,
          status,
          result,
          durationMs,
        ),
      setSessionStatus: (sessionId: string, status: ChatSessionStatus) =>
        dataStudioStore.setSessionStatus(
          sessionId,
          status as 'idle' | 'running' | 'waiting_confirmation' | 'error',
        ),
      setSessionSchema: (_sessionId: string, _schema: string) => undefined,
      clearSession: (sessionId: string) => dataStudioStore.clearSession(sessionId),
      getOrCreateSession: () => dataStudioStore.getOrCreateSession(),
    },
    contextProvider,
    confirmationRules: confirmationRules as Ref<ConfirmationRule[]>,
    addConfirmationRule: rule => dataStudioStore.addConfirmationRule(rule),
    findConfirmationRule: (sessionId: string, toolName: string) =>
      dataStudioStore.findConfirmationRule(sessionId, toolName),
    autoMode: computed(() => {
      const session = rawSessions.value.find(entry => entry.id === dataStudioStore.activeSessionId);
      return session?.permissionsMode === 'Auto';
    }) as Ref<boolean>,
    permissions: computed(() => getSourcePermissions(activeSessionSources.value)) as Ref<{
      read: boolean;
      create: boolean;
      update: boolean;
      delete: boolean;
    }>,
  };

  const agent = useChatAgent(config);

  const messages = computed(() => agent.activeSession.value?.messages ?? []);

  const sendMessage = async (content: string) => {
    await agent.sendMessage({
      content,
      context: contextProvider(),
    });
  };

  return {
    isLoading: agent.isLoading,
    error: agent.error,
    activeSession: agent.activeSession,
    activeSessionSources,
    messages,
    sendMessage,
    handleConfirmation: agent.handleConfirmation,
    cancelSession: agent.cancelSession,
    clearChat: agent.clearChat,
    attachedSources,
    confirmationRules,
  };
};
