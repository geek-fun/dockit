import { computed, ref } from 'vue';
import { useChatAgent } from '@/composables';
import type { ChatSession, ConfirmationRule } from '@/types/chat';

const mockConfirm = jest.fn().mockResolvedValue(undefined);
const mockSaveRule = jest.fn<Promise<void>, [ConfirmationRule]>();
const mockStore = {
  clearSessionError: jest.fn(),
  setSessionError: jest.fn(),
  getSessionError: jest.fn(),
};

jest.mock('@/store', () => ({ useAppStore: () => ({}) }));
jest.mock('@/store/dataStudioStore', () => ({ useDataStudioStore: () => mockStore }));
jest.mock('@/store/connectionStore', () => ({ useConnectionStore: () => ({}) }));
jest.mock('@/datasources/agentApi', () => ({
  agentApi: {},
  confirmToolCall: (...args: unknown[]) => mockConfirm(...args),
}));
jest.mock('@/composables/agentRuntime', () => ({}));
jest.mock('@/composables/useDialogService', () => ({}));
jest.mock('@/composables/useMessageService', () => ({}));
jest.mock('@/composables/useLoadingBarService', () => ({}));
jest.mock('@/composables/useFormValidation', () => ({}));
jest.mock('@/composables/useAppUpdater', () => ({}));
jest.mock('@/composables/useKeyboardShortcuts', () => ({}));
jest.mock('@/composables/useGlobalShortcuts', () => ({}));
jest.mock('@/composables/useAgentContext', () => ({}));
jest.mock('@/composables/useSidebarChatAgent', () => ({}));
jest.mock('@/composables/useDataStudioChatAgent', () => ({}));
jest.mock('@/composables/useEditorInsertCode', () => ({}));
jest.mock('@/composables/useDialogResult', () => ({}));

const setup = () => {
  const sessions = ref<ChatSession[]>([
    {
      id: 'chat',
      status: 'waiting_confirmation',
      maxIterations: 10,
      messages: [
        {
          id: 'assistant',
          role: 'assistant',
          content: '',
          status: 'streaming',
          timestamp: 0,
          toolCalls: [
            {
              id: 'call',
              toolName: 'es__update_document',
              args: {},
              status: 'pending',
              riskLevel: 'elevated',
              requiresConfirmation: true,
            },
          ],
        },
      ],
    },
  ]);
  const config: Parameters<typeof useChatAgent>[0] = {
    feature: 'dataStudio',
    sessionStore: {
      sessions,
      activeSessionId: ref('chat'),
      activeSession: computed(() => sessions.value[0]),
      addMessage: jest.fn(),
      updateStreamingContent: jest.fn(),
      updateStreamingThinking: jest.fn(),
      setMessageStatus: jest.fn(),
      setMessageToolCalls: jest.fn(),
      removeOrphanedStreamingMessages: jest.fn(),
      updateToolCallStatus: jest.fn(),
      setSessionStatus: jest.fn(),
      clearSession: jest.fn(),
      getOrCreateSession: jest.fn(),
      reloadSessionMessages: jest.fn(),
    },
    addConfirmationRule: mockSaveRule,
  };
  return { agent: useChatAgent(config), config };
};

describe('persistent tool confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveRule.mockReset().mockResolvedValue(undefined);
  });

  it.each(['allow_always', 'deny_always'] as const)(
    'persists %s before releasing the queued call',
    async action => {
      let finishSaving: () => void = () => undefined;
      mockSaveRule.mockReturnValueOnce(
        new Promise<void>(resolve => {
          finishSaving = resolve;
        }),
      );
      const { agent } = setup();
      const confirmation = agent.handleConfirmation('assistant', 'call', action);
      expect(mockSaveRule).toHaveBeenCalledWith({
        sessionId: 'chat',
        toolName: 'es__update_document',
        action,
      });
      expect(mockConfirm).not.toHaveBeenCalled();

      finishSaving();
      await confirmation;
      expect(mockConfirm).toHaveBeenCalledWith('call', action === 'allow_always');
    },
  );

  it('keeps approval pending and reports a failed rule save', async () => {
    mockSaveRule.mockRejectedValueOnce(new Error('Database is busy'));
    const { agent, config } = setup();
    await agent.handleConfirmation('assistant', 'call', 'allow_always');
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(config.sessionStore.updateToolCallStatus).not.toHaveBeenCalled();
    expect(config.sessionStore.setSessionStatus).not.toHaveBeenCalled();
    expect(agent.error.value).toBe('Database is busy');
    expect(mockStore.setSessionError).toHaveBeenCalledWith('chat', 'Database is busy');

    await agent.handleConfirmation('assistant', 'call', 'allow_always');
    expect(mockConfirm).toHaveBeenCalledWith('call', true);
    expect(agent.error.value).toBeUndefined();
    expect(mockStore.clearSessionError).toHaveBeenCalledWith('chat');
  });

  it('allows a one-time approval without writing a persistent rule', async () => {
    const { agent } = setup();
    await agent.handleConfirmation('assistant', 'call', 'allow_once');
    expect(mockSaveRule).not.toHaveBeenCalled();
    expect(mockConfirm).toHaveBeenCalledWith('call', true);
  });
});
