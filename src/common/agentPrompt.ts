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
