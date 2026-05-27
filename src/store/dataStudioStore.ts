import { defineStore } from 'pinia';
import { ulid } from 'ulidx';
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

export type SourcePermissionsMode = 'inherit' | 'custom';

export type DatabaseSource = {
  kind: 'database';
  sourceId: string;
  connectionId: number;
  name: string;
  databaseType: 'ELASTICSEARCH' | 'OPENSEARCH' | 'EASYSEARCH' | 'DYNAMODB' | 'MONGODB';
  permissions: DataSourcePermissions;
};

export type FileSource = {
  kind: 'file';
  sourceId: string;
  name: string;
  fileType: 'csv' | 'excel' | 'json' | 'parquet';
  filePath: string;
  permissions: Pick<DataSourcePermissions, 'read'>;
};

export type AttachedSource = DatabaseSource | FileSource;

// ── Session Source Snapshot (frozen at attach time) ──────────────────────────
// Persisted with the session. Alias and kind never change after creation.

export type SessionSource = {
  sourceId: string; // links back to AttachedSource in store
  alias: string; // derived from connection name at attach time; frozen forever
  kind: 'database' | 'file';
  databaseType: string; // frozen (e.g. 'ELASTICSEARCH')
  permissions: DataSourcePermissions;
  permissionsMode: SourcePermissionsMode;
  detached?: boolean; // true = was in session, now removed from workspace
  detachedAt?: number; // timestamp
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
  resultTruncated?: boolean;
  resultFullLength?: number;
  durationMs?: number;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
};

export type AgentMessageRole = 'user' | 'assistant' | 'tool' | 'system';

export type AgentMessageStatus = 'pending' | 'streaming' | 'done' | 'error';

export type CompactionMarker = {
  summary: string;
  preTokens: number;
  postTokens: number;
  trigger: 'auto' | 'manual';
};

export type CompactionMarkerInsertPayload = {
  trigger: string;
  pre_tokens: number;
  post_tokens: number;
  removed_count: number;
  fallback_keep_pairs?: number;
};

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
  compaction?: CompactionMarker;
  compactionInProgress?: boolean;
  preparingInProgress?: boolean;
};

export type AgentSessionStatus = 'idle' | 'running' | 'waiting_confirmation' | 'error' | 'stopped';

export type AgentSessionStopReason =
  | 'iteration_cap'
  | 'wall_clock_budget'
  | 'token_budget'
  | 'llm_error'
  | 'llm_error_fatal';

export type AgentSession = {
  id: string;
  sources: SessionSource[]; // ordered snapshots; records are permanent once added
  permissionsMode: PermissionsMode; // session-level — applies uniformly to all sources
  messages: Array<AgentMessage>;
  status: AgentSessionStatus;
  maxIterations: number;
  stopReason?: AgentSessionStopReason;
  stopMessage?: string;
};

export type ConfirmationRule = {
  sessionId: string; // scoped to a session, not a source
  toolName: string; // bare tool name without alias prefix
  action: 'allow_always' | 'deny_always';
};

export type SessionMeta = {
  sources: SessionSource[];
  permissionsMode: PermissionsMode;
  maxIterations: number;
  title: string;
  updatedAt: number;
  modelId?: string | null;
};

// ── Alias derivation ─────────────────────────────────────────────────────────

export const toAlias = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24);
  return slug || 'source';
};

export const attachSourceToSession = (
  session: AgentSession,
  source: AttachedSource,
): AgentSession => {
  const existingAliases = session.sources.map(s => s.alias);
  const base = toAlias(source.name);
  let alias = base;
  let n = 2;
  while (existingAliases.includes(alias)) alias = `${base}_${n++}`;

  const databaseType =
    source.kind === 'database' ? source.databaseType : (source as FileSource).fileType;

  const permissions: DataSourcePermissions =
    source.kind === 'database'
      ? { ...(source as DatabaseSource).permissions }
      : {
          read: true,
          create: false,
          update: false,
          delete: false,
        };

  const snapshot: SessionSource = {
    sourceId: source.sourceId,
    alias,
    kind: source.kind,
    databaseType,
    permissions,
    permissionsMode: 'inherit',
  };

  return { ...session, sources: [...session.sources, snapshot] };
};

