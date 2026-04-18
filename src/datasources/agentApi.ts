import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { jsonify } from '../common';

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

  getAvailableTools: async (params: {
    databaseType: string;
    read: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  }): Promise<ToolsResponse> => {
    const result = await invoke<string>('get_available_tools', params);
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

export { agentApi };
