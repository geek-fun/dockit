import { ref, onUnmounted, type Ref, type ComputedRef } from 'vue';
import { ulid } from 'ulidx';
import type {
  ChatMessage,
  ChatSession,
  ChatSessionStatus,
  ChatContextConfig,
  SendMessageOptions,
  ChatMessageStatus,
} from '@/types/chat';
import type { AgentToolCall, RiskLevel } from '@/store/dataStudioStore';
import {
  useConnectionStore,
  type Connection,
  type ElasticsearchConnection,
  type DynamoDBConnection,
  DatabaseType,
} from '@/store/connectionStore';
import { getFeatureModelConfig } from '@/store/chatStore';
import { ProviderEnum } from '@/datasources';
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
} from '@/datasources/agentApi';

type SessionRuntime = {
  tools?: Array<ToolDefinition>;
  metadata?: Record<string, ToolMetadata>;
  config?: Record<string, unknown>;
  unlistenDelta?: () => void;
};

export type UseChatAgentConfig = {
  feature: 'sidebarAssistant' | 'dataStudio';
  sessionStore: {
    sessions: Ref<Array<ChatSession>>;
    activeSessionId: Ref<string | undefined>;
    activeSession: ComputedRef<ChatSession | undefined>;
    addMessage: (sessionId: string, message: ChatMessage) => void;
    updateStreamingContent: (sessionId: string, messageId: string, chunk: string) => void;
    updateStreamingThinking: (sessionId: string, messageId: string, chunk: string) => void;
    setMessageStatus: (sessionId: string, messageId: string, status: ChatMessageStatus) => void;
    setMessageToolCalls: (
      sessionId: string,
      messageId: string,
      toolCalls: Array<AgentToolCall>,
    ) => void;
    updateToolCallStatus: (
      sessionId: string,
      messageId: string,
      toolCallId: string,
      status: AgentToolCall['status'],
      result?: string,
    ) => void;
    setSessionStatus: (sessionId: string, status: ChatSessionStatus) => void;
    setSessionSchema: (sessionId: string, schema: string) => void;
    clearSession: (sessionId: string) => Promise<void>;
    getOrCreateSession: (connectionId: number) => Promise<string>;
  };
  contextProvider?: () => ChatContextConfig;
  confirmationRules?: Ref<
    Array<{ connectionId: number; toolName: string; action: 'allow_always' | 'deny_always' }>
  >;
  addConfirmationRule?: (rule: {
    connectionId: number;
    toolName: string;
    action: 'allow_always' | 'deny_always';
  }) => void;
  findConfirmationRule?: (
    connectionId: number,
    toolName: string,
  ) => { action: 'allow_always' | 'deny_always' } | undefined;
  autoMode?: Ref<boolean>;
  permissions?: Ref<{ read: boolean; create: boolean; update: boolean; delete: boolean }>;
};

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
    accessKeyId: dynamo.accessKeyId,
    secretAccessKey: dynamo.secretAccessKey,
  };
  if (dynamo.endpointUrl) config.endpointUrl = dynamo.endpointUrl;
  if (dynamo.tableName) config.tableName = dynamo.tableName;
  return config;
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

