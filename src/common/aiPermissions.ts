import { invoke } from '@tauri-apps/api/core';

export const AI_ACTIONS = ['read', 'create', 'update', 'delete', 'manage'] as const;
export type AiAction = (typeof AI_ACTIONS)[number];
export type AiPermissions = Partial<Record<AiAction, boolean>>;
export type AccessDenial = {
  kind: 'permission' | 'rule' | 'user' | 'unavailable' | 'invalid_input';
  source: 'system' | 'connection' | 'conversation' | 'rule' | 'unknown';
  message: string;
  connectionId?: string;
  sourceId?: string;
  action?: AiAction;
};
export type AiPolicy = {
  permission_defaults: AiPermissions;
  connection_permissions: Record<string, AiPermissions>;
};
export const getAiPolicy = () => invoke<AiPolicy>('get_ai_permissions');
export const saveAiPermissions = (connectionId: string, permissions: AiPermissions) =>
  invoke<AiPolicy>('save_ai_permissions', { connectionId, permissions });
export const resolveAiPermissions = (
  defaults: AiPermissions,
  connection: AiPermissions = {},
): AiPermissions =>
  Object.fromEntries(
    AI_ACTIONS.map(action => [action, connection[action] ?? defaults[action] ?? false]),
  );
export const aiPreset = (value: string): AiPermissions =>
  value === 'inherit'
    ? {}
    : Object.fromEntries(
        AI_ACTIONS.map(action => [
          action,
          value === 'full' ||
            (value === 'read' && action === 'read') ||
            (value === 'data' && action !== 'manage'),
        ]),
      );
