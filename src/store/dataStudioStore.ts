import { defineStore } from 'pinia';
import {
  clearAgentSessionMessages,
  createAgentSession,
  deleteAgentSession,
  loadAgentSessions,
  loadSessionMessages,
  updateSessionStatus,
  type AgentSession as BackendAgentSession,
  type AgentMessage as BackendAgentMessage,
} from '../datasources/agentApi';

export type DataSourcePermissions = {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
};

export type PermissionsMode = 'Ask' | 'Auto';

export type ConnectedSource = {
  connectionId: number | undefined;
  name: string;
  permissions: DataSourcePermissions;
  permissionsMode: PermissionsMode;
};

export type RiskLevel = 'safe' | 'elevated' | 'destructive';

export type AgentToolCallStatus =
  | 'pending'
  | 'confirmed'
  | 'denied'
  | 'executing'
  | 'done'
  | 'error';

export type AgentToolCall = {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  status: AgentToolCallStatus;
  result?: string;
  durationMs?: number;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
};

export type AgentMessageRole = 'user' | 'assistant' | 'tool';

export type AgentMessageStatus = 'pending' | 'streaming' | 'done' | 'error';

export type AgentMessage = {
  id: string;
  role: AgentMessageRole;
  content: string;
  thinking?: string;
  thinkingDuration?: number;
  status: AgentMessageStatus;
  toolCalls?: Array<AgentToolCall>;
  toolCallId?: string;
  timestamp: number;
};

export type AgentSessionStatus = 'idle' | 'running' | 'waiting_confirmation' | 'error';

export type AgentSession = {
  id: string;
  connectionId: number;
  messages: Array<AgentMessage>;
  status: AgentSessionStatus;
  schema?: string;
  maxIterations: number;
};

export type ConfirmationRule = {
  connectionId: number;
  toolName: string;
  action: 'allow_always' | 'deny_always';
};

export type SessionMeta = {
  connectionId: number;
  schema?: string;
  maxIterations: number;
  title: string;
  updatedAt: number;
  modelId?: string | null;
};

const hydrateMessage = (m: BackendAgentMessage): AgentMessage => {
  const base = {
    id: m.id,
    role: m.role as AgentMessageRole,
    status: 'done' as AgentMessageStatus,
    timestamp: m.created_at,
  };

  if (m.role === 'tool') {
    try {
      const parsed = JSON.parse(m.content) as { content?: string };
      return { ...base, content: parsed.content ?? m.content };
    } catch {
      return { ...base, content: m.content };
    }
  }

  if (m.role === 'user') {
    return { ...base, content: m.content };
  }

  try {
    const parsed = JSON.parse(m.content) as {
      content?: string | null;
      thinking?: string | null;
      tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> | null;
    };
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      ('content' in parsed || 'thinking' in parsed || 'tool_calls' in parsed)
    ) {
      const toolCalls: AgentToolCall[] = (parsed.tool_calls ?? []).map(tc => ({
        id: tc.id,
        toolName: tc.function?.name ?? '',
        args: (() => {
          try {
            return JSON.parse(tc.function?.arguments ?? '{}');
          } catch {
            return {};
          }
        })(),
        status: 'done' as AgentToolCallStatus,
        riskLevel: 'safe' as RiskLevel,
        requiresConfirmation: false,
      }));
      return {
        ...base,
        content: parsed.content ?? '',
        thinking: parsed.thinking ?? undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    }
  } catch {
    return { ...base, content: m.content };
  }
  return { ...base, content: m.content };
};

