import { createPinia, setActivePinia } from 'pinia';
import { useDbDataStore } from '../src/store/dbDataStore';
import { useConnectionStore, findTable } from '../src/store/connectionStore';
import { dynamoApi } from '../src/datasources';
import type { DynamoDBConnection } from '../src/store';

jest.mock('../src/store/connectionStore', () => ({
  useConnectionStore: jest.fn(),
  findTable: jest.fn(),
}));
jest.mock('../src/datasources', () => ({ dynamoApi: { executeStatement: jest.fn() } }));
const connection = { id: 1, type: 'DYNAMODB' } as DynamoDBConnection;
const queryTable = jest.fn();
const deleteItem = jest.fn();
beforeEach(() => {
  setActivePinia(createPinia());
  jest.clearAllMocks();
  (useConnectionStore as unknown as jest.Mock).mockReturnValue({
    queryTable,
    deleteItem,
    getDynamoIndexOrTableOption: () => [
      { label: 'Table - qa', value: 'qa', partitionKeyName: 'id' },
    ],
  });
  (findTable as jest.Mock).mockReturnValue({ partitionKey: { name: 'id' } });
});

it('keeps per-item type metadata alongside Query UI result rows', async () => {
  queryTable.mockResolvedValue({
    items: [
      { id: 1, tags: ['a'] },
      { id: 2, tags: ['b'] },
    ],
    attribute_types: [
      { id: 'N', tags: 'SS' },
      { id: 'N', tags: 'L' },
    ],
    count: 2,
  });
  const store = useDbDataStore();
  await store.getDynamoData(connection, { tableName: 'qa', index: 'Table - qa' });
  expect(store.dynamoData.queryData.attributeTypes?.[0].tags).toBe('SS');
  expect(store.dynamoData.queryData.attributeTypes?.[1].tags).toBe('L');
});

it('keeps the current Query UI page during a failed navigation and retries with the same cursor', async () => {
  const cursor = { id: { N: '1' } };
  queryTable
    .mockResolvedValueOnce({ items: [{ id: 1 }], count: 1, last_evaluated_key: cursor })
    .mockRejectedValueOnce(new Error('temporarily unavailable'))
    .mockResolvedValueOnce({ items: [{ id: 2 }], count: 1 });
  const store = useDbDataStore();
  await store.getDynamoData(connection, { tableName: 'qa', index: 'Table - qa' });

  const pending = store.changePage(2);
  expect(store.dynamoData.queryData.pagination.page).toBe(1);
  expect(store.dynamoData.queryData.data).toEqual([{ id: 1 }]);
  await expect(pending).rejects.toThrow('temporarily unavailable');
  expect(store.dynamoData.queryData.pagination.page).toBe(1);
  expect(store.dynamoData.queryData.lastEvaluatedKeys[1]).toEqual(cursor);

  await store.changePage(2);
  expect(queryTable).toHaveBeenLastCalledWith(
    connection,
    expect.objectContaining({ exclusiveStartKey: cursor }),
  );
  expect(store.dynamoData.queryData.pagination.page).toBe(2);
  expect(store.dynamoData.queryData.data).toEqual([{ id: 2 }]);
});

it('keeps the current Query UI page and size when a page-size request fails', async () => {
  queryTable
    .mockResolvedValueOnce({ items: [{ id: 1 }], count: 1 })
    .mockRejectedValueOnce(new Error('temporarily unavailable'));
  const store = useDbDataStore();
  await store.getDynamoData(connection, { tableName: 'qa', index: 'Table - qa' });
  await expect(store.changePageSize(50)).rejects.toThrow('temporarily unavailable');
  expect(queryTable).toHaveBeenLastCalledWith(connection, expect.objectContaining({ limit: 50 }));
  expect(store.dynamoData.queryData.pagination.pageSize).toBe(25);
  expect(store.dynamoData.queryData.data).toEqual([{ id: 1 }]);
});

