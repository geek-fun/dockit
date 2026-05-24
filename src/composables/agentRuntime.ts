import { ulid } from 'ulidx';
import {
  confirmToolCall as invokeConfirmToolCall,
  onAgentLoopDelta,
  onAgentLoopThinkingDelta,
  onAgentLoopToolCall,
  onAgentLoopToolResult,
  onAgentLoopStepDone,
  onAgentLoopDone,
  onAgentLoopStopped,
  onAgentLoopError,
  onAgentLoopSummaryInjected,
  onAgentLoopIteration,
  onAgentLoopWaitingLlm,
  onAgentLoopCompacting,
  onAgentLoopWarning,
} from '@/datasources/agentApi';
import {
  useDataStudioStore,
  type AgentSession,
  type AgentToolCall,
  type AgentSessionStopReason,
} from '@/store/dataStudioStore';
import type { ToolDefinition, ToolMetadata } from '@/datasources/agentApi';

type SessionRuntime = {
  tools?: Array<ToolDefinition>;
  metadata?: Record<string, ToolMetadata>;
};

const sessionRuntime = new Map<string, SessionRuntime>();

let runtimeInitPromise: Promise<void> | null = null;
let runtimeInitialized = false;
let runtimeDisposed = false;
let runtimeUnlisteners: Array<() => void> = [];

const getSessionRuntime = (sessionId: string): SessionRuntime => {
  if (!sessionRuntime.has(sessionId)) {
    sessionRuntime.set(sessionId, {});
  }
  return sessionRuntime.get(sessionId)!;
};

const clearSessionRuntime = (sessionId: string) => {
  sessionRuntime.delete(sessionId);
};

const getSessionById = (
  sessions: Array<AgentSession>,
  sessionId: string,
): AgentSession | undefined => sessions.find(session => session.id === sessionId);

const getPendingConfirmation = (sessionId: string, toolName: string) => {
  const store = useDataStudioStore();
  return store.findConfirmationRule(sessionId, toolName);
};

const shouldRequireConfirmation = (
  session: AgentSession,
  toolName: string,
  riskLevel: AgentToolCall['riskLevel'],
): boolean => {
  const rule = getPendingConfirmation(session.id, toolName);
  if (rule?.action === 'allow_always' || rule?.action === 'deny_always') {
    return false;
  }
  if (riskLevel === 'safe') return false;
  if (riskLevel === 'destructive') return true;
  return session.permissionsMode !== 'Auto';
};

const isDeniedByRule = (sessionId: string, toolName: string): boolean =>
  getPendingConfirmation(sessionId, toolName)?.action === 'deny_always';

