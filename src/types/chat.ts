/**
 * Unified Chat Types
 *
 * Common types for both sidebar assistant chat and data studio chat.
 * Supports agent-powered conversations with tool calling, streaming, and markdown.
 */

import type { AgentToolCall } from '@/store/dataStudioStore';

export type ChatMessageStatus = 'pending' | 'streaming' | 'sending' | 'done' | 'error';

export type ChatMessageRole = 'user' | 'assistant' | 'tool';

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
  timestamp: number;

  // Agent features (optional for simpler use cases)
  thinking?: string;
  thinkingDuration?: number;
  toolCalls?: Array<AgentToolCall>;
  toolCallId?: string;
};

export type ChatSessionStatus = 'idle' | 'running' | 'waiting_confirmation' | 'error';

export type ChatSession = {
  id: string;
  connectionId?: number;
  messages: Array<ChatMessage>;
  status: ChatSessionStatus;
  schema?: string;
  maxIterations: number;
};

export type ChatContextConfig = {
  // Connection info (for database operations)
  connectionId?: number;
  connectionConfig?: Record<string, unknown>;
  databaseType?: 'ELASTICSEARCH' | 'OPENSEARCH' | 'EASYSEARCH' | 'DYNAMODB' | 'MONGODB';

  // Schema info
  schema?: string;

  // Active panel context (for sidebar)
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
  // Feature flags
  enableToolCalls: boolean;
  enableConfirmations: boolean;
  autoApproveSafe: boolean;

  // Permissions
  permissions: ChatPermissions;

  // Context
  context: ChatContextConfig;

  // Model settings
  maxIterations: number;
};

export type ChatMessageType = 'sidebar' | 'dataStudio';

export type SendMessageOptions = {
  content: string;
  connectionId?: number;
  context?: ChatContextConfig;
};
