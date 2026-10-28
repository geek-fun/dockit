import type { AgentToolCall } from '@/store/dataStudioStore';
import { disposeAgentRuntime, initAgentRuntime } from '@/composables/agentRuntime';

const mockHandlers: Record<string, (_payload: any) => void> = {};
const mockConfirm = jest.fn().mockResolvedValue(undefined);
const mockSession = {
  id: 'chat',
  permissionsMode: 'Auto',
  messages: [
    { id: 'assistant', role: 'assistant', status: 'streaming', toolCalls: [] as AgentToolCall[] },
  ],
};
const mockStore = {
  sessions: [mockSession],
  removePreparingPlaceholder: jest.fn(),
  setSessionActiveTool: jest.fn(),
  setSessionStatus: jest.fn(),
  setSessionError: jest.fn(),
  setMessageStatus: jest.fn(),
  clearSessionProgress: jest.fn(),
  removeOrphanedStreamingMessages: jest.fn(),
  updateToolCallStatus: jest.fn(),
  findConfirmationRule: jest.fn(),
  setMessageToolCalls: jest.fn((_sessionId: string, messageId: string, calls: AgentToolCall[]) => {
    mockSession.messages = mockSession.messages.map(message =>
      message.id === messageId ? { ...message, toolCalls: calls } : message,
    );
  }),
};

jest.mock('@/store/dataStudioStore', () => ({ useDataStudioStore: () => mockStore }));
jest.mock('@/datasources/agentApi', () => {
  const register = (name: string) => async (handler: (_payload: any) => void) => {
    mockHandlers[name] = handler;
    return () => undefined;
  };
  const api = {
    onAgentLoopCompacting: register('onAgentLoopCompacting'),
    onAgentLoopDelta: register('onAgentLoopDelta'),
    onAgentLoopDone: register('onAgentLoopDone'),
    onAgentLoopError: register('onAgentLoopError'),
    onAgentLoopIteration: register('onAgentLoopIteration'),
    onAgentLoopStepDone: register('onAgentLoopStepDone'),
    onAgentLoopBlocked: register('onAgentLoopBlocked'),
    onAgentLoopStopped: register('onAgentLoopStopped'),
    onAgentLoopSummaryInjected: register('onAgentLoopSummaryInjected'),
    onAgentLoopThinkingDelta: register('onAgentLoopThinkingDelta'),
    onAgentLoopToolCall: register('onAgentLoopToolCall'),
    onAgentLoopToolResult: register('onAgentLoopToolResult'),
    onAgentLoopWaitingLlm: register('onAgentLoopWaitingLlm'),
    onAgentLoopWarning: register('onAgentLoopWarning'),
    confirmToolCall: (...args: unknown[]) => mockConfirm(...args),
  };
  return { ...api, agentApi: api };
});

const call = (confirmation_required?: boolean) => ({
  session_id: 'chat',
  tool_call_id: 'call',
  tool_name: 'update',
  arguments: { value: 1 },
  risk_level: 'elevated',
  confirmation_required,
});

