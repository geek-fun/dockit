import { computed, ref, type Ref, type ComputedRef } from 'vue';
import { ulid } from 'ulidx';
import type {
  ChatMessage,
  ChatSession,
  ChatSessionStatus,
  ChatContextConfig,
  SendMessageOptions,
  ChatMessageStatus,
} from '@/types/chat';
import type { AgentToolCall, ConfirmationRule, SessionSource } from '@/store/dataStudioStore';
import { useDataStudioStore } from '@/store/dataStudioStore';
import { getFeatureModelConfig } from '@/store';
import { useAppStore } from '@/store';
import {
  agentApi,
  type ToolMetadata,
  runAgentLoop as invokeAgentLoop,
  cancelAgentLoop as invokeCancelAgentLoop,
  confirmToolCall as invokeConfirmToolCall,
} from '@/datasources/agentApi';
import { getSessionRuntime, clearSessionRuntime } from './agentRuntime';

type PromptSource = {
  connectionId: string;
  databaseType: string;
  permissions?: { read: boolean; create: boolean; update: boolean; delete: boolean };
};

type UseChatAgentConfirmationRule = Pick<ConfirmationRule, 'action'>;

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
    removeOrphanedStreamingMessages: (sessionId: string, finalizedMessageId: string) => void;
    updateToolCallStatus: (
      sessionId: string,
      messageId: string,
      toolCallId: string,
      status: AgentToolCall['status'],
      result?: string,
      durationMs?: number,
    ) => void;
    setSessionStatus: (sessionId: string, status: ChatSessionStatus) => void;
    setSessionStopped?: (
      sessionId: string,
      reason: 'iteration_cap' | 'wall_clock_budget' | 'token_budget',
      message: string,
    ) => void;
    clearSessionStop?: (sessionId: string) => void;
    setSessionSchema?: (sessionId: string, schema: string) => void;
    clearSession: (sessionId: string) => Promise<void>;
    getOrCreateSession: () => Promise<string>;
    reloadSessionMessages: (sessionId: string) => Promise<void>;
  };
  contextProvider?: () => ChatContextConfig;
  confirmationRules?: Ref<Array<ConfirmationRule>>;
  addConfirmationRule?: (rule: ConfirmationRule) => void;
  findConfirmationRule?: (
    sessionId: string,
    toolName: string,
  ) => UseChatAgentConfirmationRule | undefined;
  autoMode?: Ref<boolean>;
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

const buildSourceSummary = (sources: Array<PromptSource>): string =>
  sources.length === 0
    ? 'No attached data sources are available in this session.'
    : [
        'Attached data sources:',
        ...sources.map(source => {
          const perms = source.permissions;
          const permStr = perms
            ? Object.entries(perms)
                .filter(([, v]) => v)
                .map(([k]) => k)
                .join(', ') || 'none'
            : 'read';
          return `- ${source.connectionId}: ${source.databaseType} (permissions: ${permStr})`;
        }),
      ].join('\n');