it('appends PartiQL type metadata in row order and clears it for a fresh query', async () => {
  const execute = dynamoApi.executeStatement as jest.Mock;
  execute.mockResolvedValueOnce({
    items: [{ id: 1, tags: ['a'] }],
    attribute_types: [{ id: 'N', tags: 'SS' }],
    count: 1,
    next_token: 'next',
  });
  execute.mockResolvedValueOnce({
    items: [{ id: 2, tags: ['b'] }],
    attribute_types: [{ id: 'N', tags: 'BS' }],
    count: 1,
    next_token: null,
  });
  execute.mockResolvedValueOnce({ items: [], attribute_types: [], count: 0, next_token: null });
  const store = useDbDataStore();
  await store.executePartiqlStatement(connection, 'qa', 'SELECT * FROM qa');
  await store.executePartiqlStatement(connection, 'qa', 'SELECT * FROM qa', { nextToken: 'next' });
  expect(store.dynamoData.partiqlData.attributeTypes?.map(types => types.tags)).toEqual([
    'SS',
    'BS',
  ]);
  await store.executePartiqlStatement(connection, 'qa', 'SELECT * FROM qa');
  expect(store.dynamoData.partiqlData.attributeTypes).toEqual([]);
});

it.each([
  [false, true],
  [true, false],
  [false, false],
])('aligns paginated rows when metadata exists on pages %p and %p', async (first, second) => {
  const execute = dynamoApi.executeStatement as jest.Mock;
  execute.mockResolvedValueOnce({
    items: [{ id: 1, tags: ['a'] }],
    ...(first ? { attribute_types: [{ id: 'N', tags: 'SS' }] } : {}),
    count: 1,
    next_token: 'next',
  });
  execute.mockResolvedValueOnce({
    items: [{ id: 2, binary: 'YQ==' }],
    ...(second ? { attribute_types: [{ id: 'N', binary: 'B' }] } : {}),
    count: 1,
    next_token: null,
  });
  const store = useDbDataStore();
  await store.executePartiqlStatement(connection, 'qa', 'SELECT * FROM qa');
  await store.executePartiqlStatement(connection, 'qa', 'SELECT * FROM qa', { nextToken: 'next' });
  expect(store.dynamoData.partiqlData.attributeTypes).toEqual([
    first ? { id: 'N', tags: 'SS' } : {},
    second ? { id: 'N', binary: 'B' } : {},
  ]);
  expect(store.dynamoData.partiqlData.data?.map(row => row.id)).toEqual([1, 2]);
  expect(store.dynamoData.partiqlData.columns.some(column => column.key === 'binary')).toBe(true);
});

it('replaces rather than appends rows and metadata during next-page navigation', async () => {
  const execute = dynamoApi.executeStatement as jest.Mock;
  execute.mockResolvedValueOnce({
    items: [{ id: 1 }],
    attribute_types: [{ id: 'N' }],
    count: 1,
    next_token: 'next',
  });
  execute.mockResolvedValueOnce({
    items: [{ id: 2 }],
    attribute_types: [{ id: 'N' }],
    count: 1,
    next_token: null,
  });
  const store = useDbDataStore();
  await store.executePartiqlStatement(connection, 'qa', 'SELECT * FROM qa');
  const pending = store.executePartiqlStatement(connection, 'qa', 'SELECT * FROM qa', {
    nextToken: 'next',
    mode: 'replace',
  });
  expect(store.dynamoData.partiqlData.data).toEqual([{ id: 1 }]);
  await pending;
  expect(store.dynamoData.partiqlData.data).toEqual([{ id: 2 }]);
  expect(store.dynamoData.partiqlData.attributeTypes).toEqual([{ id: 'N' }]);
  expect(store.dynamoData.partiqlData.count).toBe(1);
});

