import { createPinia, setActivePinia } from 'pinia';
import { useDataStudioStore } from '@/store/dataStudioStore';
const mockLoadMessages = jest.fn();
jest.mock('@/datasources/agentApi', () => ({
  loadSessionMessages: (...args: unknown[]) => mockLoadMessages(...args),
}));
const denial = {
  kind: 'permission',
  source: 'connection',
  action: 'manage',
  connectionId: '42',
  message: 'Manage access denied',
};
const backend = (tool_calls?: unknown[]) => ({
  id: 'assistant',
  session_id: 'chat',
  role: 'assistant',
  content: JSON.stringify({
    content: '',
    tool_calls: [
      { id: 'call', function: { name: 'es__create_index', arguments: '{"index":"example"}' } },
    ],
  }),
  created_at: 0,
  tool_calls,
});
beforeEach(() => {
  setActivePinia(createPinia());
  jest.clearAllMocks();
});
it('restores authoritative tool outcomes and correlates results', async () => {
  const store = useDataStudioStore();
  store.sessions = [
    { id: 'chat', messages: [], sources: [], permissionsMode: 'Auto', status: 'blocked' } as never,
  ];
  mockLoadMessages.mockResolvedValue([
    backend([
      {
        id: 'call',
        tool_name: 'es__create_index',
        arguments: '{"index":"example"}',
        status: 'denied',
        result: denial.message,
        denial,
      },
      {
        id: 'failed',
        tool_name: 'es__search',
        arguments: '{}',
        status: 'failed',
        result: 'Execution failed',
      },
      { id: 'unknown', tool_name: 'es__search', arguments: '{}', status: 'approved' },
      {
        id: 'success',
        tool_name: 'es__search',
        arguments: '{}',
        status: 'completed',
        result: 'Actual rows',
      },
    ]),
    {
      id: 'result',
      session_id: 'chat',
      role: 'tool',
      content: JSON.stringify({ tool_call_id: 'call', content: denial.message }),
      created_at: 0,
    },
  ]);
  await store.reloadSessionMessages('chat');
  const calls = store.sessions[0].messages[0].toolCalls!;
  expect(calls.map(call => call.status)).toEqual(['denied', 'error', 'interrupted', 'done']);
  expect(calls[0]).toMatchObject({
    denial,
    args: { index: 'example' },
    result: denial.message,
    requiresConfirmation: false,
  });
  expect(store.sessions[0].messages[1].toolCallId).toBe('call');
  store.sessions[0].messages[0].toolCalls![0].requiresConfirmation = true;
  store.updateToolCallStatus('chat', 'assistant', 'call', 'denied');
  expect(store.sessions[0].messages[0].toolCalls![0].requiresConfirmation).toBe(false);
  store.sessions[0].messages[0].toolCalls![0].status = 'done';
  await store.reloadSessionMessages('chat');
  expect(store.sessions[0].messages[0].toolCalls![0].status).toBe('denied');
});
it('keeps legacy calls with no recorded outcome unavailable', async () => {
  const store = useDataStudioStore();
  store.sessions = [{ id: 'chat', messages: [], sources: [] } as never];
  mockLoadMessages.mockResolvedValue([backend()]);
  await store.reloadSessionMessages('chat');
  expect(store.sessions[0].messages[0].toolCalls![0].status).toBe('interrupted');
});

it('restores full result previews and validates legacy argument shapes', async () => {
  const store = useDataStudioStore();
  store.sessions = [{ id: 'chat', messages: [], sources: [] } as never];
  const full = 'Complete result '.repeat(400);
  mockLoadMessages.mockResolvedValue([
    backend([
      {
        id: 'long',
        tool_name: 'es__search',
        arguments: 'null',
        status: 'completed',
        result: full,
      },
    ]),
  ]);
  await store.reloadSessionMessages('chat');
  expect(store.sessions[0].messages[0].toolCalls![0]).toMatchObject({
    args: {},
    result: full.slice(0, 200),
    resultTruncated: true,
    resultFullLength: full.length,
  });
  expect(store.getToolResultFullBody('long')).toBe(full);
});

it('replaces a cached long result with a later error without showing stale content', async () => {
  const store = useDataStudioStore();
  store.sessions = [{ id: 'chat', sources: [], messages: [] } as never];
  mockLoadMessages.mockResolvedValue([
    backend([
      {
        id: 'call',
        tool_name: 'es__search',
        arguments: '{}',
        status: 'completed',
        result: 'x'.repeat(500),
      },
    ]),
  ]);
  await store.reloadSessionMessages('chat');
  store.updateToolCallStatus('chat', 'assistant', 'call', 'error', 'Latest failure');
  expect(store.sessions[0].messages[0].toolCalls![0]).toMatchObject({
    result: 'Latest failure',
    resultTruncated: false,
  });
  expect(store.getToolResultFullBody('call')).toBeUndefined();
});
