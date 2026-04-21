import { ref, computed, onUnmounted } from 'vue';
import { ulid } from 'ulidx';
import { useDataStudioStore, type AgentToolCall, type RiskLevel } from '../store/dataStudioStore';
import {
  useConnectionStore,
  DatabaseType,
  type Connection,
  type ElasticsearchConnection,
  type DynamoDBConnection,
} from '../store/connectionStore';
import { getFeatureModelConfig } from '../store/chatStore';
import { ProviderEnum } from '../datasources';
import {
  agentApi,
  type ToolDefinition,
  type ToolMetadata,
  runAgentLoop as invokeAgentLoop,
  cancelAgentLoop as invokeCancelAgentLoop,
  confirmToolCall as invokeConfirmToolCall,
  onAgentLoopDelta,
  onAgentLoopToolCall,
  onAgentLoopToolResult,
  onAgentLoopStepDone,
  onAgentLoopDone,
  onAgentLoopError,
  onAgentLoopSummaryInjected,
} from '../datasources/agentApi';

const buildConnectionConfig = (connection: Connection): Record<string, unknown> => {
  if (connection.type === DatabaseType.ELASTICSEARCH) {
    const es = connection as ElasticsearchConnection;
    return {
      host: es.host,
      port: es.port,
      authType: es.authType,
      username: es.username,
      password: es.password,
      apiKey: es.apiKey,
      sslCertVerification: es.sslCertVerification,
    };
  }
  const dynamo = connection as DynamoDBConnection;
  return {
    region: dynamo.region,
    accessKeyId: dynamo.accessKeyId,
    secretAccessKey: dynamo.secretAccessKey,
    endpointUrl: dynamo.endpointUrl,
    tableName: dynamo.tableName,
  };
};

const buildSystemPrompt = (schema?: string, noConnection?: boolean): string => {
  const base = noConnection
    ? [
        'You are a helpful AI assistant embedded in DocKit, a desktop database client.',
        'You help users with database-related questions, query writing, data analysis, and general programming topics.',
        '',
        'Rules:',
        '- Be helpful and concise.',
        '- If the user asks about specific data in a database, remind them to connect a data source first.',
      ].join('\n')
    : [
        'You are a Data Studio agent embedded in DocKit, a desktop database client.',
        'You help users query, analyze, and manage their database data through natural language.',
        '',
        'Rules:',
        '- Always use the available tools to interact with the database.',
        '- Never fabricate data — only return actual query results.',
        '- Explain your reasoning before executing queries.',
        '- For destructive operations, clearly explain what will be affected.',
        '- If a query might return large results, add appropriate limits.',
      ].join('\n');

  return schema ? `${base}\n\nDatabase Schema:\n${schema}` : base;
};