const initAgentRuntime = async (): Promise<void> => {
  if (runtimeInitialized) return;
  if (runtimeInitPromise) return runtimeInitPromise;

  runtimeDisposed = false;

  runtimeInitPromise = Promise.all([
    onAgentLoopDelta(({ session_id, content }) => {
      const store = useDataStudioStore();
      const session = getSessionById(store.sessions, session_id);
      if (!session) return;

      const streamingMsg = [...session.messages]
        .reverse()
        .find(message => message.role === 'assistant' && message.status === 'streaming');

      if (streamingMsg) {
        store.updateStreamingContent(session_id, streamingMsg.id, content);
        return;
      }

      const lastAssistant = [...session.messages]
        .reverse()
        .find(message => message.role === 'assistant');
      const hasUnresolvedTools = lastAssistant?.toolCalls?.some(
        toolCall => toolCall.status === 'executing' || toolCall.status === 'pending',
      );

      if (!hasUnresolvedTools) {
        store.addMessage(session_id, {
          id: ulid(),
          role: 'assistant',
          content,
          status: 'streaming',
          timestamp: Date.now(),
        });
      }
    }),
    onAgentLoopThinkingDelta(({ session_id, content }) => {
      const store = useDataStudioStore();
      const session = getSessionById(store.sessions, session_id);
      if (!session) return;

      const streamingMsg = [...session.messages]
        .reverse()
        .find(message => message.role === 'assistant' && message.status === 'streaming');

      if (streamingMsg) {
        store.updateStreamingThinking(session_id, streamingMsg.id, content);
        return;
      }

      store.addMessage(session_id, {
        id: ulid(),
        role: 'assistant',
        content: '',
        thinking: content,
        status: 'streaming',
        timestamp: Date.now(),
      });
    }),
    onAgentLoopToolCall(({ session_id, tool_call_id, tool_name, arguments: args }) => {
      const store = useDataStudioStore();
      const session = getSessionById(store.sessions, session_id);
      if (!session) return;

      const runtime = getSessionRuntime(session_id);
      const riskLevel = runtime.metadata?.[tool_name]?.riskLevel ?? 'elevated';
      const needsConfirmation = shouldRequireConfirmation(session, tool_name, riskLevel);
      const denied = isDeniedByRule(session_id, tool_name);

      const toolCall: AgentToolCall = {
        id: tool_call_id,
        toolName: tool_name,
        args: (args ?? {}) as Record<string, unknown>,
        status: denied ? 'denied' : needsConfirmation ? 'pending' : 'executing',
        riskLevel,
        requiresConfirmation: needsConfirmation,
      };

      const streamingAssistant = [...session.messages]
        .reverse()
        .find(message => message.role === 'assistant' && message.status === 'streaming');
      const lastAssistant =
        streamingAssistant ??
        [...session.messages].reverse().find(message => message.role === 'assistant');

      if (lastAssistant) {
        store.setMessageToolCalls(session_id, lastAssistant.id, [
          ...(lastAssistant.toolCalls ?? []),
          toolCall,
        ]);
      } else {
        store.addMessage(session_id, {
          id: ulid(),
          role: 'assistant',
          content: '',
          status: 'streaming',
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
        store.setSessionStatus(session_id, 'waiting_confirmation');
      }
    }),
    onAgentLoopToolResult(({ session_id, tool_call_id, envelope, error }) => {
      const store = useDataStudioStore();
      const session = getSessionById(store.sessions, session_id);
      if (!session) return;

      const assistantMsg = [...session.messages]
        .reverse()
        .find(
          message =>
            message.role === 'assistant' &&
            message.toolCalls?.some(toolCall => toolCall.id === tool_call_id),
        );

      if (assistantMsg) {
        store.updateToolCallStatus(
          session_id,
          assistantMsg.id,
          tool_call_id,
          error ? 'error' : 'done',
          envelope.summary,
          envelope.metadata?.duration_ms,
        );
      }
    }),
    onAgentLoopStepDone(({ session_id }) => {
      const store = useDataStudioStore();
      const session = getSessionById(store.sessions, session_id);
      if (!session) return;

      const streamingMsg = [...session.messages]
        .reverse()
        .find(message => message.role === 'assistant' && message.status === 'streaming');

      if (streamingMsg) {
        store.setMessageStatus(session_id, streamingMsg.id, 'done');
        store.removeOrphanedStreamingMessages(session_id, streamingMsg.id);
      }
    }),
    onAgentLoopDone(({ session_id }) => {
      const store = useDataStudioStore();
      const session = getSessionById(store.sessions, session_id);
      if (session) {
        session.messages
          .filter(message => message.role === 'assistant' && message.status === 'streaming')
          .forEach(message => store.setMessageStatus(session_id, message.id, 'done'));
      }

      store.setSessionStatus(session_id, 'idle');
      store.clearSessionError(session_id);
    }),
    onAgentLoopStopped(({ session_id, reason, message }) => {
      const store = useDataStudioStore();
      const validReasons: Array<AgentSessionStopReason> = [
        'iteration_cap',
        'wall_clock_budget',
        'token_budget',
        'llm_error',
      ];
      const normalized = validReasons.includes(reason as AgentSessionStopReason)
        ? (reason as AgentSessionStopReason)
        : 'iteration_cap';

      store.setSessionStopped(session_id, normalized, message);
      store.clearSessionError(session_id);
    }),
    onAgentLoopError(({ session_id, error }) => {
      const store = useDataStudioStore();
      const session = getSessionById(store.sessions, session_id);

      store.setSessionError(session_id, error);
      store.setSessionStatus(session_id, 'error');

      if (!session) return;

      const streamingMsg = [...session.messages]
        .reverse()
        .find(message => message.role === 'assistant' && message.status === 'streaming');

      if (streamingMsg) {
        store.setMessageStatus(session_id, streamingMsg.id, 'error');
      }
    }),
    onAgentLoopSummaryInjected(payload => {
      const store = useDataStudioStore();
      const session = getSessionById(store.sessions, payload.session_id);
      if (!session) return;

      store.replaceCompactionInProgressWithMarker(payload.session_id, {
        trigger: payload.trigger,
        pre_tokens: payload.pre_tokens,
        post_tokens: payload.post_tokens,
        removed_count: payload.removed_count,
        fallback_keep_pairs: payload.fallback_keep_pairs,
      });
    }),
    onAgentLoopIteration(({ session_id, iter_count, max_iterations }) => {
      const store = useDataStudioStore();
      store.setSessionProgress(session_id, {
        phase: 'iterating',
        iter: iter_count,
        maxIter: max_iterations,
      });
    }),
    onAgentLoopWaitingLlm(({ session_id, iter_count }) => {
      const store = useDataStudioStore();
      store.setSessionProgress(session_id, {
        phase: 'waiting_llm',
        iter: iter_count,
      });
    }),
    onAgentLoopCompacting(({ session_id, phase }) => {
      const store = useDataStudioStore();
      if (phase === 'start') {
        store.setSessionProgress(session_id, { phase: 'compacting' });
        store.addMessage(session_id, {
          id: 'compacting-' + session_id,
          role: 'system',
          content: '',
          timestamp: Date.now(),
          status: 'streaming',
          compactionInProgress: true,
        });
      } else if (phase === 'end') {
        const existing = store.getSessionProgress(session_id);
        store.setSessionProgress(session_id, {
          phase: 'iterating',
          iter: existing?.iter,
          maxIter: existing?.maxIter,
        });
      }
    }),
    onAgentLoopWarning(({ session_id, warning }) => {
      console.warn(`[AgentLoop] session ${session_id} warning:`, warning);
    }),
  ])
    .then(unlisteners => {
      if (runtimeDisposed) {
        unlisteners.forEach(unlisten => unlisten());
        return;
      }
      runtimeUnlisteners = unlisteners;
      runtimeInitialized = true;
    })
    .finally(() => {
      runtimeInitPromise = null;
    });

  return runtimeInitPromise;
};

const disposeAgentRuntime = () => {
  runtimeDisposed = true;
  runtimeUnlisteners.forEach(unlisten => unlisten());
  runtimeUnlisteners = [];
  runtimeInitialized = false;
  sessionRuntime.clear();
};

export { initAgentRuntime, disposeAgentRuntime, getSessionRuntime, clearSessionRuntime };