describe('agent permission events', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    mockSession.messages = [
      { id: 'assistant', role: 'assistant', status: 'streaming', toolCalls: [] },
    ];
    jest.clearAllMocks();
    mockStore.findConfirmationRule.mockReturnValue(undefined);
    await initAgentRuntime();
  });
  afterEach(() => {
    disposeAgentRuntime();
    jest.useRealTimers();
  });

  it('honors current host confirmation requirements over stale frontend Auto and allow rules', () => {
    mockStore.findConfirmationRule.mockReturnValue({ action: 'allow' });
    mockHandlers.onAgentLoopToolCall(call(true));
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockSession.messages[0].toolCalls[0].status).toBe('pending');
    expect(mockStore.setSessionStatus).toHaveBeenCalledWith('chat', 'waiting_confirmation');
  });

  it('reopens one queued call for approval without duplicating it or keeping its execution timer', () => {
    mockHandlers.onAgentLoopToolCall(call(false));
    expect(mockConfirm).toHaveBeenCalledWith('call', true);
    mockConfirm.mockClear();
    mockHandlers.onAgentLoopToolCall(call(true));
    expect(mockSession.messages[0].toolCalls).toHaveLength(1);
    expect(mockSession.messages[0].toolCalls[0].requiresConfirmation).toBe(true);
    jest.advanceTimersByTime(61_000);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockStore.updateToolCallStatus).not.toHaveBeenCalled();
  });

  it('uses the full envelope result for the expanded tool result', () => {
    mockHandlers.onAgentLoopToolCall(call(false));
    mockHandlers.onAgentLoopToolResult({
      ...call(false),
      envelope: { summary: 'Preview', full_result: 'Full result with remaining rows' },
    });
    expect(mockStore.updateToolCallStatus).toHaveBeenCalledWith(
      'chat',
      'assistant',
      'call',
      'done',
      'Full result with remaining rows',
      undefined,
    );
  });

  it('renders a preflight denial without requesting confirmation', () => {
    mockHandlers.onAgentLoopToolResult({
      ...call(),
      denied: true,
      error: true,
      envelope: { summary: 'Read access denied' },
    });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockSession.messages[0].toolCalls).toHaveLength(1);
    expect(mockSession.messages[0].toolCalls[0]).toMatchObject({
      status: 'denied',
      result: 'Read access denied',
      requiresConfirmation: false,
    });
  });

  it('clears queued approvals when unavailable infrastructure stops the run', () => {
    mockHandlers.onAgentLoopToolCall(call(true));
    mockHandlers.onAgentLoopError({ session_id: 'chat', error: 'Cannot load AI permissions' });
    expect(mockSession.messages[0].toolCalls[0].status).toBe('interrupted');
    expect(mockSession.messages[0].toolCalls[0].requiresConfirmation).toBe(false);
    expect(mockStore.setSessionStatus).toHaveBeenCalledWith('chat', 'error');
    expect(mockStore.clearSessionProgress).toHaveBeenCalledWith('chat');
  });

  it('renders a preflight infrastructure error even without a tool-call event', () => {
    mockHandlers.onAgentLoopToolResult({
      ...call(),
      denied: false,
      error: true,
      denial: { kind: 'unavailable', source: 'unknown', message: 'Cannot load policy' },
      envelope: { summary: 'Cannot load policy' },
    });
    expect(mockSession.messages[0].toolCalls[0]).toMatchObject({
      status: 'error',
      result: 'Cannot load policy',
      requiresConfirmation: false,
      denial: { kind: 'unavailable' },
    });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('reports execution-time revocation as denial', () => {
    mockHandlers.onAgentLoopToolCall(call(false));
    mockHandlers.onAgentLoopToolResult({
      ...call(),
      denied: true,
      error: true,
      envelope: { summary: 'Permission revoked' },
    });
    expect(mockStore.updateToolCallStatus).toHaveBeenCalledWith(
      'chat',
      'assistant',
      'call',
      'denied',
      'Permission revoked',
      undefined,
    );
  });

  it('retains structured denial context and clears queued approvals', () => {
    mockHandlers.onAgentLoopToolCall(call(true));
    const denial = {
      kind: 'permission',
      source: 'connection',
      connectionId: '42',
      action: 'manage',
      message: 'Manage access denied',
    };
    mockHandlers.onAgentLoopToolResult({
      ...call(),
      denied: true,
      denial,
      error: true,
      envelope: { summary: denial.message },
    });
    expect(mockSession.messages[0].toolCalls[0]).toMatchObject({
      denial,
      requiresConfirmation: false,
    });
    mockHandlers.onAgentLoopBlocked({ session_id: 'chat' });
    expect(mockStore.setSessionStatus).toHaveBeenCalledWith('chat', 'blocked');
    expect(mockStore.setMessageStatus).toHaveBeenCalledWith('chat', 'assistant', 'done');
    expect(mockStore.clearSessionProgress).toHaveBeenCalledWith('chat');
  });

  it('marks unresolved calls unavailable when another action blocks the run', () => {
    mockHandlers.onAgentLoopToolCall(call(true));
    mockHandlers.onAgentLoopBlocked({ session_id: 'chat' });
    expect(mockSession.messages[0].toolCalls[0]).toMatchObject({
      status: 'interrupted',
      requiresConfirmation: false,
    });
  });

  it('retains existing confirmation behavior for runtimes without host metadata', () => {
    mockHandlers.onAgentLoopToolCall({ ...call(), risk_level: 'destructive' });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockSession.messages[0].toolCalls[0].requiresConfirmation).toBe(true);
  });
});
