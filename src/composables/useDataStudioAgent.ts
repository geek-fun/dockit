import { ref, computed, onUnmounted } from 'vue';
import { ulid } from 'ulidx';
import {
  useDataStudioStore,
  type AgentMessage,
  type AgentToolCall,
  type RiskLevel,
} from '../store/dataStudioStore';
import {
  useConnectionStore,
  DatabaseType,
  type Connection,
  type ElasticsearchConnection,
  type DynamoDBConnection,
} from '../store/connectionStore';
import { getFeatureModelConfig } from '../store/chatStore';
import { ProviderEnum } from '../datasources';
import { agentApi, type ToolDefinition, type ToolMetadata } from '../datasources/agentApi';

const MAX_AGENT_ITERATIONS = 10;

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

const buildOpenAiMessages = (
  messages: Array<AgentMessage>,
  schema?: string,
  noConnection?: boolean,
): Array<Record<string, unknown>> => {
  const systemMsg = { role: 'system', content: buildSystemPrompt(schema, noConnection) };

  const conversationMsgs = messages.map(msg => {
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.toolName,
            arguments: JSON.stringify(tc.args),
          },
        })),
      };
    }
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        content: msg.content,
        tool_call_id: msg.toolCallId,
      };
    }
    return {
      role: msg.role,
      content: msg.content,
    };
  });

  return [systemMsg, ...conversationMsgs];
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

  const executeToolCall = async (
    sessionId: string,
    assistantMsgId: string,
    tc: AgentToolCall,
  ): Promise<void> => {
    const runtime = getRuntime(sessionId);
    dataStudioStore.updateToolCallStatus(sessionId, assistantMsgId, tc.id, 'executing');
    try {
      const toolResult = await agentApi.executeTool({
        toolName: tc.toolName,
        arguments: JSON.stringify(tc.args),
        connectionConfig: runtime.config!,
      });
      dataStudioStore.updateToolCallStatus(sessionId, assistantMsgId, tc.id, 'done', toolResult);
      dataStudioStore.addMessage(sessionId, {
        id: ulid(),
        role: 'tool',
        content: toolResult,
        status: 'done',
        toolCallId: tc.id,
        timestamp: Date.now(),
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      dataStudioStore.updateToolCallStatus(sessionId, assistantMsgId, tc.id, 'error', errMsg);
      dataStudioStore.addMessage(sessionId, {
        id: ulid(),
        role: 'tool',
        content: `Error: ${errMsg}`,
        status: 'error',
        toolCallId: tc.id,
        timestamp: Date.now(),
      });
    }
  };

  const runAgentLoop = async (sessionId: string) => {
    const session = dataStudioStore.sessions.find(s => s.id === sessionId);
    const runtime = getRuntime(sessionId);
    if (!session) return;

    const noConnection = session.connectionId === -1;
    const source = noConnection
      ? undefined
      : dataStudioStore.connectedSources.find(s => s.connectionId === session.connectionId);

    if (!noConnection && (!runtime.tools || !runtime.metadata || !runtime.config)) return;

    dataStudioStore.setSessionStatus(sessionId, 'running');
    isLoading.value = true;
    error.value = undefined;

    try {
      for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
        const assistantMsgId = ulid();
        const requestId = ulid();
        dataStudioStore.addMessage(sessionId, {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          status: 'streaming',
          timestamp: Date.now(),
        });

        runtime.unlistenDelta = await agentApi.onAgentDelta(event => {
          if (event.requestId !== requestId) return;
          dataStudioStore.updateStreamingContent(sessionId, assistantMsgId, event.content);
        });

        const { provider, model } = await getFeatureModelConfig('dataStudio');
        const openAiMessages = buildOpenAiMessages(
          session.messages.filter(m => m.id !== assistantMsgId),
          session.schema,
          noConnection,
        );

        let result;
        try {
          result = await agentApi.runAgentStep({
            requestId,
            provider: kindToProviderEnum(provider.kind),
            model: model.label,
            messages: openAiMessages,
            tools: noConnection ? [] : runtime.tools!,
            httpProxy: provider.proxy || undefined,
            apiKey: provider.apiKey ?? '',
            baseUrl: provider.baseUrl,
          });
        } finally {
          runtime.unlistenDelta?.();
          runtime.unlistenDelta = undefined;
        }

        dataStudioStore.setMessageStatus(sessionId, assistantMsgId, 'done');

        if (
          result.finishReason === 'stop' ||
          result.finishReason === 'length' ||
          result.finishReason === 'content_filter'
        ) {
          dataStudioStore.setSessionStatus(sessionId, 'idle');
          break;
        }

        if (result.finishReason === 'tool_calls' && result.toolCalls.length > 0 && !noConnection) {
          const toolCalls: Array<AgentToolCall> = result.toolCalls.map(tc => {
            const meta = runtime.metadata![tc.name];
            const riskLevel = meta?.riskLevel ?? 'elevated';
            const needsConfirmation = shouldRequireConfirmation(
              tc.name,
              riskLevel,
              session.connectionId,
              source?.autoMode ?? false,
            );
            return {
              id: tc.id,
              toolName: tc.name,
              args: JSON.parse(tc.arguments || '{}') as Record<string, unknown>,
              status: (needsConfirmation ? 'pending' : 'executing') as AgentToolCall['status'],
              riskLevel,
              requiresConfirmation: needsConfirmation,
            };
          });

          dataStudioStore.setMessageToolCalls(sessionId, assistantMsgId, toolCalls);

          const deniedTools = toolCalls.filter(tc =>
            isDeniedByRule(tc.toolName, session.connectionId),
          );
          deniedTools.forEach(tc => {
            dataStudioStore.updateToolCallStatus(sessionId, assistantMsgId, tc.id, 'denied');
            dataStudioStore.addMessage(sessionId, {
              id: ulid(),
              role: 'tool',
              content: 'Tool execution denied by saved rule.',
              status: 'done',
              toolCallId: tc.id,
              timestamp: Date.now(),
            });
          });

          const autoApproved = toolCalls.filter(tc => tc.status === 'executing');
          for (const tc of autoApproved) {
            await executeToolCall(sessionId, assistantMsgId, tc);
          }

          const hasPending = toolCalls.some(tc => tc.status === 'pending');
          if (hasPending) {
            dataStudioStore.setSessionStatus(sessionId, 'waiting_confirmation');
            isLoading.value = false;
            return;
          }

          continue;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      error.value = errMsg;
      dataStudioStore.setSessionStatus(sessionId, 'error');
    } finally {
      isLoading.value = false;
      runtime.unlistenDelta?.();
      runtime.unlistenDelta = undefined;
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
    if (!session || !getRuntime(session.id).config) return;

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

    if (action === 'allow_once' || action === 'allow_always') {
      await executeToolCall(session.id, assistantMsgId, toolCall);
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
      await runAgentLoop(session.id);
    }
  };

  const clearChat = () => {
    const session = activeSession.value;
    if (session) {
      dataStudioStore.clearSession(session.id);
      getRuntime(session.id).unlistenDelta?.();
      sessionRuntime.delete(session.id);
    }
  };

  onUnmounted(() => {
    sessionRuntime.forEach(runtime => runtime.unlistenDelta?.());
    sessionRuntime.clear();
  });

  return {
    isLoading,
    error,
    activeSession,
    pendingToolCalls,
    sendMessage,
    confirmToolCall,
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