export const useDataStudioStore = defineStore('dataStudio', {
  state: (): {
    connectedSources: Array<ConnectedSource>;
    activeConnectionId: number | undefined;
    configPanelOpen: boolean;
    sessions: Array<AgentSession>;
    activeSessionId: string | undefined;
    confirmationRules: Array<ConfirmationRule>;
    sessionMeta: Record<string, SessionMeta>;
  } => ({
    connectedSources: [],
    activeConnectionId: undefined,
    configPanelOpen: true,
    sessions: [],
    activeSessionId: undefined,
    confirmationRules: [],
    sessionMeta: {},
  }),
  persist: {
    pick: [
      'connectedSources',
      'activeConnectionId',
      'configPanelOpen',
      'confirmationRules',
      'sessionMeta',
      'activeSessionId',
    ],
  },
  getters: {
    activeSession(state): AgentSession | undefined {
      return state.sessions.find(s => s.id === state.activeSessionId);
    },
  },
  actions: {
    toggleConfigPanel() {
      this.configPanelOpen = !this.configPanelOpen;
    },
    addSource(source: ConnectedSource): boolean {
      if (source.connectionId === undefined) return false;
      const exists = this.connectedSources.some(s => s.connectionId === source.connectionId);
      if (exists) return false;
      this.connectedSources.push(source);
      if (this.activeConnectionId === undefined) {
        this.activeConnectionId = source.connectionId;
      }
      return true;
    },
    updateSource(index: number, source: Partial<ConnectedSource>) {
      if (index >= 0 && index < this.connectedSources.length) {
        Object.assign(this.connectedSources[index], source);
      }
    },
    removeSource(index: number) {
      if (index >= 0 && index < this.connectedSources.length) {
        const removed = this.connectedSources.splice(index, 1)[0];
        if (removed.connectionId === this.activeConnectionId) {
          this.activeConnectionId = this.connectedSources[0]?.connectionId;
        }
      }
    },
    removeSourceById(connectionId: number) {
      const index = this.connectedSources.findIndex(s => s.connectionId === connectionId);
      if (index !== -1) {
        this.connectedSources.splice(index, 1);
        if (connectionId === this.activeConnectionId) {
          this.activeConnectionId = this.connectedSources[0]?.connectionId;
        }
      }
    },
    getSourceById(connectionId: number): ConnectedSource | undefined {
      return this.connectedSources.find(s => s.connectionId === connectionId);
    },
    setActiveConnection(connectionId: number) {
      this.activeConnectionId = connectionId;
    },
    async createSession(connectionId: number, maxIterations = 10): Promise<string> {
      const source = this.connectedSources.find(s => s.connectionId === connectionId);
      const title = source?.name ?? 'New Session';
      const backend = await createAgentSession(title);
      this.sessions.push({
        id: backend.id,
        connectionId,
        messages: [],
        status: 'idle',
        maxIterations,
      });
      this.sessionMeta[backend.id] = {
        connectionId,
        maxIterations,
        title,
        updatedAt: backend.updated_at,
      };
      this.activeSessionId = backend.id;
      return backend.id;
    },
    setActiveSession(sessionId: string) {
      this.activeSessionId = sessionId;
    },
    async getOrCreateSession(connectionId: number): Promise<string> {
      const existing = this.sessions.find(
        s => s.connectionId === connectionId && s.id === this.activeSessionId,
      );
      if (existing) return existing.id;
      return this.createSession(connectionId);
    },
    addMessage(sessionId: string, message: AgentMessage) {
      const session = this.sessions.find(s => s.id === sessionId);
      if (session) {
        session.messages.push(message);
      }
    },
    updateStreamingContent(sessionId: string, messageId: string, chunk: string) {
      const session = this.sessions.find(s => s.id === sessionId);
      const message = session?.messages.find(m => m.id === messageId);
      if (message) {
        message.content += chunk;
      }
    },
    updateStreamingThinking(sessionId: string, messageId: string, chunk: string) {
      const session = this.sessions.find(s => s.id === sessionId);
      const message = session?.messages.find(m => m.id === messageId);
      if (message) {
        message.thinking = (message.thinking ?? '') + chunk;
      }
    },
    setMessageStatus(sessionId: string, messageId: string, status: AgentMessageStatus) {
      const session = this.sessions.find(s => s.id === sessionId);
      const message = session?.messages.find(m => m.id === messageId);
      if (message) {
        if (status === 'done' && message.thinking && message.status === 'streaming') {
          message.thinkingDuration = Math.round((Date.now() - message.timestamp) / 1000);
        }
        message.status = status;
      }
    },
    setMessageToolCalls(sessionId: string, messageId: string, toolCalls: Array<AgentToolCall>) {
      const session = this.sessions.find(s => s.id === sessionId);
      const message = session?.messages.find(m => m.id === messageId);
      if (message) {
        message.toolCalls = toolCalls;
      }
    },
    updateToolCallStatus(
      sessionId: string,
      messageId: string,
      toolCallId: string,
      status: AgentToolCallStatus,
      result?: string,
      durationMs?: number,
    ) {
      const session = this.sessions.find(s => s.id === sessionId);
      const message = session?.messages.find(m => m.id === messageId);
      const toolCall = message?.toolCalls?.find(tc => tc.id === toolCallId);
      if (toolCall) {
        toolCall.status = status;
        if (result !== undefined) {
          toolCall.result = result;
        }
        if (durationMs !== undefined) {
          toolCall.durationMs = durationMs;
        }
      }
    },
    setSessionStatus(sessionId: string, status: AgentSessionStatus) {
      const session = this.sessions.find(s => s.id === sessionId);
      if (session) {
        session.status = status;
        updateSessionStatus(sessionId, status).catch(() => undefined);
      }
    },
    setSessionSchema(sessionId: string, schema: string) {
      const session = this.sessions.find(s => s.id === sessionId);
      if (session) {
        session.schema = schema;
        if (this.sessionMeta[sessionId]) {
          this.sessionMeta[sessionId].schema = schema;
        }
      }
    },
    setSessionMaxIterations(sessionId: string, maxIterations: number) {
      const session = this.sessions.find(s => s.id === sessionId);
      if (session) {
        session.maxIterations = maxIterations;
        if (this.sessionMeta[sessionId]) {
          this.sessionMeta[sessionId].maxIterations = maxIterations;
        }
      }
    },
    setSessionModelId(sessionId: string, modelId: string | null) {
      if (this.sessionMeta[sessionId]) {
        this.sessionMeta[sessionId].modelId = modelId;
      }
    },
    findConfirmationRule(connectionId: number, toolName: string): ConfirmationRule | undefined {
      return this.confirmationRules.find(
        r => r.connectionId === connectionId && r.toolName === toolName,
      );
    },
    addConfirmationRule(rule: ConfirmationRule) {
      const index = this.confirmationRules.findIndex(
        r => r.connectionId === rule.connectionId && r.toolName === rule.toolName,
      );
      if (index !== -1) {
        this.confirmationRules.splice(index, 1, rule);
      } else {
        this.confirmationRules.push(rule);
      }
    },
    async clearSession(sessionId: string) {
      const session = this.sessions.find(s => s.id === sessionId);
      if (!session) return;
      await clearAgentSessionMessages(sessionId);
      session.messages.splice(0, session.messages.length);
      session.status = 'idle';
      session.schema = undefined;
      if (this.sessionMeta[sessionId]) {
        this.sessionMeta[sessionId].schema = undefined;
      }
    },
    normalizeLegacySources() {
      const legacyMap: Record<string, 'Ask' | 'Auto'> = {
        default: 'Ask',
        full: 'Auto',
        Ask: 'Ask',
        Auto: 'Auto',
      };
      this.connectedSources = this.connectedSources.map(s => {
        const raw =
          (s as Record<string, unknown>).permissionsMode ?? (s as Record<string, unknown>).autoMode;
        const normalized = typeof raw === 'string' ? legacyMap[raw] : undefined;
        const cleaned = { ...s } as Record<string, unknown>;
        delete cleaned.autoMode;
        if (normalized) {
          cleaned.permissionsMode = normalized;
        } else if (!cleaned.permissionsMode) {
          cleaned.permissionsMode = 'Ask';
        }
        return cleaned as ConnectedSource;
      });
    },
    async loadSessions() {
      this.normalizeLegacySources();
      const backendSessions = await loadAgentSessions();
      const loaded = await Promise.all(
        backendSessions.map(async (s: BackendAgentSession) => {
          const meta = this.sessionMeta[s.id];
          const backendMessages = await loadSessionMessages(s.id).catch(
            () => [] as BackendAgentMessage[],
          );
          const messages: Array<AgentMessage> = backendMessages.map(hydrateMessage);
          return {
            id: s.id,
            connectionId: meta?.connectionId ?? -1,
            messages,
            status: 'idle' as AgentSessionStatus,
            schema: meta?.schema,
            maxIterations: meta?.maxIterations ?? 10,
          };
        }),
      );
      this.sessions = loaded;
      if (backendSessions.length > 0) {
        const latestId = backendSessions[0].id;
        const stillValid =
          this.activeSessionId && this.sessions.some(s => s.id === this.activeSessionId);
        if (!stillValid) {
          this.activeSessionId = latestId;
        }
      }
    },
    async removeSession(sessionId: string) {
      await deleteAgentSession(sessionId).catch(() => undefined);
      this.sessions = this.sessions.filter(s => s.id !== sessionId);
      delete this.sessionMeta[sessionId];
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = this.sessions[0]?.id;
      }
    },
  },
});
