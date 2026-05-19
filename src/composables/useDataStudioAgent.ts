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
  onAgentLoopThinkingDelta,
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
      sslCertVerification: es.sslCertVerification ?? false,
      authType: es.authType ?? 'basic',
      username: es.username ?? '',
      password: es.password ?? '',
      apiKey: es.apiKey ?? '',
    };
  }
  const dynamo = connection as DynamoDBConnection;
  const config: Record<string, unknown> = {
    region: dynamo.region,
    authKind: dynamo.auth.kind,
  };
  if (dynamo.auth.kind === 'accessKey') {
    config.accessKeyId = dynamo.auth.accessKeyId;
    config.secretAccessKey = dynamo.auth.secretAccessKey;
  } else if (dynamo.auth.kind === 'sso' || dynamo.auth.kind === 'assumeRole') {
    config.accessKeyId = dynamo.auth.accessKeyId;
    config.secretAccessKey = dynamo.auth.secretAccessKey;
    config.sessionToken = dynamo.auth.sessionToken;
  } else if (dynamo.auth.kind === 'profile') {
    config.profileName = dynamo.auth.profileName;
  }
  if (dynamo.endpointUrl) config.endpointUrl = dynamo.endpointUrl;
  return config;
};

const buildDynamoDBKnowledge = (): string =>
  [
    '',
    'DynamoDB knowledge:',
    '- DynamoDB supports TWO query interfaces:',
    '  1. SDK operations (GetItem, PutItem, UpdateItem, DeleteItem, Query, Scan, etc.)',
    '  2. PartiQL — a SQL-compatible query language (SELECT, INSERT, UPDATE, DELETE)',
    '- NEVER say DynamoDB does not support SQL — it supports PartiQL.',
    '- UpdateItem uses UpdateExpression, e.g.: UpdateExpression="SET #attr = :val"',
    '- Always use ExpressionAttributeNames for reserved words (status, order, name, date, etc.)',
    '- PartiQL update example: UPDATE "TableName" SET attribute = :val WHERE pk = :pk',
    '- PartiQL select example: SELECT * FROM "TableName" WHERE pk = :pk',
  ].join('\n');

const buildElasticsearchKnowledge = (): string =>
  [
    '',
    'Elasticsearch/OpenSearch knowledge:',
    '- Uses a REST API with JSON request bodies (Query DSL).',
    '- Main operations: index, search (_search), update (_update), delete, bulk (_bulk).',
    '- Queries use Query DSL: match, term, range, bool (must/should/filter/must_not).',
    '- Aggregations (aggs) are used for analytics, not SQL GROUP BY.',
    '- Use _source to select specific fields; use size/from for pagination.',
  ].join('\n');

const buildDynamoDBRules = (): string =>
  [
    '',
    'DynamoDB-specific rules:',
    '- DynamoDB supports TWO query interfaces you must choose between based on context:',
    '  1. SDK operations (GetItem, PutItem, UpdateItem, DeleteItem, Query, Scan, etc.) — use these by default.',
    '  2. PartiQL statements (SELECT, INSERT, UPDATE, DELETE) — use these when the user has previously used PartiQL,',
    '     is working in a PartiQL editor/tab, or explicitly asks for a SQL-style statement.',
    '- When the conversation history contains PartiQL statements or the user asks for SQL-style syntax,',
    '  respond with PartiQL. Otherwise, default to SDK-style operations.',
    '- When the context is ambiguous or this is the first query in a session, provide BOTH:',
    '  (a) an SDK solution and (b) an equivalent PartiQL statement, so the user can choose.',
    '- NEVER say DynamoDB does not support SQL — it supports PartiQL, a SQL-compatible query language.',
    '- PartiQL for DynamoDB example — update: UPDATE "TableName" SET attribute = :val WHERE pk = :pk',
    '- PartiQL for DynamoDB example — select: SELECT * FROM "TableName" WHERE pk = :pk',
    '- SDK UpdateItem uses UpdateExpression syntax, e.g.: UpdateExpression="SET #attr = :val"',
    '- Always use ExpressionAttributeNames for reserved words (status, order, name, date, etc.).',
  ].join('\n');

