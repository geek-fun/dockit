/**
 * Composables Module
 *
 * This module exports all custom composables used in the DocKit application.
 * These composables replace Naive UI providers with shadcn-vue compatible implementations.
 */

export { useDialogService } from './useDialogService';
export { useMessageService } from './useMessageService';
export { useLoadingBarService } from './useLoadingBarService';
export { useFormValidation } from './useFormValidation';
export { useAppUpdater } from './useAppUpdater';
export { setupEditorKeyboardShortcuts } from './useKeyboardShortcuts';
export { setupGlobalShortcuts } from './useGlobalShortcuts';
export { useChatAgent } from './useChatAgent';
export { initAgentRuntime, disposeAgentRuntime } from './agentRuntime';
export { useAgentContext } from './useAgentContext';
export { useSidebarChatAgent } from './useSidebarChatAgent';
export { useDataStudioChatAgent } from './useDataStudioChatAgent';
export { useEditorInsertCode } from './useEditorInsertCode';
export { useDialogResult, formatApiError } from './useDialogResult';