const buildSystemPrompt = ({
  schema,
  noConnection,
  sources,
  databaseType,
  permissionsMode,
}: {
  schema?: string;
  noConnection?: boolean;
  sources: Array<PromptSource>;
  databaseType?: string;
  permissionsMode?: string;
}): string => {
  if (noConnection) {
    return [
      'CRITICAL: Always respond in markdown format. Never wrap your response in XML tags like `<assistant>`, `<thinking>`, `<antThinking>`, or `<think>`. Do not use XML schema formatting of any kind.',
      '',
      'You are a helpful AI assistant embedded in DocKit, a desktop database client.',
      'You help users with database-related questions, query writing, data analysis, and general programming topics.',
      'No specific database connection is active — answer questions about any supported database using your knowledge.',
      '',
      'Supported databases and their key concepts:',
      buildElasticsearchKnowledge(),
      buildDynamoDBKnowledge(),
      '',
      'Rules:',
      '- Be concise and direct. No filler phrases, greetings, or sign-offs.',
      '- When writing queries or code, clearly state which database and interface you are targeting.',
      '- If the user asks to query actual live data, remind them to connect a data source first.',
      '- Never fabricate data or pretend to have live query results.',
      '',
      'Output format:',
      '- Respond in markdown format.',
      '- No emojis.',
      '- Wrap queries, API requests, and tool results in fenced code blocks with the appropriate language tag (e.g. ```json). Do NOT convert raw query results into markdown tables — preserve their original format.',
      '- After bulk operations, give a brief factual summary: what was done, counts, any anomalies. No celebrations.',
    ].join('\n');
  }

  const includesDynamo =
    sources.some(source => source.databaseType.toUpperCase() === 'DYNAMODB') ||
    databaseType?.toUpperCase() === 'DYNAMODB';

  const isAskMode = permissionsMode === 'Ask';

  const base = [
    'CRITICAL: Always respond in markdown format. Never wrap your response in XML tags like `<assistant>`, `<thinking>`, `<antThinking>`, or `<think>`. Do not use XML schema formatting of any kind.',
    '',
    'You are a Data Studio agent embedded in DocKit, a desktop database client.',
    'You help users query, analyze, and manage their database data through natural language.',
    '',
    buildSourceSummary(sources),
    '',
    `Current mode: ${isAskMode ? 'ASK' : 'AUTO'}.`,
    ...(isAskMode
      ? [
          '',
          '- In ASK mode, prefer answering from your knowledge and expertise.',
          '- Do NOT call tools unless the user explicitly asks you to execute an action.',
          '- Requests for "sample", "example", "demonstration", "generate", "show me the syntax/DSL/code", or "how to" are NOT execution requests. Show the code in a fenced block and explain it — do not run it.',
          '- Explicit execution requests are direct commands to perform an action on live data, such as "run this query", "create the index now", "insert the data", "delete that document", "do it", "go ahead", "proceed", "execute", "apply".',
          '- When the user describes a scenario or asks "what if" / "how would I" questions, explain the approach without executing anything.',
          '- If you are unsure whether the user wants you to act or just explain, default to explaining and ask if they want you to proceed.',
        ]
      : [
          '',
          '- Use the available tools to interact with the database.',
          '- Only use connection IDs listed above — the list reflects current session state and may change between turns if sources are attached or detached.',
        ]),
    '',
    'Rules (apply regardless of mode):',
    '- Never fabricate data — only return actual query results.',
    '- Explain your reasoning before executing queries.',
    '- For destructive operations, clearly explain what will be affected.',
    '- If a query might return large results, add appropriate limits.',
    '- Be concise and direct. No filler phrases, greetings, sign-offs, or celebratory language.',
    ...(includesDynamo ? [buildDynamoDBRules()] : []),
    '',
    'Output format:',
    '- Respond in markdown format.',
    '- No emojis.',
    '- Do NOT use XML tags or schema formatting (no `<thinking>`, `<assistant>`, `<antThinking>`, `</answer>`, etc.).',
    '- Wrap queries, API requests, and tool results in fenced code blocks with the appropriate language tag (e.g. ```json). Do NOT convert raw query results into markdown tables — preserve their original format.',
    '- After bulk operations, give a brief factual summary: what was done, counts, any anomalies. No celebrations.',
    '- Keep responses focused. Do not offer unsolicited next-step suggestions unless the result is ambiguous.',
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

const getActiveSources = (session?: ChatSession): SessionSource[] =>
  (session?.sources ?? []).filter(source => !source.detached);

const toPromptSources = (
  session?: ChatSession,
  context?: ChatContextConfig,
): Array<PromptSource> => {
  const sessionSources = getActiveSources(session).map(source => ({
    connectionId: source.alias,
    databaseType: source.databaseType,
    permissions: source.permissions,
  }));

  if (sessionSources.length > 0) {
    return sessionSources;
  }

  if (context?.databaseTypes) {
    return Object.entries(context.databaseTypes).map(([connectionId, databaseType]) => ({
      connectionId,
      databaseType,
    }));
  }

  if (context?.databaseType) {
    const connKeys = context.connections ? Object.keys(context.connections) : [];
    const connectionId = connKeys.length > 0 ? connKeys[0] : 'default';
    return [{ connectionId, databaseType: context.databaseType }];
  }
  return [];
};

const normalizeToolMetadata = (
  metadata: Record<string, ToolMetadata>,
): Record<string, ToolMetadata> => metadata;

const getSessionById = (sessions: Array<ChatSession>, sessionId: string): ChatSession | undefined =>
  sessions.find(session => session.id === sessionId);

export const useChatAgent = (config: UseChatAgentConfig) => {
  const localError = ref<string | undefined>();

  const activeSession = config.sessionStore.activeSession;
  const dataStudioStore = useDataStudioStore();
  const isLoading = computed(
    () =>
      activeSession.value?.status === 'running' ||
      activeSession.value?.status === 'waiting_confirmation',
  );
  const error = computed(
    () =>
      localError.value ??
      (activeSession.value ? dataStudioStore.getSessionError(activeSession.value.id) : undefined),
  );
  const lastSettings = ref<Record<string, unknown> | null>(null);
  const sessions = config.sessionStore.sessions;

  const initContextSettings = async (): Promise<void> => {
    if (lastSettings.value) return;
    try {
      const { provider, model } = await getFeatureModelConfig(config.feature);
      lastSettings.value = {
        provider: provider.apiCompatibility,
        apiCompatibility: provider.apiCompatibility,
        model: model.label,
        apiKey: provider.apiKey ?? '',
        baseUrl: provider.baseUrl,
        httpProxy: provider.proxy || undefined,
        proxyMode: provider.proxyMode,
        ...useAppStore().chatConfig,
        contextWindowOverride: provider.contextWindowOverride,
      };
    } catch {
      lastSettings.value = null;
    }
  };

  const runAgentLoop = async (
    sessionId: string,
    userMessage: string,
    context?: ChatContextConfig,
  ) => {
    const session = getSessionById(sessions.value, sessionId);
    const runtime = getSessionRuntime(sessionId);
    if (!session) return;

    const promptSources = toPromptSources(session, context);
    const resolvedSources = promptSources.filter(s =>
      Boolean(context?.connections?.[s.connectionId]),
    );
    const noConnection =
      resolvedSources.length === 0 && Object.keys(context?.connections ?? {}).length === 0;

    config.sessionStore.setSessionStatus(sessionId, 'running');
    localError.value = undefined;
    dataStudioStore.clearSessionError(sessionId);

    try {
      const { provider, model } = await getFeatureModelConfig(config.feature);
      const schema = session.schema ?? context?.schema;

      let systemPrompt = buildSystemPrompt({
        schema,
        noConnection,
        sources: promptSources,
        databaseType: context?.databaseType,
        permissionsMode: session.permissionsMode,
      });

      if (config.feature === 'sidebarAssistant' && context) {
        systemPrompt = buildSidebarContextPrompt(context) + systemPrompt;
      }

      const settings: Record<string, unknown> = {
        provider: provider.apiCompatibility,
        apiCompatibility: provider.apiCompatibility,
        model: model.label,
        apiKey: provider.apiKey ?? '',
        baseUrl: provider.baseUrl,
        httpProxy: provider.proxy || undefined,
        proxyMode: provider.proxyMode,
        systemPrompt,
        // Tools are already filtered by getAvailableTools — no need to clear
        // based on connection state. DocKit tools (dockit__list_connections)
        // are always available regardless of connection.
        tools: runtime.tools ?? [],
        ...useAppStore().chatConfig,
        contextWindowOverride: provider.contextWindowOverride,
      };

      if (context?.connections) {
        settings.connections = context.connections;
      }

      await invokeAgentLoop(sessionId, userMessage, settings);
      lastSettings.value = settings;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg !== 'cancelled') {
        localError.value = errMsg;
        dataStudioStore.setSessionError(sessionId, errMsg);
        config.sessionStore.setSessionStatus(sessionId, 'error');
      }
    }
  };

  const sendMessage = async (options: SendMessageOptions) => {
    localError.value = undefined;

    const sessionId = await config.sessionStore.getOrCreateSession();
    dataStudioStore.clearSessionError(sessionId);
    config.sessionStore.clearSessionStop?.(sessionId);

    config.sessionStore.addMessage(sessionId, {
      id: ulid(),
      role: 'user',
      content: options.content,
      status: 'done',
      timestamp: Date.now(),
    });

    dataStudioStore.insertPreparingPlaceholder(sessionId);
    dataStudioStore.setSessionProgress(sessionId, { phase: 'preparing' });

    const context = options.context ?? config.contextProvider?.() ?? {};

    try {
      const runtime = getSessionRuntime(sessionId);
      // Always load tools, filtered by available connection types.
      // When no connections exist, only DocKit tools (like dockit__list_connections)
      // are returned — the LLM can still use them without an active connection.
      const dbTypes = Object.values(context.connections ?? {}).map(c => c.dbType);
      const toolsResponse = await agentApi.getAvailableTools(dbTypes);
      runtime.tools = toolsResponse.tools;
      runtime.metadata = normalizeToolMetadata(toolsResponse.metadata);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      localError.value = errMsg;
      dataStudioStore.setSessionError(sessionId, errMsg);
      config.sessionStore.setSessionStatus(sessionId, 'error');
      return;
    }

    await runAgentLoop(sessionId, options.content, context);
  };

  const handleConfirmation = async (
    assistantMsgId: string,
    toolCallId: string,
    action: 'allow_once' | 'allow_always' | 'deny' | 'deny_always' | 'cancel',
  ) => {
    const session = activeSession.value;
    if (!session) return;

    const assistantMsg = session.messages.find(message => message.id === assistantMsgId);
    const toolCall = assistantMsg?.toolCalls?.find(entry => entry.id === toolCallId);
    if (!toolCall) return;

    if (action === 'cancel') {
      await invokeCancelAgentLoop(session.id).catch(() => undefined);
      config.sessionStore.setSessionStatus(session.id, 'idle');
      dataStudioStore.clearSessionError(session.id);
      config.sessionStore.updateToolCallStatus(session.id, assistantMsgId, toolCallId, 'denied');
      return;
    }

    if (action === 'allow_always' && config.addConfirmationRule) {
      config.addConfirmationRule({
        sessionId: session.id,
        toolName: toolCall.toolName,
        action: 'allow_always',
      });
    }
    if (action === 'deny_always' && config.addConfirmationRule) {
      config.addConfirmationRule({
        sessionId: session.id,
        toolName: toolCall.toolName,
        action: 'deny_always',
      });
    }

    const allowed = action === 'allow_once' || action === 'allow_always';
    try {
      await invokeConfirmToolCall(toolCallId, allowed);
    } catch {
      config.sessionStore.updateToolCallStatus(session.id, assistantMsgId, toolCallId, 'error');
      config.sessionStore.setSessionStatus(session.id, 'idle');
      return;
    }

    config.sessionStore.updateToolCallStatus(
      session.id,
      assistantMsgId,
      toolCallId,
      allowed ? 'executing' : 'denied',
    );

    const updatedSession = getSessionById(sessions.value, session.id);
    const updatedAssistantMsg = updatedSession?.messages.find(
      message => message.id === assistantMsgId,
    );
    const allResolved =
      updatedAssistantMsg?.toolCalls?.every(entry => entry.status !== 'pending') ?? true;
    const anyAllowed =
      updatedAssistantMsg?.toolCalls?.some(
        entry => entry.status === 'executing' || entry.status === 'done',
      ) ?? false;

    if (allResolved && anyAllowed) {
      config.sessionStore.setSessionStatus(session.id, 'running');
    } else if (allResolved && !anyAllowed) {
      config.sessionStore.setSessionStatus(session.id, 'idle');
    }
  };

  const cancelSession = async () => {
    const session = activeSession.value;
    if (!session) return;
    await invokeCancelAgentLoop(session.id).catch(() => undefined);
    config.sessionStore.setSessionStatus(session.id, 'idle');
    dataStudioStore.clearSessionError(session.id);
  };

  const clearChat = async () => {
    const session = activeSession.value;
    if (session) {
      await config.sessionStore.clearSession(session.id);
      clearSessionRuntime(session.id);
    }
  };

  return {
    isLoading,
    error,
    activeSession,
    lastSettings,
    initContextSettings,
    sendMessage,
    handleConfirmation,
    cancelSession,
    clearChat,
  };
};