const buildSystemPrompt = (
  schema?: string,
  noConnection?: boolean,
  databaseType?: string,
): string => {
  if (noConnection) {
    return [
      'You are a helpful AI assistant embedded in DocKit, a desktop database client.',
      'You help users with database-related questions, query writing, data analysis, and general programming topics.',
      'No specific database connection is active — answer questions about any supported database using your knowledge.',
      '',
      'Supported databases and their key concepts:',
      buildElasticsearchKnowledge(),
      buildDynamoDBKnowledge(),
      '',
      'Rules:',
      '- Be helpful and concise.',
      '- When writing queries or code, clearly state which database and interface you are targeting.',
      '- If the user asks to query actual live data, remind them to connect a data source first.',
      '- Never fabricate data or pretend to have live query results.',
    ].join('\n');
  }

  const base = [
    'You are a Data Studio agent embedded in DocKit, a desktop database client.',
    'You help users query, analyze, and manage their database data through natural language.',
    '',
    'Rules:',
    '- Always use the available tools to interact with the database.',
    '- Never fabricate data — only return actual query results.',
    '- Explain your reasoning before executing queries.',
    '- For destructive operations, clearly explain what will be affected.',
    '- If a query might return large results, add appropriate limits.',
    ...(databaseType?.toUpperCase() === 'DYNAMODB' ? [buildDynamoDBRules()] : []),
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

    if (riskLevel === 'safe') return false;
    if (!autoMode) return true;
    return false;
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
      } else {
        const newId = ulid();
        dataStudioStore.addMessage(session_id, {
          id: newId,
          role: 'assistant',
          content,
          status: 'streaming',
          timestamp: Date.now(),
        });
      }
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopThinkingDelta(({ session_id, content }) => {
      const session = dataStudioStore.sessions.find(s => s.id === session_id);
      if (!session) return;
      const streamingMsg = [...session.messages]
        .reverse()
        .find((m): m is typeof m => m.role === 'assistant' && m.status === 'streaming');
      if (streamingMsg) {
        dataStudioStore.updateStreamingThinking(session_id, streamingMsg.id, content);
      } else {
        const newId = ulid();
        dataStudioStore.addMessage(session_id, {
          id: newId,
          role: 'assistant',
          content: '',
          thinking: content,
          status: 'streaming',
          timestamp: Date.now(),
        });
      }
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopToolCall(({ session_id, tool_call_id, tool_name, arguments: args }) => {
      const session = dataStudioStore.sessions.find(s => s.id === session_id);
      if (!session) return;
      const runtime = getRuntime(session_id);

      const source = dataStudioStore.connectedSources.find(
        s => s.connectionId === session.connectionId,
      );
      const riskLevel =
        (runtime.metadata?.[tool_name]?.riskLevel as RiskLevel | undefined) ?? 'elevated';
      const needsConfirmation = shouldRequireConfirmation(
        tool_name,
        riskLevel,
        session.connectionId,
        source?.permissionsMode === 'Auto',
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
      const session = dataStudioStore.sessions.find(s => s.id === session_id);
      if (session) {
        session.messages
          .filter(m => m.role === 'assistant' && m.status === 'streaming')
          .forEach(m => dataStudioStore.setMessageStatus(session_id, m.id, 'done'));
      }
      dataStudioStore.setSessionStatus(session_id, 'idle');
      isLoading.value = false;
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopError(({ session_id, error: errMsg }) => {
      error.value = errMsg;
      dataStudioStore.setSessionStatus(session_id, 'error');
      isLoading.value = false;
      const session = dataStudioStore.sessions.find(s => s.id === session_id);
      if (session) {
        const streamingMsg = [...session.messages]
          .reverse()
          .find(m => m.role === 'assistant' && m.status === 'streaming');
        if (streamingMsg) {
          dataStudioStore.setMessageStatus(session_id, streamingMsg.id, 'error');
        }
      }
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopSummaryInjected(_payload => {}).then(unlisten => unlisteners.push(unlisten));
  };

  setupEventListeners();

  const runAgentLoop = async (sessionId: string) => {
    const session = dataStudioStore.sessions.find(s => s.id === sessionId);
    const runtime = getRuntime(sessionId);
    if (!session) return;

    const noConnection = session.connectionId === -1;
    let connectionType: string | undefined;

    if (!noConnection) {
      const connection = connectionStore.connections.find(c => c.id === session.connectionId);
      if (connection) {
        connectionType = connection.type;
        if (!runtime.config) {
          runtime.config = buildConnectionConfig(connection);
        }
      }
    }

    dataStudioStore.setSessionStatus(sessionId, 'running');
    isLoading.value = true;
    error.value = undefined;

    try {
      const { provider, model } = await getFeatureModelConfig('dataStudio');
      const schema = session.schema;

      const settings: Record<string, unknown> = {
        provider: kindToProviderEnum(provider.kind),
        model: model.label,
        apiKey: provider.apiKey ?? '',
        baseUrl: provider.baseUrl,
        httpProxy: provider.proxy || undefined,
        systemPrompt: buildSystemPrompt(schema, noConnection, connectionType),
        tools: noConnection ? [] : (runtime.tools ?? []),
      };

      if (!noConnection && runtime.config) {
        settings.connectionConfig = runtime.config;
      }

      const lastUserMsg = [...session.messages].reverse().find(m => m.role === 'user');
      const userMessage = lastUserMsg?.content ?? '';

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
    isLoading.value = true;

    if (!connectionId) {
      const sessionId = await dataStudioStore.getOrCreateSession(-1);
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
      isLoading.value = false;
      return;
    }

    const source = dataStudioStore.connectedSources.find(s => s.connectionId === connectionId);
    if (!source) {
      error.value = 'Source not connected';
      isLoading.value = false;
      return;
    }

    const sessionId = await dataStudioStore.getOrCreateSession(connectionId);

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
      isLoading.value = false;
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
    }

    const allResolved = assistantMsg?.toolCalls?.every(tc => tc.status !== 'pending') ?? true;
    const anyAllowed =
      assistantMsg?.toolCalls?.some(tc => tc.status === 'executing' || tc.status === 'done') ??
      false;
    if (allResolved && anyAllowed) {
      dataStudioStore.setSessionStatus(session.id, 'running');
      isLoading.value = true;
    } else if (allResolved && !anyAllowed) {
      dataStudioStore.setSessionStatus(session.id, 'idle');
      isLoading.value = false;
    }
  };

  const cancelLoop = async () => {
    const session = activeSession.value;
    if (!session) return;
    await invokeCancelAgentLoop(session.id).catch(() => undefined);
    dataStudioStore.setSessionStatus(session.id, 'idle');
    isLoading.value = false;
  };

  const clearChat = async () => {
    const session = activeSession.value;
    if (session) {
      await dataStudioStore.clearSession(session.id);
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
  kind:
    | 'openai'
    | 'deepseek'
    | 'openrouter'
    | 'ollama'
    | 'lm-studio'
    | 'custom-openai'
    | 'custom-anthropic',
): ProviderEnum => {
  switch (kind) {
    case 'deepseek':
      return ProviderEnum.DEEP_SEEK;
    case 'openrouter':
      return ProviderEnum.OPENROUTER;
    case 'ollama':
      return ProviderEnum.OLLAMA;
    case 'lm-studio':
      return ProviderEnum.LM_STUDIO;
    default:
      return ProviderEnum.OPENAI;
  }
};
