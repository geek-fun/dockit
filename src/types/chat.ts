import type { AgentToolCall, ConfirmationRule } from '@/store/dataStudioStore';

export type ChatMessageStatus = 'pending' | 'streaming' | 'sending' | 'done' | 'error';

export type ChatMessageRole = 'user' | 'assistant' | 'tool';

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
};

export type ChatSessionStatus = 'idle' | 'running' | 'waiting_confirmation' | 'error';

export type ChatSession = {
  id: string;
  messages: Array<ChatMessage>;
  status: ChatSessionStatus;
  schema?: string;
  sources?: import('@/store/dataStudioStore').SessionSource[];
  maxIterations: number;
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
