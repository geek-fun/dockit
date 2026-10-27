import type { AiPermissions } from './aiPermissions';

export const buildAgentModeInstructions = (auto: boolean): string[] => [
  `## Mode: ${auto ? 'AUTO' : 'ASK'}`,
  'Permitted read-only queries and metadata reads execute automatically in both modes.',
  auto
    ? 'Ordinary permitted inserts and updates execute automatically in AUTO mode.'
    : 'Ordinary permitted inserts and updates require approval in ASK mode.',
  'All permitted deletes and structure/administration changes require approval in both modes, including creating or dropping indices, tables, collections, and their settings. Payloads that can delete data or manage structure, including scripted Elasticsearch updates and write aggregation pipelines, follow this approval flow unless a saved Always Allow rule applies.',
  'Submit the tool call so the application can apply current permissions and saved confirmation rules and display any required approval card. Do not substitute a conversational approval question for that card.',
  'Approval does not grant a denied permission. If an action is blocked or rejected, do not retry it or use another tool to bypass the decision. Wait for an explicit user request to retry.',
];

export const buildAgentPermissionInstructions = (
  sources: Array<{ connectionId: string; permissions?: AiPermissions }>,
): string[] => [
  '## Current DocKit AI permissions',
  'This snapshot is refreshed for this request and resolves connection decisions, system AI defaults, and conversation restrictions. System AI defaults are application settings, not operating-system or database privileges. An explicit connection decision takes priority over a system default.',
  ...sources.map(({ connectionId, permissions }) => {
    if (!permissions)
      return `- ${connectionId}: permissions unavailable; the application must check access.`;
    const actions = Object.entries(permissions);
    const allowed =
      actions
        .filter(([, value]) => value)
        .map(([action]) => action)
        .join(', ') || 'none';
    const denied =
      actions
        .filter(([, value]) => !value)
        .map(([action]) => action)
        .join(', ') || 'none';
    return `- ${connectionId}: allowed actions: ${allowed}; denied actions: ${denied}.`;
  }),
  'Permission failures in earlier tool results are historical. They do not prove current denial after settings change. Never claim a new attempt failed without a new tool result from this turn.',
  'When the user explicitly asks to retry and current permissions allow the action, submit a fresh tool call and let the application recheck access and request any required approval. Do not repeat an earlier denial as the result of a new attempt.',
];

export type ConnectionPrompt = {
  alias: string;
  prompt: string;
};

export type SystemPromptLayers = {
  /** L1: developer-defined base prompt (built by buildSystemPrompt). Always first. */
  base: string;
  /** L2: user-configured global prompt from chat settings. Optional. */
  userGlobal?: string;
  /** L3: per-connection prompts for the attached sources. Optional. */
  connectionPrompts?: Array<ConnectionPrompt>;
  /** Sidebar assistant context (database/index/editor content). Always last. */
  sidebarContext?: string;
};

const NON_EMPTY_SEPARATOR = '\n\n';

const isNonEmpty = (value: string | undefined | null): value is string => Boolean(value?.trim());

export const assembleSystemPrompt = (layers: SystemPromptLayers): string => {
  const parts: Array<string> = [layers.base];

  if (isNonEmpty(layers.userGlobal)) {
    parts.push(layers.userGlobal.trim());
  }

  const prompts = (layers.connectionPrompts ?? []).filter(p => isNonEmpty(p.prompt));
  const labeled = prompts.length > 1;
  for (const { alias, prompt } of prompts) {
    parts.push(labeled ? `## Connection Context: ${alias}\n\n${prompt.trim()}` : prompt.trim());
  }

  if (isNonEmpty(layers.sidebarContext)) {
    parts.push(layers.sidebarContext.trim());
  }

  return parts.join(NON_EMPTY_SEPARATOR);
};
