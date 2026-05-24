import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { jsonify } from '../common';

export type AgentSession = {
  id: string;
  title: string;
  status: 'idle' | 'running' | 'error';
  created_at: number;
  updated_at: number;
};

export type AgentMessage = {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: number;
};

export type ToolResultMetadata = {
  tool_name: string;
  duration_ms: number;
  truncated: boolean;
};

export type ToolEnvelope = {
  summary: string;
  full_result?: string;
  metadata?: ToolResultMetadata;
};

export type AgentDeltaEvent = {
  requestId: string;
  content: string;
};

export type AgentToolCallEvent = {
  requestId: string;
  id: string;
  name: string;
  arguments: string;
};

export type AgentStepDoneEvent = {
  requestId: string;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
};

export type AgentStepResult = {
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
  toolCalls: Array<AgentToolCallEvent>;
};

export type ToolFunction = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ToolDefinition = {
  type: 'function';
  function: ToolFunction;
};

export type ToolMetadata = {
  riskLevel: 'safe' | 'elevated' | 'destructive';
  requiredPermission: string;
};

export type ToolsResponse = {
  tools: Array<ToolDefinition>;
  metadata: Record<string, ToolMetadata>;
};

export type MultiSourceToolPermissions = {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
};

const agentApi = {
  runAgentStep: async (params: {
    requestId: string;
    provider: string;
    model: string;
    messages: Array<Record<string, unknown>>;
    tools: Array<ToolDefinition>;
    httpProxy?: string;
    apiKey: string;
    baseUrl?: string;
  }): Promise<AgentStepResult> => {
    const result = await invoke<string>('run_agent_step', params);
    return jsonify.parse(result) as AgentStepResult;
  },

  executeTool: async (params: {
    toolName: string;
    arguments: string;
    connectionConfig: Record<string, unknown>;
  }): Promise<string> => {
    return await invoke<string>('execute_tool', params);
  },

  introspectSchema: async (params: {
    connectionConfig: Record<string, unknown>;
    databaseType: string;
  }): Promise<string> => {
    return await invoke<string>('introspect_schema', params);
  },

  getAllTools: async (): Promise<ToolsResponse> => {
    const result = await invoke<string>('get_all_tools');
    return jsonify.parse(result) as ToolsResponse;
  },

  onAgentDelta: (callback: (event: AgentDeltaEvent) => void): Promise<() => void> => {
    return listen<string>('agent-delta', event => {
      callback(jsonify.parse(event.payload) as AgentDeltaEvent);
    });
  },

  onAgentToolCall: (callback: (event: AgentToolCallEvent) => void): Promise<() => void> => {
    return listen<string>('agent-tool-call', event => {
      callback(jsonify.parse(event.payload) as AgentToolCallEvent);
    });
  },

  onAgentStepDone: (callback: (event: AgentStepDoneEvent) => void): Promise<() => void> => {
    return listen<string>('agent-step-done', event => {
      callback(jsonify.parse(event.payload) as AgentStepDoneEvent);
    });
  },
};

const loadAgentSessions = () => invoke<AgentSession[]>('load_agent_sessions');
const createAgentSession = (title: string) =>
  invoke<AgentSession>('create_agent_session', { title });
const updateSessionStatus = (sessionId: string, status: string) =>
  invoke<void>('update_session_status', { sessionId, status });
const deleteAgentSession = (sessionId: string) =>
  invoke<void>('delete_agent_session', { sessionId });
const clearAgentSessionMessages = (sessionId: string) =>
  invoke<void>('clear_agent_session_messages', { sessionId });
const loadSessionMessages = (sessionId: string) =>
  invoke<AgentMessage[]>('load_session_messages', { sessionId });
const exportAgentSession = (sessionId: string) =>
  invoke<unknown>('export_agent_session', { sessionId });
const importAgentSession = (data: unknown) =>
  invoke<AgentSession>('import_agent_session', { data });

const validateLlmConfig = (params: {
  provider: string;
  apiKey: string;
  model: string;
  httpProxy?: string;
  baseUrl?: string;
}): Promise<boolean> => invoke<boolean>('validate_llm_config', params);

const runAgentLoop = (sessionId: string, userMessage: string, settings: unknown) =>
  invoke<void>('run_agent_loop', { sessionId, userMessage, settings });