export const useDataStudioAgent = () => {
  const dataStudioStore = useDataStudioStore();
  const connectionStore = useConnectionStore();
  const sessionRuntime = new Map<
    string,
    {
      tools?: Array<ToolDefinition>;
      metadata?: Record<string, ToolMetadata>;
      config?: Record<string, unknown>;
      unlistenDelta?: () => void;
    }
  >();

  const unlisteners: Array<() => void> = [];

  const isLoading = ref(false);
  const error = ref<string | undefined>();

  const activeSession = computed(() => dataStudioStore.activeSession);

  const pendingToolCalls = computed(() => {
    const session = activeSession.value;
    if (!session || session.status !== 'waiting_confirmation') return [];

    return session.messages
      .filter(m => m.role === 'assistant' && m.toolCalls?.some(tc => tc.status === 'pending'))
      .flatMap(m =>
        (m.toolCalls ?? [])
          .filter(tc => tc.status === 'pending')
          .map(tc => ({ ...tc, messageId: m.id })),
      );
  });

  const getRuntime = (sessionId: string) => {
    if (!sessionRuntime.has(sessionId)) {
      sessionRuntime.set(sessionId, {});
    }
    return sessionRuntime.get(sessionId)!;
  };

  const shouldRequireConfirmation = (
    toolName: string,
    riskLevel: RiskLevel,
    connectionId: number,
    autoMode: boolean,
  ): boolean => {
    const rule = dataStudioStore.findConfirmationRule(connectionId, toolName);
    if (rule?.action === 'allow_always') return false;
    if (rule?.action === 'deny_always') return false;

    if (!autoMode) return true;

    if (riskLevel === 'safe') return false;
    return true;
  };

  const isDeniedByRule = (toolName: string, connectionId: number): boolean => {
    const rule = dataStudioStore.findConfirmationRule(connectionId, toolName);
    return rule?.action === 'deny_always';
  };

  const setupEventListeners = () => {
    onAgentLoopDelta(({ session_id, content }) => {
      const session = dataStudioStore.sessions.find(s => s.id === session_id);
      if (!session) return;
      const streamingMsg = [...session.messages]
        .reverse()
        .find((m): m is typeof m => m.role === 'assistant' && m.status === 'streaming');
      if (streamingMsg) {
        dataStudioStore.updateStreamingContent(session_id, streamingMsg.id, content);
      }
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopToolCall(({ session_id, tool_call_id, tool_name, arguments: args }) => {
      const session = dataStudioStore.sessions.find(s => s.id === session_id);
      if (!session) return;
      const runtime = getRuntime(session_id);

      const source = dataStudioStore.connectedSources.find(
        s => s.connectionId === session.connectionId,
      );
      const riskLevel = (runtime.metadata?.[tool_name]?.riskLevel as RiskLevel | undefined) ?? 'elevated';
      const needsConfirmation = shouldRequireConfirmation(
        tool_name,
        riskLevel,
        session.connectionId,
        source?.autoMode ?? false,
      );
      const denied = isDeniedByRule(tool_name, session.connectionId);

      const toolCall: AgentToolCall = {
        id: tool_call_id,
        toolName: tool_name,
        args: (args ?? {}) as Record<string, unknown>,
        status: denied ? 'denied' : needsConfirmation ? 'pending' : 'executing',
        riskLevel,
        requiresConfirmation: needsConfirmation,
      };

      let assistantMsgId: string;
      const lastAssistant = [...session.messages].reverse().find(m => m.role === 'assistant');
      if (lastAssistant) {
        assistantMsgId = lastAssistant.id;
        const existing = lastAssistant.toolCalls ?? [];
        dataStudioStore.setMessageToolCalls(session_id, assistantMsgId, [...existing, toolCall]);
      } else {
        assistantMsgId = ulid();
        dataStudioStore.addMessage(session_id, {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          status: 'done',
          toolCalls: [toolCall],
          timestamp: Date.now(),
        });
      }

      if (denied) {
        invokeConfirmToolCall(tool_call_id, false).catch(() => undefined);
        return;
      }

      if (!needsConfirmation) {
        invokeConfirmToolCall(tool_call_id, true).catch(() => undefined);
      } else {
        dataStudioStore.setSessionStatus(session_id, 'waiting_confirmation');
      }
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopToolResult(({ session_id, tool_call_id, envelope }) => {
      const session = dataStudioStore.sessions.find(s => s.id === session_id);
      if (!session) return;
      const assistantMsg = [...session.messages]
        .reverse()
        .find(m => m.role === 'assistant' && m.toolCalls?.some(tc => tc.id === tool_call_id));
      if (assistantMsg) {
        dataStudioStore.updateToolCallStatus(
          session_id,
          assistantMsg.id,
          tool_call_id,
          'done',
          envelope.summary,
        );
      }
      dataStudioStore.addMessage(session_id, {
        id: ulid(),
        role: 'tool',
        content: envelope.summary,
        status: 'done',
        toolCallId: tool_call_id,
        timestamp: Date.now(),
      });
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopStepDone(({ session_id, message_id }) => {
      const session = dataStudioStore.sessions.find(s => s.id === session_id);
      if (!session) return;
      const msg = session.messages.find(m => m.id === message_id);
      if (msg) {
        dataStudioStore.setMessageStatus(session_id, message_id, 'done');
      } else {
        const streamingMsg = [...session.messages]
          .reverse()
          .find(m => m.role === 'assistant' && m.status === 'streaming');
        if (streamingMsg) {
          dataStudioStore.setMessageStatus(session_id, streamingMsg.id, 'done');
        }
      }
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopDone(({ session_id }) => {
      dataStudioStore.setSessionStatus(session_id, 'idle');
      isLoading.value = false;
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopError(({ session_id, error: errMsg }) => {
      error.value = errMsg;
      dataStudioStore.setSessionStatus(session_id, 'error');
      isLoading.value = false;
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopSummaryInjected(_payload => {}).then(unlisten => unlisteners.push(unlisten));
  };

  setupEventListeners();

  const runAgentLoop = async (sessionId: string) => {
    const session = dataStudioStore.sessions.find(s => s.id === sessionId);
    const runtime = getRuntime(sessionId);
    if (!session) return;

    const noConnection = session.connectionId === -1;

    dataStudioStore.setSessionStatus(sessionId, 'running');
    isLoading.value = true;
    error.value = undefined;

    const assistantMsgId = ulid();
    dataStudioStore.addMessage(sessionId, {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      timestamp: Date.now(),
    });

    const { provider, model } = await getFeatureModelConfig('dataStudio');
    const schema = session.schema;

    const settings: Record<string, unknown> = {
      provider: kindToProviderEnum(provider.kind),
      model: model.label,
      apiKey: provider.apiKey ?? '',
      baseUrl: provider.baseUrl,
      httpProxy: provider.proxy || undefined,
      systemPrompt: buildSystemPrompt(schema, noConnection),
      tools: noConnection ? [] : (runtime.tools ?? []),
    };

    if (!noConnection && runtime.config) {
      settings.connectionConfig = runtime.config;
    }

    const lastUserMsg = [...session.messages].reverse().find(m => m.role === 'user');
    const userMessage = lastUserMsg?.content ?? '';

    try {
      await invokeAgentLoop(sessionId, userMessage, settings);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg !== 'cancelled') {
        error.value = errMsg;
        dataStudioStore.setSessionStatus(sessionId, 'error');
      }
      isLoading.value = false;
    }
  };

  const sendMessage = async (content: string, connectionId?: number) => {
    error.value = undefined;

    if (!connectionId) {
      const sessionId = dataStudioStore.getOrCreateSession(-1);
      dataStudioStore.addMessage(sessionId, {
        id: ulid(),
        role: 'user',
        content,
        status: 'done',
        timestamp: Date.now(),
      });
      await runAgentLoop(sessionId);
      return;
    }

    const connection = connectionStore.connections.find(c => c.id === connectionId);
    if (!connection) {
      error.value = 'Connection not found';
      return;
    }

    const source = dataStudioStore.connectedSources.find(s => s.connectionId === connectionId);
    if (!source) {
      error.value = 'Source not connected';
      return;
    }

    const sessionId = dataStudioStore.getOrCreateSession(connectionId);

    dataStudioStore.addMessage(sessionId, {
      id: ulid(),
      role: 'user',
      content,
      status: 'done',
      timestamp: Date.now(),
    });

    const runtime = getRuntime(sessionId);
    runtime.config = buildConnectionConfig(connection);

    const session = dataStudioStore.sessions.find(s => s.id === sessionId);
    if (session && !session.schema) {
      const schema = await agentApi
        .introspectSchema({
          connectionConfig: runtime.config,
          databaseType: connection.type,
        })
        .catch(() => undefined);
      if (schema) {
        dataStudioStore.setSessionSchema(sessionId, schema);
      }
    }

    try {
      const toolsResponse = await agentApi.getAvailableTools({
        databaseType: connection.type,
        read: source.permissions.read,
        create: source.permissions.create,
        update: source.permissions.update,
        delete: source.permissions.delete,
      });
      runtime.tools = toolsResponse.tools;
      runtime.metadata = toolsResponse.metadata;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      return;
    }

    await runAgentLoop(sessionId);
  };

  const confirmToolCall = async (
    assistantMsgId: string,
    toolCallId: string,
    action: 'allow_once' | 'allow_always' | 'deny' | 'deny_always',
  ) => {
    const session = activeSession.value;
    if (!session) return;

    const assistantMsg = session.messages.find(m => m.id === assistantMsgId);
    const toolCall = assistantMsg?.toolCalls?.find(tc => tc.id === toolCallId);
    if (!toolCall) return;

    if (action === 'allow_always') {
      dataStudioStore.addConfirmationRule({
        connectionId: session.connectionId,
        toolName: toolCall.toolName,
        action: 'allow_always',
      });
    }
    if (action === 'deny_always') {
      dataStudioStore.addConfirmationRule({
        connectionId: session.connectionId,
        toolName: toolCall.toolName,
        action: 'deny_always',
      });
    }

    const allowed = action === 'allow_once' || action === 'allow_always';
    await invokeConfirmToolCall(toolCallId, allowed);

    if (allowed) {
      dataStudioStore.updateToolCallStatus(session.id, assistantMsgId, toolCallId, 'executing');
    } else {
      dataStudioStore.updateToolCallStatus(session.id, assistantMsgId, toolCallId, 'denied');
      dataStudioStore.addMessage(session.id, {
        id: ulid(),
        role: 'tool',
        content: 'Tool execution denied by user.',
        status: 'done',
        toolCallId,
        timestamp: Date.now(),
      });
    }

    const allResolved = assistantMsg?.toolCalls?.every(tc => tc.status !== 'pending') ?? true;
    if (allResolved) {
      dataStudioStore.setSessionStatus(session.id, 'running');
      isLoading.value = true;
    }
  };

  const cancelLoop = async () => {
    const session = activeSession.value;
    if (!session) return;
    await invokeCancelAgentLoop(session.id).catch(() => undefined);
    dataStudioStore.setSessionStatus(session.id, 'idle');
    isLoading.value = false;
  };

  const clearChat = () => {
    const session = activeSession.value;
    if (session) {
      dataStudioStore.clearSession(session.id);
      sessionRuntime.delete(session.id);
    }
  };

  onUnmounted(() => {
    unlisteners.forEach(unlisten => unlisten());
    unlisteners.length = 0;
    sessionRuntime.clear();
  });

  return {
    isLoading,
    error,
    activeSession,
    pendingToolCalls,
    sendMessage,
    confirmToolCall,
    cancelLoop,
    clearChat,
  };
};

const kindToProviderEnum = (
  kind: 'openai' | 'deepseek' | 'openrouter' | 'ollama' | 'custom-openai' | 'custom-anthropic',
): ProviderEnum => {
  switch (kind) {
    case 'deepseek':
      return ProviderEnum.DEEP_SEEK;
    case 'openrouter':
      return ProviderEnum.OPENROUTER;
    case 'ollama':
      return ProviderEnum.OLLAMA;
    default:
      return ProviderEnum.OPENAI;
  }
};