it('retains the PartiQL result and next token when cursor navigation fails', async () => {
  const execute = dynamoApi.executeStatement as jest.Mock;
  execute
    .mockResolvedValueOnce({ items: [{ id: 1 }], count: 1, next_token: 'next' })
    .mockRejectedValueOnce(new Error('temporarily unavailable'));
  const store = useDbDataStore();
  await store.executePartiqlStatement(connection, 'qa', 'SELECT * FROM qa');
  await expect(
    store.executePartiqlStatement(connection, 'qa', 'SELECT * FROM qa', {
      nextToken: 'next',
      mode: 'replace',
    }),
  ).rejects.toThrow('temporarily unavailable');
  expect(store.dynamoData.partiqlData.data).toEqual([{ id: 1 }]);
  expect(store.dynamoData.partiqlData.nextToken).toBe('next');
  expect(store.dynamoData.partiqlData.errorMessage).toBeNull();
});

it('clears Query UI type metadata when a subsequent response omits it', async () => {
  queryTable.mockResolvedValueOnce({
    items: [{ id: 1, tags: ['a'] }],
    attribute_types: [{ id: 'N', tags: 'SS' }],
    count: 1,
  });
  queryTable.mockResolvedValueOnce({ items: [{ id: 2 }], count: 1 });
  const store = useDbDataStore();
  await store.getDynamoData(connection, { tableName: 'qa', index: 'Table - qa' });
  await store.getDynamoData(connection, { tableName: 'qa', index: 'Table - qa' });
  expect(store.dynamoData.queryData.data).toEqual([{ id: 2 }]);
  expect(store.dynamoData.queryData.attributeTypes).toBeUndefined();
});

it('keeps per-row type metadata aligned after a query row is deleted', async () => {
  queryTable.mockResolvedValue({
    items: [
      { id: 1, tags: ['a'] },
      { id: 2, tags: 'b' },
      { id: 3, tags: ['c'] },
    ],
    attribute_types: [
      { id: 'N', tags: 'SS' },
      { id: 'N', tags: 'S' },
      { id: 'N', tags: 'BS' },
    ],
    count: 3,
  });
  const store = useDbDataStore();
  await store.getDynamoData(connection, { tableName: 'qa', index: 'Table - qa' });
  await store.deleteItem(connection, 'qa', [{ key: 'id', type: 'N', value: 2 }]);
  expect(store.dynamoData.queryData.data?.map(row => row.id)).toEqual([1, 3]);
  expect(store.dynamoData.queryData.attributeTypes).toEqual([
    { id: 'N', tags: 'SS' },
    { id: 'N', tags: 'BS' },
  ]);
});

it('keeps PartiQL type metadata aligned and counts rows after a delete', async () => {
  const execute = dynamoApi.executeStatement as jest.Mock;
  execute.mockResolvedValue({
    items: [
      { id: 1, binary: 'YQ==' },
      { id: 2, binary: 'Yg==' },
    ],
    attribute_types: [
      { id: 'N', binary: 'B' },
      { id: 'N', binary: 'S' },
    ],
    count: 2,
    next_token: null,
  });
  const store = useDbDataStore();
  await store.executePartiqlStatement(connection, 'qa', 'SELECT * FROM qa');
  await store.deleteItem(connection, 'qa', [{ key: 'id', type: 'N', value: 1 }]);
  expect(store.dynamoData.partiqlData.data).toEqual([{ id: 2, binary: 'Yg==' }]);
  expect(store.dynamoData.partiqlData.attributeTypes).toEqual([{ id: 'N', binary: 'S' }]);
  expect(store.dynamoData.partiqlData.count).toBe(1);
});

it('matches numeric cache rows when the delete key is an exact string', async () => {
  queryTable.mockResolvedValue({
    items: [{ id: 9223372036854775808n }],
    attribute_types: [{ id: 'N' }],
    count: 1,
  });
  const store = useDbDataStore();
  await store.getDynamoData(connection, { tableName: 'qa', index: 'Table - qa' });
  await store.deleteItem(connection, 'qa', [
    { key: 'id', type: 'N', value: '9223372036854775808' },
  ]);
  expect(store.dynamoData.queryData.data).toEqual([]);
  expect(store.dynamoData.queryData.attributeTypes).toEqual([]);
});