const cancelAgentLoop = (sessionId: string) => invoke<void>('cancel_agent_loop', { sessionId });
const confirmToolCall = (toolCallId: string, allowed: boolean) =>
  invoke<void>('confirm_tool_call', { toolCallId, allowed });
const getToolFullResult = (toolCallId: string) =>
  invoke<string>('get_tool_full_result', { toolCallId });

const onAgentLoopDelta = (handler: (payload: { session_id: string; content: string }) => void) =>
  listen('agent-loop-delta', e => handler(e.payload as { session_id: string; content: string }));

const onAgentLoopThinkingDelta = (
  handler: (payload: { session_id: string; content: string }) => void,
) =>
  listen('agent-loop-thinking-delta', e =>
    handler(e.payload as { session_id: string; content: string }),
  );

const onAgentLoopToolCall = (
  handler: (payload: {
    session_id: string;
    tool_call_id: string;
    tool_name: string;
    arguments: unknown;
  }) => void,
) => listen('agent-loop-tool-call', e => handler(e.payload as any));

const onAgentLoopToolResult = (
  handler: (payload: {
    session_id: string;
    tool_call_id: string;
    envelope: ToolEnvelope;
    error?: boolean;
  }) => void,
) => listen('agent-loop-tool-result', e => handler(e.payload as any));

const onAgentLoopStepDone = (
  handler: (payload: { session_id: string; message_id: string }) => void,
) => listen('agent-loop-step-done', e => handler(e.payload as any));

const onAgentLoopDone = (handler: (payload: { session_id: string }) => void) =>
  listen('agent-loop-done', e => handler(e.payload as any));

const onAgentLoopStopped = (
  handler: (payload: { session_id: string; reason: string; message: string }) => void,
) => listen('agent-loop-stopped', e => handler(e.payload as any));

const onAgentLoopError = (handler: (payload: { session_id: string; error: string }) => void) =>
  listen('agent-loop-error', e => handler(e.payload as any));

const onAgentLoopSummaryInjected = (
  handler: (payload: {
    session_id: string;
    trigger: string;
    pre_tokens: number;
    post_tokens: number;
    removed_count: number;
    fallback_keep_pairs?: number;
  }) => void,
) => listen('agent-loop-summary-injected', e => handler(e.payload as any));

const onAgentLoopIteration = (
  handler: (payload: { session_id: string; iter_count: number; max_iterations: number }) => void,
) => listen('agent-loop-iteration', e => handler(e.payload as any));

const onAgentLoopWaitingLlm = (
  handler: (payload: { session_id: string; iter_count: number }) => void,
) => listen('agent-loop-waiting-llm', e => handler(e.payload as any));

const onAgentLoopCompacting = (
  handler: (payload: { session_id: string; phase: 'start' | 'end' }) => void,
) => listen('agent-loop-compacting', e => handler(e.payload as any));

const onAgentLoopWarning = (handler: (payload: { session_id: string; warning: string }) => void) =>
  listen('agent-loop-warning', e => handler(e.payload as any));

export type ContextUsage = {
  session_id: string;
  used_tokens: number;
  capacity: number;
  context_window: number;
  output_reserve: number;
  trigger_at: number;
  should_compact: boolean;
  model: string;
};

const compactAgentSession = (sessionId: string, settings: unknown) =>
  invoke<ContextUsage>('compact_agent_session', { sessionId, settings });

const getAgentContextUsage = (sessionId: string, settings: unknown) =>
  invoke<ContextUsage>('get_agent_context_usage', { sessionId, settings });

const onAgentContextUsage = (handler: (payload: ContextUsage) => void) =>
  listen('agent-context-usage', e => handler(e.payload as ContextUsage));

export {
  agentApi,
  validateLlmConfig,
  loadAgentSessions,
  createAgentSession,
  updateSessionStatus,
  deleteAgentSession,
  clearAgentSessionMessages,
  loadSessionMessages,
  exportAgentSession,
  importAgentSession,
  runAgentLoop,
  cancelAgentLoop,
  confirmToolCall,
  getToolFullResult,
  compactAgentSession,
  getAgentContextUsage,
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
  onAgentContextUsage,
};
