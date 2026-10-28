import { createPinia, setActivePinia } from 'pinia';
import { useDataStudioStore, type DatabaseSource } from '@/store/dataStudioStore';

const mockUpdate = jest.fn();
jest.mock('@/datasources/agentApi', () => ({
  updateSessionMeta: (...args: unknown[]) => mockUpdate(...args),
}));
const source: DatabaseSource = {
  sourceId: 'source',
  kind: 'database',
  connectionId: 42,
  name: 'Example',
  databaseType: 'ELASTICSEARCH',
  permissions: { read: true, create: false, update: false, delete: false, manage: false },
};
const setup = () => {
  setActivePinia(createPinia());
  const store = useDataStudioStore();
  store.sessions = [{ id: 'chat', sources: [], messages: [], permissionsMode: 'Auto' } as never];
  store.activeSessionId = 'chat';
  return store;
};
beforeEach(() => mockUpdate.mockReset().mockResolvedValue(undefined));

it('persists attachment and its custom permissions together in one write', async () => {
  const store = setup();
  await store.attachSourceToActiveSession(source, 'custom');
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(JSON.parse(mockUpdate.mock.calls[0][1])[0]).toMatchObject({
    sourceId: 'source',
    permissionsMode: 'custom',
    permissions: source.permissions,
  });
  expect(store.activeSession?.sources[0].permissionsMode).toBe('custom');
});

it('propagates failed saves without changing the active permission snapshot', async () => {
  const store = setup();
  await store.attachSourceToActiveSession(source, 'custom');
  mockUpdate.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(store.updateSessionSourceMode('chat', 'source', 'inherit')).rejects.toThrow(
    'Storage unavailable',
  );
  expect(store.activeSession?.sources[0].permissionsMode).toBe('custom');
  await store.updateSessionSourceMode('chat', 'source', 'inherit');
  expect(store.activeSession?.sources[0].permissionsMode).toBe('inherit');
});

it('serializes source changes using the latest saved snapshot and preserves messages', async () => {
  const store = setup();
  let finish!: () => void;
  mockUpdate.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      }),
  );
  const attached = store.attachSourceToActiveSession(source, 'custom');
  const changed = store.setSessionPermissionsMode('chat', 'Ask');
  await Promise.resolve();
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(store.activeSession?.sources).toHaveLength(0);
  store.sessions[0].messages = [{ id: 'streaming', content: 'New content' } as never];
  finish();
  await Promise.all([attached, changed]);
  expect(JSON.parse(mockUpdate.mock.calls[1][1])[0].permissionsMode).toBe('custom');
  expect(store.activeSession?.permissionsMode).toBe('Ask');
  expect(store.activeSession?.messages[0].content).toBe('New content');
});
