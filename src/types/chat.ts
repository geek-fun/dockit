import type { AgentToolCall, CompactionMarker, ConfirmationRule } from '@/store/dataStudioStore';

export type ChatMessageStatus = 'pending' | 'streaming' | 'sending' | 'done' | 'error';

export type ChatMessageRole = 'user' | 'assistant' | 'tool' | 'system';

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
  timestamp: number;

  thinking?: string;
  thinkingDuration?: number;
  toolCalls?: Array<AgentToolCall>;
  toolCallId?: string;
  compaction?: CompactionMarker;
};

export type ChatSessionStatus = 'idle' | 'running' | 'waiting_confirmation' | 'error' | 'stopped';

export type ChatSessionStopReason = 'iteration_cap' | 'wall_clock_budget' | 'token_budget' | 'llm_error';

export type ChatSession = {
  id: string;
  messages: Array<ChatMessage>;
  status: ChatSessionStatus;
  schema?: string;
  sources?: import('@/store/dataStudioStore').SessionSource[];
  maxIterations: number;
  stopReason?: ChatSessionStopReason;
  stopMessage?: string;
};

export type ChatContextConfig = {
  connections?: Record<string, Record<string, unknown>>;
  databaseTypes?: Record<string, string>;

  databaseType?: string;

  schema?: string;

  activePanel?: {
    connectionType?: string;
    indexName?: string;
    tableName?: string;
    editorContent?: string;
  };
};

export type ChatPermissions = {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
};

export type ChatConfig = {
  enableToolCalls: boolean;
  enableConfirmations: boolean;
  autoApproveSafe: boolean;

  permissions: ChatPermissions;

  context: ChatContextConfig;

  maxIterations: number;
};

export type ChatMessageType = 'sidebar' | 'dataStudio';

export type SendMessageOptions = {
  content: string;
  context?: ChatContextConfig;
};

export type { ConfirmationRule };
