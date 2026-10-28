import { invoke } from '@tauri-apps/api/core';
import { saveAttachedSource } from '@/datasources/agentApi';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }));
jest.mock('@tauri-apps/api/event', () => ({ listen: jest.fn() }));

const mockedInvoke = invoke as jest.MockedFunction<typeof invoke>;

beforeEach(() => {
  mockedInvoke.mockReset();
  mockedInvoke.mockResolvedValue({} as never);
});

it('sends attached sources with the camelCase argument names Tauri expects', async () => {
  await saveAttachedSource({
    id: 'source',
    kind: 'database',
    alias: 'prod',
    name: 'prod',
    database_type: 'DYNAMODB',
    file_type: null,
    file_path: null,
    connection_id: 12,
    created_at: 1,
    updated_at: 2,
  });

  expect(mockedInvoke).toHaveBeenCalledWith('save_attached_source', {
    id: 'source',
    kind: 'database',
    alias: 'prod',
    name: 'prod',
    databaseType: 'DYNAMODB',
    fileType: null,
    filePath: null,
    connectionId: 12,
    createdAt: 1,
    updatedAt: 2,
  });
  const payload = (mockedInvoke.mock.calls[0][1] ?? {}) as Record<string, unknown>;
  expect(Object.keys(payload).filter(key => key.includes('_'))).toEqual([]);
});

it('forwards omitted timestamps so updates preserve the stored created_at', async () => {
  await saveAttachedSource({
    id: 'source',
    kind: 'file',
    alias: 'data',
    name: 'data',
    database_type: null,
    file_type: 'csv',
    file_path: '/tmp/data.csv',
    connection_id: null,
    updated_at: 3,
  });

  const payload = (mockedInvoke.mock.calls[0][1] ?? {}) as Record<string, unknown>;
  expect(payload).toMatchObject({ filePath: '/tmp/data.csv', updatedAt: 3 });
  expect(payload.createdAt).toBeUndefined();
});