// ── Hydration ────────────────────────────────────────────────────────────────

const dedupAdjacentCompactions = (messages: AgentMessage[]): AgentMessage[] => {
  // Keep only the last compaction marker (robust against non-deterministic ordering).
  let found = false;
  return messages.reduceRight((acc, m) => {
    if (!m.compaction || !found) {
      if (m.compaction) found = true;
      acc.unshift(m);
    }
    return acc;
  }, [] as AgentMessage[]);
};

const hydrateMessage = (m: BackendAgentMessage): AgentMessage => {
  const base = {
    id: m.id,
    role: m.role as AgentMessageRole,
    status: 'done' as AgentMessageStatus,
    timestamp: m.created_at,
  };

  if (m.role === 'system') {
    try {
      const parsed = JSON.parse(m.content) as {
        _compact_boundary?: boolean;
        summary?: string;
        pre_tokens?: number;
        post_tokens?: number;
        trigger?: string;
      };
      if (parsed?._compact_boundary) {
        const trigger: CompactionMarker['trigger'] =
          parsed.trigger === 'manual' ? 'manual' : 'auto';
        return {
          ...base,
          content: '',
          compaction: {
            summary: parsed.summary ?? '',
            preTokens: parsed.pre_tokens ?? 0,
            postTokens: parsed.post_tokens ?? 0,
            trigger,
          },
        };
      }
    } catch {
      return { ...base, content: m.content };
    }
    return { ...base, content: m.content };
  }

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
    const isLlmError = m.role === 'assistant' && m.content.startsWith('LLM HTTP ');
    return { ...base, status: isLlmError ? 'error' : 'done', content: m.content };
  }
  const isLlmError = m.role === 'assistant' && m.content.startsWith('LLM HTTP ');
  return { ...base, status: isLlmError ? 'error' : 'done', content: m.content };
};

// ── Store ────────────────────────────────────────────────────────────────────

export type SessionProgressPhase =
  | 'idle'
  | 'preparing'
  | 'iterating'
  | 'waiting_llm'
  | 'compacting';
export type SessionProgress = {
  phase: SessionProgressPhase;
  iter?: number;
  maxIter?: number;
  updatedAt: number;
};

