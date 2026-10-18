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
beforeEach(() => {
  setActivePinia(createPinia());
  jest.clearAllMocks();
  (useConnectionStore as unknown as jest.Mock).mockReturnValue({
    queryTable,
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
