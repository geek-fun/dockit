import { defineStore } from 'pinia';
import { ulid } from 'ulidx';
import {
  createAgentSession,
  deleteAgentSession,
  loadAgentSessions,
  updateSessionStatus,
  type AgentSession as BackendAgentSession,
} from '../datasources/agentApi';

export type DataSourcePermissions = {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
};

export type ConnectedSource = {
  connectionId: number | undefined;
  name: string;
  permissions: DataSourcePermissions;
  autoMode: boolean;
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
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
};

export type AgentMessageRole = 'user' | 'assistant' | 'tool';

export type AgentMessageStatus = 'pending' | 'streaming' | 'done' | 'error';

export type AgentMessage = {
  id: string;
  role: AgentMessageRole;
  content: string;
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

export const useDataStudioStore = defineStore('dataStudio', {
  state: (): {
    connectedSources: Array<ConnectedSource>;
    activeConnectionId: number | undefined;
    configPanelOpen: boolean;
    sessions: Array<AgentSession>;
    activeSessionId: string | undefined;
    confirmationRules: Array<ConfirmationRule>;
  } => ({
    connectedSources: [],
    activeConnectionId: undefined,
    configPanelOpen: true,
    sessions: [],
    activeSessionId: undefined,
    confirmationRules: [],
  }),
  persist: {
    pick: ['connectedSources', 'activeConnectionId', 'configPanelOpen', 'confirmationRules'],
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
    createSession(connectionId: number, maxIterations = 10): string {
      const id = ulid();
      this.sessions.push({ id, connectionId, messages: [], status: 'idle', maxIterations });
      this.activeSessionId = id;
      createAgentSession(id).catch(() => undefined);
      return id;
    },
    setActiveSession(sessionId: string) {
      this.activeSessionId = sessionId;
    },
    getOrCreateSession(connectionId: number): string {
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
    setMessageStatus(sessionId: string, messageId: string, status: AgentMessageStatus) {
      const session = this.sessions.find(s => s.id === sessionId);
      const message = session?.messages.find(m => m.id === messageId);
      if (message) {
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
    ) {
      const session = this.sessions.find(s => s.id === sessionId);
      const message = session?.messages.find(m => m.id === messageId);
      const toolCall = message?.toolCalls?.find(tc => tc.id === toolCallId);
      if (toolCall) {
        toolCall.status = status;
        if (result !== undefined) {
          toolCall.result = result;
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
      }
    },
    setSessionMaxIterations(sessionId: string, maxIterations: number) {
      const session = this.sessions.find(s => s.id === sessionId);
      if (session) {
        session.maxIterations = maxIterations;
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
    clearSession(sessionId: string) {
      const session = this.sessions.find(s => s.id === sessionId);
      if (session) {
        session.messages.splice(0, session.messages.length);
        session.status = 'idle';
        session.schema = undefined;
      }
    },
    async loadSessions() {
      const backendSessions = await loadAgentSessions();
      const mapped: Array<AgentSession> = backendSessions.map((s: BackendAgentSession) => {
        const existing = this.sessions.find(e => e.id === s.id);
        return {
          id: s.id,
          connectionId: existing?.connectionId ?? -1,
          messages: existing?.messages ?? [],
          status: (s.status as AgentSessionStatus) ?? 'idle',
          schema: existing?.schema,
          maxIterations: existing?.maxIterations ?? 10,
        };
      });
      this.sessions = mapped;
    },
    async removeSession(sessionId: string) {
      await deleteAgentSession(sessionId).catch(() => undefined);
      this.sessions = this.sessions.filter(s => s.id !== sessionId);
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = this.sessions[0]?.id;
      }
    },
  },
});