export const useDataStudioStore = defineStore('dataStudio', {
  state: (): {
    attachedSources: Array<AttachedSource>;
    sessions: Array<AgentSession>;
    activeSessionId: string | undefined;
    sidebarSessionId: string | undefined;
    confirmationRules: Array<ConfirmationRule>;
    sessionMeta: Record<string, SessionMeta>;
    toolResultFullBodies: Record<string, string>;
    sessionErrors: Record<string, string>;
    sessionProgress: Record<string, SessionProgress>;
  } => ({
    attachedSources: [],
    sessions: [],
    activeSessionId: undefined,
    sidebarSessionId: undefined,
    confirmationRules: [],
    sessionMeta: {},
    toolResultFullBodies: {},
    sessionErrors: {},
    sessionProgress: {},
  }),
  persist: {
    pick: [
      'attachedSources',
      'confirmationRules',
      'sessionMeta',
      'activeSessionId',
      'sidebarSessionId',
    ],
  },
  getters: {
    activeSession(state): AgentSession | undefined {
      return state.sessions.find(s => s.id === state.activeSessionId);
    },
    getSessionProgress: state => {
      return (sessionId: string): SessionProgress | undefined => {
        return state.sessionProgress[sessionId];
      };
    },
  },
  actions: {
    // ── Attached source management ──────────────────────────────────────────

    addAttachedSource(source: AttachedSource): boolean {
      const exists = this.attachedSources.some(s => s.sourceId === source.sourceId);
      if (exists) return false;
      this.attachedSources = [...this.attachedSources, source];
      return true;
    },

    updateAttachedSource(
      sourceId: string,
      patch: Partial<Omit<AttachedSource, 'sourceId' | 'kind'>>,
    ) {
      this.attachedSources = this.attachedSources.map(s =>
        s.sourceId === sourceId ? ({ ...s, ...patch } as AttachedSource) : s,
      );
    },

    removeAttachedSource(sourceId: string) {
      this.attachedSources = this.attachedSources.filter(s => s.sourceId !== sourceId);
    },

    getAttachedSourceById(sourceId: string): AttachedSource | undefined {
      return this.attachedSources.find(s => s.sourceId === sourceId);
    },

    // ── Backward compat: create a DatabaseSource from a connectionId + Connection ──
    addDatabaseSourceFromConnection(params: {
      connectionId: number;
      name: string;
      databaseType: 'ELASTICSEARCH' | 'OPENSEARCH' | 'EASYSEARCH' | 'DYNAMODB' | 'MONGODB';
      permissions: DataSourcePermissions;
    }): DatabaseSource {
      const existing = this.attachedSources.find(
        s => s.kind === 'database' && (s as DatabaseSource).connectionId === params.connectionId,
      ) as DatabaseSource | undefined;
      if (existing) {
        const updated = { ...existing, permissions: params.permissions };
        this.attachedSources = this.attachedSources.map(s =>
          s.sourceId === existing.sourceId ? updated : s,
        );
        return updated;
      }

      const source: DatabaseSource = {
        kind: 'database',
        sourceId: ulid(),
        connectionId: params.connectionId,
        name: params.name,
        databaseType: params.databaseType,
        permissions: params.permissions,
      };
      this.attachedSources = [...this.attachedSources, source];
      return source;
    },

    // ── Session source management ────────────────────────────────────────────

    attachSourceToActiveSession(source: AttachedSource): boolean {
      const session = this.activeSession;
      if (!session) return false;
      const updated = attachSourceToSession(session, source);
      this.sessions = this.sessions.map(s => (s.id === session.id ? updated : s));
      if (this.sessionMeta[session.id]) {
        this.sessionMeta[session.id].sources = updated.sources;
      }
      return true;
    },

    detachSourceFromSession(sessionId: string, sourceId: string) {
      const session = this.sessions.find(s => s.id === sessionId);
      if (!session) return;
      const updatedSources = session.sources.map(s =>
        s.sourceId === sourceId ? { ...s, detached: true, detachedAt: Date.now() } : s,
      );
      this.sessions = this.sessions.map(s =>
        s.id === sessionId ? { ...s, sources: updatedSources } : s,
      );
      if (this.sessionMeta[sessionId]) {
        this.sessionMeta[sessionId].sources = updatedSources;
      }
    },

    setSessionPermissionsMode(sessionId: string, mode: PermissionsMode) {
      const writePerms = mode === 'Auto';
      const updatedSources = (this.sessions.find(s => s.id === sessionId)?.sources ?? []).map(s =>
        s.detached || s.permissionsMode === 'custom'
          ? s
          : {
              ...s,
              permissions: {
                read: true,
                create: writePerms,
                update: writePerms,
                delete: writePerms,
              },
            },
      );
      this.sessions = this.sessions.map(s =>
        s.id === sessionId ? { ...s, permissionsMode: mode, sources: updatedSources } : s,
      );
      if (this.sessionMeta[sessionId]) {
        this.sessionMeta[sessionId].permissionsMode = mode;
        this.sessionMeta[sessionId].sources = updatedSources;
      }
    },

    updateSessionSourcePermissions(
      sessionId: string,
      sourceId: string,
      permissions: DataSourcePermissions,
    ) {
      const updatedSources = (this.sessions.find(s => s.id === sessionId)?.sources ?? []).map(s =>
        s.sourceId === sourceId ? { ...s, permissions, permissionsMode: 'custom' as const } : s,
      );
      this.sessions = this.sessions.map(s =>
        s.id === sessionId ? { ...s, sources: updatedSources } : s,
      );
      if (this.sessionMeta[sessionId]) {
        this.sessionMeta[sessionId].sources = updatedSources;
      }
    },

    updateSessionSourceMode(sessionId: string, sourceId: string, mode: SourcePermissionsMode) {
      const session = this.sessions.find(s => s.id === sessionId);
      const writePerms = session?.permissionsMode === 'Auto';
      const inheritedPermissions: DataSourcePermissions = {
        read: true,
        create: writePerms,
        update: writePerms,
        delete: writePerms,
      };
      const updatedSources = (session?.sources ?? []).map(s =>
        s.sourceId === sourceId
          ? {
              ...s,
              permissionsMode: mode,
              permissions: mode === 'inherit' ? inheritedPermissions : s.permissions,
            }
          : s,
      );
      this.sessions = this.sessions.map(s =>
        s.id === sessionId ? { ...s, sources: updatedSources } : s,
      );
      if (this.sessionMeta[sessionId]) {
        this.sessionMeta[sessionId].sources = updatedSources;
      }
    },

    // ── Session lifecycle ────────────────────────────────────────────────────

    async createSession(
      initialSources: SessionSource[] = [],
      permissionsMode: PermissionsMode = 'Ask',
      maxIterations = 10,
      setActive = true,
    ): Promise<string> {
      const title =
        initialSources.length > 0 ? initialSources.map(s => s.alias).join(', ') : 'New Session';
      const backend = await createAgentSession(title);
      const newSession: AgentSession = {
        id: backend.id,
        sources: initialSources,
        permissionsMode,
        messages: [],
        status: 'idle',
        maxIterations,
      };
      this.sessions = [...this.sessions, newSession];
      this.sessionMeta[backend.id] = {
        sources: initialSources,
        permissionsMode,
        maxIterations,
        title,
        updatedAt: backend.updated_at,
      };
      if (setActive) this.activeSessionId = backend.id;
      return backend.id;
    },

    setActiveSession(sessionId: string) {
      this.activeSessionId = sessionId;
    },

    async getOrCreateSession(sourcesToAttach: AttachedSource[] = []): Promise<string> {
      // Reuse the active session if it exists
      if (this.activeSessionId && this.sessions.some(s => s.id === this.activeSessionId)) {
        return this.activeSessionId;
      }

      // Compute initial session sources from provided attachedSources
      const sessionSources: SessionSource[] = [];
      for (const source of sourcesToAttach) {
        const tmpSession: AgentSession = {
          id: '',
          sources: sessionSources,
          permissionsMode: 'Ask',
          messages: [],
          status: 'idle',
          maxIterations: 10,
        };
        const updated = attachSourceToSession(tmpSession, source);
        sessionSources.push(...updated.sources.slice(sessionSources.length));
      }

      return this.createSession(sessionSources);
    },

    async getOrCreateSidebarSession(): Promise<string> {
      if (this.sidebarSessionId && this.sessions.some(s => s.id === this.sidebarSessionId)) {
        return this.sidebarSessionId;
      }
      const id = await this.createSession([], 'Ask', 10, false);
      this.sidebarSessionId = id;
      return id;
    },

    // ── Message management ───────────────────────────────────────────────────

    addMessage(sessionId: string, message: AgentMessage) {
      this.sessions = this.sessions.map(s =>
        s.id === sessionId ? { ...s, messages: [...s.messages, message] } : s,
      );
    },

    updateStreamingContent(sessionId: string, messageId: string, chunk: string) {
      this.sessions = this.sessions.map(s => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: s.messages.map(m =>
            m.id === messageId ? { ...m, content: m.content + chunk } : m,
          ),
        };
      });
    },

    updateStreamingThinking(sessionId: string, messageId: string, chunk: string) {
      this.sessions = this.sessions.map(s => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: s.messages.map(m =>
            m.id === messageId ? { ...m, thinking: (m.thinking ?? '') + chunk } : m,
          ),
        };
      });
    },

    setMessageStatus(sessionId: string, messageId: string, status: AgentMessageStatus) {
      this.sessions = this.sessions.map(s => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: s.messages.map(m => {
            if (m.id !== messageId) return m;
            const thinkingDuration =
              status === 'done' && m.thinking && m.status === 'streaming'
                ? Math.round((Date.now() - m.timestamp) / 1000)
                : m.thinkingDuration;
            return { ...m, status, thinkingDuration };
          }),
        };
      });
    },

    setMessageToolCalls(sessionId: string, messageId: string, toolCalls: Array<AgentToolCall>) {
      this.sessions = this.sessions.map(s => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: s.messages.map(m => (m.id === messageId ? { ...m, toolCalls } : m)),
        };
      });
    },

    removeOrphanedStreamingMessages(sessionId: string, finalizedMessageId: string) {
      this.sessions = this.sessions.map(s => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: s.messages.filter(
            m =>
              !(m.role === 'assistant' && m.status === 'streaming' && m.id !== finalizedMessageId),
          ),
        };
      });
    },

    updateToolCallStatus(
      sessionId: string,
      messageId: string,
      toolCallId: string,
      status: AgentToolCallStatus,
      result?: string,
      durationMs?: number,
    ) {
      const TOOL_RESULT_PREVIEW_CHARS = 200;
      let storedResult = result;
      let resultTruncated = false;
      let resultFullLength: number | undefined;
      if (result !== undefined && result.length > TOOL_RESULT_PREVIEW_CHARS) {
        this.toolResultFullBodies = { ...this.toolResultFullBodies, [toolCallId]: result };
        storedResult = result.slice(0, TOOL_RESULT_PREVIEW_CHARS);
        resultTruncated = true;
        resultFullLength = result.length;
      }
      this.sessions = this.sessions.map(s => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: s.messages.map(m => {
            if (m.id !== messageId || !m.toolCalls) return m;
            return {
              ...m,
              toolCalls: m.toolCalls.map(tc => {
                if (tc.id !== toolCallId) return tc;
                return {
                  ...tc,
                  status,
                  ...(storedResult !== undefined ? { result: storedResult } : {}),
                  ...(resultTruncated ? { resultTruncated: true, resultFullLength } : {}),
                  ...(durationMs !== undefined ? { durationMs } : {}),
                };
              }),
            };
          }),
        };
      });
    },

    insertCompactionMarker(sessionId: string, payload: CompactionMarkerInsertPayload) {
      const trigger: CompactionMarker['trigger'] = payload.trigger === 'manual' ? 'manual' : 'auto';
      const fallbackSummary =
        payload.fallback_keep_pairs != null
          ? `\n\nDeep compaction fallback applied (keep_pairs=${payload.fallback_keep_pairs}).`
          : '';
      const summary = `Compaction removed ${payload.removed_count} messages.${fallbackSummary}`;

      const marker: AgentMessage = {
        id: `compaction-${sessionId}-${Date.now()}`,
        role: 'system',
        content: '',
        status: 'done',
        timestamp: Date.now(),
        compaction: {
          summary,
          preTokens: payload.pre_tokens,
          postTokens: payload.post_tokens,
          trigger,
        },
      };

      this.sessions = this.sessions.map(s =>
        s.id === sessionId ? { ...s, messages: [...s.messages, marker] } : s,
      );
    },

    replaceCompactionInProgressWithMarker(
      sessionId: string,
      payload: CompactionMarkerInsertPayload,
    ) {
      const trigger: CompactionMarker['trigger'] = payload.trigger === 'manual' ? 'manual' : 'auto';
      const fallbackSummary =
        payload.fallback_keep_pairs != null
          ? `\n\nDeep compaction fallback applied (keep_pairs=${payload.fallback_keep_pairs}).`
          : '';
      const summary = `Compaction removed ${payload.removed_count} messages.${fallbackSummary}`;

      this.sessions = this.sessions.map(s => {
        if (s.id !== sessionId) return s;
        let found = false;
        const messages = s.messages.map(m => {
          if (m.id === `compacting-${sessionId}`) {
            found = true;
            return {
              ...m,
              id: `compaction-${sessionId}-${Date.now()}`,
              compactionInProgress: false,
              status: 'done' as AgentMessageStatus,
              compaction: {
                summary,
                preTokens: payload.pre_tokens,
                postTokens: payload.post_tokens,
                trigger,
              },
            };
          }
          return m;
        });

        if (!found) {
          messages.push({
            id: `compaction-${sessionId}-${Date.now()}`,
            role: 'system',
            content: '',
            status: 'done',
            timestamp: Date.now(),
            compaction: {
              summary,
              preTokens: payload.pre_tokens,
              postTokens: payload.post_tokens,
              trigger,
            },
          });
        }
        return { ...s, messages };
      });
    },

    getToolResultFullBody(toolCallId: string): string | undefined {
      return this.toolResultFullBodies[toolCallId];
    },

    insertPreparingPlaceholder(sessionId: string) {
      const placeholderId = `preparing-${sessionId}`;
      this.sessions = this.sessions.map(s => {
        if (s.id !== sessionId) return s;
        if (s.messages.some(m => m.id === placeholderId)) return s;
        return {
          ...s,
          messages: [
            ...s.messages,
            {
              id: placeholderId,
              role: 'system' as AgentMessageRole,
              content: '',
              status: 'streaming' as AgentMessageStatus,
              timestamp: Date.now(),
              preparingInProgress: true,
            },
          ],
        };
      });
    },

    removePreparingPlaceholder(sessionId: string) {
      const placeholderId = `preparing-${sessionId}`;
      this.sessions = this.sessions.map(s => {
        if (s.id !== sessionId) return s;
        if (!s.messages.some(m => m.id === placeholderId)) return s;
        return { ...s, messages: s.messages.filter(m => m.id !== placeholderId) };
      });
    },

    setSessionProgress(sessionId: string, partial: Partial<Omit<SessionProgress, 'updatedAt'>>) {
      const existing = this.sessionProgress[sessionId];
      this.sessionProgress = {
        ...this.sessionProgress,
        [sessionId]: {
          ...existing,
          ...partial,
          updatedAt: Date.now(),
        } as SessionProgress,
      };
    },

    clearSessionProgress(sessionId: string) {
      const { [sessionId]: _removed, ...rest } = this.sessionProgress;
      this.sessionProgress = rest;
    },

    setSessionStatus(sessionId: string, status: AgentSessionStatus) {
      this.sessions = this.sessions.map(s => (s.id === sessionId ? { ...s, status } : s));
      if (status !== 'error') {
        const { [sessionId]: _removed, ...rest } = this.sessionErrors;
        this.sessionErrors = rest;
      }
      if (status === 'idle' || status === 'stopped' || status === 'error') {
        this.clearSessionProgress(sessionId);
        this.removePreparingPlaceholder(sessionId);
      }
      updateSessionStatus(sessionId, status === 'stopped' ? 'idle' : status).catch(() => undefined);
    },

    setSessionError(sessionId: string, error: string) {
      this.sessionErrors = { ...this.sessionErrors, [sessionId]: error };
    },

    clearSessionError(sessionId: string) {
      const { [sessionId]: _removed, ...rest } = this.sessionErrors;
      this.sessionErrors = rest;
    },

    getSessionError(sessionId: string): string | undefined {
      return this.sessionErrors[sessionId];
    },

    setSessionStopped(sessionId: string, reason: AgentSessionStopReason, message: string) {
      this.sessions = this.sessions.map(s =>
        s.id === sessionId
          ? {
              ...s,
              status: 'stopped' as AgentSessionStatus,
              stopReason: reason,
              stopMessage: message,
            }
          : s,
      );
      this.clearSessionProgress(sessionId);
      updateSessionStatus(sessionId, 'idle').catch(() => undefined);
    },

    clearSessionStop(sessionId: string) {
      this.sessions = this.sessions.map(s =>
        s.id === sessionId ? { ...s, stopReason: undefined, stopMessage: undefined } : s,
      );
    },

    setSessionMaxIterations(sessionId: string, maxIterations: number) {
      this.sessions = this.sessions.map(s => (s.id === sessionId ? { ...s, maxIterations } : s));
      if (this.sessionMeta[sessionId]) {
        this.sessionMeta[sessionId].maxIterations = maxIterations;
      }
    },

    setSessionModelId(sessionId: string, modelId: string | null) {
      if (this.sessionMeta[sessionId]) {
        this.sessionMeta[sessionId].modelId = modelId;
      }
    },

    async reloadSessionMessages(sessionId: string) {
      const backendMessages = await loadSessionMessages(sessionId).catch(
        () => [] as BackendAgentMessage[],
      );
      const existing = this.sessions.find(s => s.id === sessionId)?.messages ?? [];
      const existingById = new Map(existing.map(m => [m.id, m]));
      const messages: Array<AgentMessage> = dedupAdjacentCompactions(
        backendMessages.map(msg => {
          const hydrated = hydrateMessage(msg);
          const inMemory = existingById.get(hydrated.id);
          if (!inMemory) return hydrated;
          return {
            ...hydrated,
            toolCalls: inMemory.toolCalls ?? hydrated.toolCalls,
            status: inMemory.status ?? hydrated.status,
          };
        }),
      );
      this.sessions = this.sessions.map(s => (s.id === sessionId ? { ...s, messages } : s));
    },

    // ── Confirmation rules ───────────────────────────────────────────────────

    findConfirmationRule(sessionId: string, toolName: string): ConfirmationRule | undefined {
      return this.confirmationRules.find(r => r.sessionId === sessionId && r.toolName === toolName);
    },

    addConfirmationRule(rule: ConfirmationRule) {
      const index = this.confirmationRules.findIndex(
        r => r.sessionId === rule.sessionId && r.toolName === rule.toolName,
      );
      if (index !== -1) {
        this.confirmationRules = this.confirmationRules.map((r, i) => (i === index ? rule : r));
      } else {
        this.confirmationRules = [...this.confirmationRules, rule];
      }
    },

    // ── Session CRUD ─────────────────────────────────────────────────────────

    async clearSession(sessionId: string) {
      await clearAgentSessionMessages(sessionId);
      const session = this.sessions.find(s => s.id === sessionId);
      const toolCallIds = (session?.messages ?? []).flatMap(m =>
        (m.toolCalls ?? []).map(tc => tc.id),
      );
      this.sessions = this.sessions.map(s =>
        s.id === sessionId ? { ...s, messages: [], status: 'idle' } : s,
      );
      this.clearSessionError(sessionId);
      if (toolCallIds.length > 0) {
        const next = { ...this.toolResultFullBodies };
        toolCallIds.forEach(id => delete next[id]);
        this.toolResultFullBodies = next;
      }
    },

    async loadSessions() {
      const backendSessions = await loadAgentSessions();
      const loaded = await Promise.all(
        backendSessions.map(async (s: BackendAgentSession) => {
          const raw = this.sessionMeta[s.id] as
            | (SessionMeta & { connectionId?: number })
            | undefined;
          const backendMessages = await loadSessionMessages(s.id).catch(
            () => [] as BackendAgentMessage[],
          );
          const messages: Array<AgentMessage> = dedupAdjacentCompactions(
            backendMessages.map(hydrateMessage),
          );
          const sources: SessionSource[] = raw?.sources ?? [];
          return {
            id: s.id,
            sources,
            permissionsMode: raw?.permissionsMode ?? ('Ask' as PermissionsMode),
            messages,
            status: s.status as AgentSessionStatus,
            maxIterations: raw?.maxIterations ?? 10,
          };
        }),
      );
      this.sessions = loaded;
      if (backendSessions.length > 0) {
        const stillValid =
          this.activeSessionId && this.sessions.some(s => s.id === this.activeSessionId);
        if (!stillValid) {
          this.activeSessionId = backendSessions[0].id;
        }
      }
    },

    async removeSession(sessionId: string) {
      await deleteAgentSession(sessionId).catch(() => undefined);
      this.sessions = this.sessions.filter(s => s.id !== sessionId);
      const { [sessionId]: _, ...rest } = this.sessionMeta;
      this.sessionMeta = rest;
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = this.sessions[0]?.id;
      }
    },
  },
});