const buildSidebarContextPrompt = (context: ChatContextConfig): string => {
  const parts: string[] = [];

  if (context.activePanel) {
    if (context.activePanel.connectionType) {
      parts.push(`database: ${context.activePanel.connectionType}`);
    }
    if (context.activePanel.indexName) {
      parts.push(`index: ${context.activePanel.indexName}`);
    }
    if (context.activePanel.tableName) {
      parts.push(`table: ${context.activePanel.tableName}`);
    }
    if (context.activePanel.editorContent) {
      parts.push(`current editor content:\n${context.activePanel.editorContent}`);
    }
  }

  return parts.length > 0 ? `Context:\n${parts.join('\n')}\n\n` : '';
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

export const useChatAgent = (config: UseChatAgentConfig) => {
  const connectionStore = useConnectionStore();
  const sessionRuntime = new Map<string, SessionRuntime>();
  const unlisteners: Array<() => void> = [];

  const isLoading = ref(false);
  const error = ref<string | undefined>();

  const activeSession = config.sessionStore.activeSession;
  const sessions = config.sessionStore.sessions;

  const shouldRequireConfirmation = (
    toolName: string,
    riskLevel: RiskLevel,
    connectionId: number,
  ): boolean => {
    if (config.findConfirmationRule) {
      const rule = config.findConfirmationRule(connectionId, toolName);
      if (rule?.action === 'allow_always') return false;
      if (rule?.action === 'deny_always') return false;
    }

    if (riskLevel === 'safe') return false;
    if (!config.autoMode?.value) return true;
    return true;
  };

  const isDeniedByRule = (toolName: string, connectionId: number): boolean => {
    if (!config.findConfirmationRule) return false;
    const rule = config.findConfirmationRule(connectionId, toolName);
    return rule?.action === 'deny_always';
  };

  const getRuntime = (sessionId: string): SessionRuntime => {
    if (!sessionRuntime.has(sessionId)) {
      sessionRuntime.set(sessionId, {});
    }
    return sessionRuntime.get(sessionId)!;
  };

  const setupEventListeners = () => {
    onAgentLoopDelta(({ session_id, content }) => {
      const session = sessions.value.find(s => s.id === session_id);
      if (!session) return;
      const streamingMsg = [...session.messages]
        .reverse()
        .find(m => m.role === 'assistant' && m.status === 'streaming');
      if (streamingMsg) {
        config.sessionStore.updateStreamingContent(session_id, streamingMsg.id, content);
      } else {
        const newId = ulid();
        config.sessionStore.addMessage(session_id, {
          id: newId,
          role: 'assistant',
          content,
          status: 'streaming',
          timestamp: Date.now(),
        });
      }
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopThinkingDelta(({ session_id, content }) => {
      const session = sessions.value.find(s => s.id === session_id);
      if (!session) return;
      const streamingMsg = [...session.messages]
        .reverse()
        .find(m => m.role === 'assistant' && m.status === 'streaming');
      if (streamingMsg) {
        config.sessionStore.updateStreamingThinking(session_id, streamingMsg.id, content);
      } else {
        const newId = ulid();
        config.sessionStore.addMessage(session_id, {
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
      const session = sessions.value.find(s => s.id === session_id);
      if (!session) return;
      const runtime = getRuntime(session_id);

      const connectionId = session.connectionId ?? -1;
      const riskLevel =
        (runtime.metadata?.[tool_name]?.riskLevel as RiskLevel | undefined) ?? 'elevated';
      const needsConfirmation = shouldRequireConfirmation(tool_name, riskLevel, connectionId);
      const denied = isDeniedByRule(tool_name, connectionId);

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
        config.sessionStore.setMessageToolCalls(session_id, assistantMsgId, [
          ...existing,
          toolCall,
        ]);
      } else {
        assistantMsgId = ulid();
        config.sessionStore.addMessage(session_id, {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          status: 'done',
          timestamp: Date.now(),
          toolCalls: [toolCall],
        });
      }

      if (denied) {
        invokeConfirmToolCall(tool_call_id, false).catch(() => undefined);
        return;
      }

      if (!needsConfirmation) {
        invokeConfirmToolCall(tool_call_id, true).catch(() => undefined);
      } else {
        config.sessionStore.setSessionStatus(session_id, 'waiting_confirmation');
      }
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopToolResult(({ session_id, tool_call_id, envelope }) => {
      const session = sessions.value.find(s => s.id === session_id);
      if (!session) return;
      const assistantMsg = [...session.messages]
        .reverse()
        .find(m => m.role === 'assistant' && m.toolCalls?.some(tc => tc.id === tool_call_id));
      if (assistantMsg) {
        config.sessionStore.updateToolCallStatus(
          session_id,
          assistantMsg.id,
          tool_call_id,
          'done',
          envelope.summary,
        );
      }
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopStepDone(({ session_id, message_id }) => {
      const session = sessions.value.find(s => s.id === session_id);
      if (!session) return;
      const msg = session.messages.find(m => m.id === message_id);
      if (msg) {
        config.sessionStore.setMessageStatus(session_id, message_id, 'done');
      } else {
        const streamingMsg = [...session.messages]
          .reverse()
          .find(m => m.role === 'assistant' && m.status === 'streaming');
        if (streamingMsg) {
          config.sessionStore.setMessageStatus(session_id, streamingMsg.id, 'done');
        }
      }
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopDone(({ session_id }) => {
      const session = sessions.value.find(s => s.id === session_id);
      if (session) {
        session.messages
          .filter(m => m.role === 'assistant' && m.status === 'streaming')
          .forEach(m => config.sessionStore.setMessageStatus(session_id, m.id, 'done'));
      }
      config.sessionStore.setSessionStatus(session_id, 'idle');
      isLoading.value = false;
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopError(({ session_id, error: errMsg }) => {
      error.value = errMsg;
      config.sessionStore.setSessionStatus(session_id, 'error');
      isLoading.value = false;
      const session = sessions.value.find(s => s.id === session_id);
      if (session) {
        const streamingMsg = [...session.messages]
          .reverse()
          .find(m => m.role === 'assistant' && m.status === 'streaming');
        if (streamingMsg) {
          config.sessionStore.setMessageStatus(session_id, streamingMsg.id, 'error');
        }
      }
    }).then(unlisten => unlisteners.push(unlisten));

    onAgentLoopSummaryInjected(() => {}).then(unlisten => unlisteners.push(unlisten));
  };

  setupEventListeners();

  const runAgentLoop = async (
    sessionId: string,
    userMessage: string,
    context?: ChatContextConfig,
  ) => {
    const session = sessions.value.find(s => s.id === sessionId);
    const runtime = getRuntime(sessionId);
    if (!session) return;

    const noConnection = !context?.connectionId || context.connectionId === -1;

    if (!noConnection && !runtime.config && context?.connectionConfig) {
      runtime.config = context.connectionConfig;
    }

    config.sessionStore.setSessionStatus(sessionId, 'running');
    isLoading.value = true;
    error.value = undefined;

    try {
      const { provider, model } = await getFeatureModelConfig(config.feature);
      const schema = session.schema ?? context?.schema;

      let systemPrompt = buildSystemPrompt(schema, noConnection);

      if (config.feature === 'sidebarAssistant' && context) {
        systemPrompt = buildSidebarContextPrompt(context) + systemPrompt;
      }

      const settings: Record<string, unknown> = {
        provider: kindToProviderEnum(provider.kind),
        model: model.label,
        apiKey: provider.apiKey ?? '',
        baseUrl: provider.baseUrl,
        httpProxy: provider.proxy || undefined,
        systemPrompt,
        tools: noConnection ? [] : (runtime.tools ?? []),
      };

      if (!noConnection && runtime.config) {
        settings.connectionConfig = runtime.config;
      }

      await invokeAgentLoop(sessionId, userMessage, settings);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg !== 'cancelled') {
        error.value = errMsg;
        config.sessionStore.setSessionStatus(sessionId, 'error');
      }
      isLoading.value = false;
    }
  };

  const sendMessage = async (options: SendMessageOptions) => {
    error.value = undefined;
    isLoading.value = true;

    const context = options.context ?? config.contextProvider?.() ?? {};
    const connectionId = options.connectionId ?? context.connectionId ?? -1;

    if (connectionId === -1) {
      const sessionId = await config.sessionStore.getOrCreateSession(-1);
      config.sessionStore.addMessage(sessionId, {
        id: ulid(),
        role: 'user',
        content: options.content,
        status: 'done',
        timestamp: Date.now(),
      });
      await runAgentLoop(sessionId, options.content, context);
      return;
    }

    const connection = connectionStore.connections.find(c => c.id === connectionId);
    if (!connection) {
      error.value = 'Connection not found';
      isLoading.value = false;
      return;
    }

    const sessionId = await config.sessionStore.getOrCreateSession(connectionId);

    config.sessionStore.addMessage(sessionId, {
      id: ulid(),
      role: 'user',
      content: options.content,
      status: 'done',
      timestamp: Date.now(),
    });

    const runtime = getRuntime(sessionId);
    runtime.config = buildConnectionConfig(connection);
    context.connectionConfig = runtime.config;
    context.databaseType = connection.type;

    const session = sessions.value.find(s => s.id === sessionId);
    if (session && !session.schema) {
      const schema = await agentApi
        .introspectSchema({
          connectionConfig: runtime.config,
          databaseType: connection.type,
        })
        .catch(() => undefined);
      if (schema) {
        config.sessionStore.setSessionSchema(sessionId, schema);
        context.schema = schema;
      }
    }

    try {
      const permissions = config.permissions?.value ?? {
        read: true,
        create: false,
        update: false,
        delete: false,
      };
      const toolsResponse = await agentApi.getAvailableTools({
        databaseType: connection.type,
        read: permissions.read,
        create: permissions.create,
        update: permissions.update,
        delete: permissions.delete,
      });
      runtime.tools = toolsResponse.tools;
      runtime.metadata = toolsResponse.metadata;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      isLoading.value = false;
      return;
    }

    await runAgentLoop(sessionId, options.content, context);
  };

  const handleConfirmation = async (
    assistantMsgId: string,
    toolCallId: string,
    action: 'allow_once' | 'allow_always' | 'deny' | 'deny_always',
  ) => {
    const session = activeSession.value;
    if (!session) return;

    const assistantMsg = session.messages.find(m => m.id === assistantMsgId);
    const toolCall = assistantMsg?.toolCalls?.find(tc => tc.id === toolCallId);
    if (!toolCall) return;

    const connectionId = session.connectionId ?? -1;

    if (action === 'allow_always' && config.addConfirmationRule) {
      config.addConfirmationRule({
        connectionId,
        toolName: toolCall.toolName,
        action: 'allow_always',
      });
    }
    if (action === 'deny_always' && config.addConfirmationRule) {
      config.addConfirmationRule({
        connectionId,
        toolName: toolCall.toolName,
        action: 'deny_always',
      });
    }

    const allowed = action === 'allow_once' || action === 'allow_always';
    await invokeConfirmToolCall(toolCallId, allowed);

    if (allowed) {
      config.sessionStore.updateToolCallStatus(session.id, assistantMsgId, toolCallId, 'executing');
    } else {
      config.sessionStore.updateToolCallStatus(session.id, assistantMsgId, toolCallId, 'denied');
    }

    const allResolved = assistantMsg?.toolCalls?.every(tc => tc.status !== 'pending') ?? true;
    const anyAllowed =
      assistantMsg?.toolCalls?.some(tc => tc.status === 'executing' || tc.status === 'done') ??
      false;

    if (allResolved && anyAllowed) {
      config.sessionStore.setSessionStatus(session.id, 'running');
      isLoading.value = true;
    } else if (allResolved && !anyAllowed) {
      config.sessionStore.setSessionStatus(session.id, 'idle');
      isLoading.value = false;
    }
  };

  const cancelSession = async () => {
    const session = activeSession.value;
    if (!session) return;
    await invokeCancelAgentLoop(session.id).catch(() => undefined);
    config.sessionStore.setSessionStatus(session.id, 'idle');
    isLoading.value = false;
  };

  const clearChat = async () => {
    const session = activeSession.value;
    if (session) {
      await config.sessionStore.clearSession(session.id);
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
    sendMessage,
    handleConfirmation,
    cancelSession,
    clearChat,
  };
};
