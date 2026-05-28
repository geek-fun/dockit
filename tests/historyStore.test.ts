import { setActivePinia, createPinia } from 'pinia';
import { useHistoryStore } from '../src/store/historyStore';
import type { HistoryEntry } from '../src/store/historyStore';
import { DatabaseType } from '../src/store/connectionStore';

const mockStore = new Map<string, unknown>();

jest.mock('../src/datasources', () => ({
  storeApi: {
    get: async <T>(key: string, defaultValue: T): Promise<T> =>
      (mockStore.get(key) as T) ?? defaultValue,
    set: async (key: string, value: unknown) => {
      mockStore.set(key, value);
    },
  },
}));

jest.mock('../src/common', () => ({
  pureObject: (obj: unknown) => JSON.parse(JSON.stringify(obj)),
}));

jest.mock('../src/common/monaco', () => ({
  SearchAction: {},
  transformToCurl: jest.fn(),
  configureDynamicOptions: jest.fn(),
}));

jest.mock('../src/store/appStore', () => ({
  useAppStore: () => ({
    historyConfig: { historyCap: 100 },
  }),
}));

const { storeApi } = require('../src/datasources');

describe('historyStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockStore.clear();
    jest.clearAllMocks();
  });

  describe('addEntry', () => {
    it('should add MongoDB entry with all fields', async () => {
      const store = useHistoryStore();

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        mongoOperation: 'find',
        mongoCollection: 'users',
        mongoDatabase: 'mydb',
        mongoDuration: 42,
        mongoResultCount: 10,
      });

      expect(store.entries).toHaveLength(1);
      const entry = store.entries[0];
      expect(entry.databaseType).toBe(DatabaseType.MONGODB);
      expect(entry.mongoOperation).toBe('find');
      expect(entry.mongoCollection).toBe('users');
      expect(entry.mongoDatabase).toBe('mydb');
      expect(entry.mongoDuration).toBe(42);
      expect(entry.mongoResultCount).toBe(10);
      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeDefined();
    });

    it('should enforce FIFO cap when entries exceed limit', async () => {
      const store = useHistoryStore();

      // Add 101 entries (cap is 100)
      for (let i = 0; i < 101; i++) {
        await store.addEntry({
          databaseType: DatabaseType.MONGODB,
          method: 'POST',
          path: `/api/mongo/${i}`,
          connectionName: 'test-mongo',
          mongoOperation: 'find',
          mongoCollection: 'users',
        });
      }

      expect(store.entries).toHaveLength(100);
      // Most recent entry should be preserved
      expect(store.entries[0].path).toBe('/api/mongo/100');
      // Oldest entry (index 0) should have been removed
      expect(store.entries.find(e => e.path === '/api/mongo/0')).toBeUndefined();
    });

    it('should persist entries to storeApi', async () => {
      const store = useHistoryStore();

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      const stored = mockStore.get('queryHistory') as HistoryEntry[];
      expect(stored).toHaveLength(1);
      expect(stored[0].mongoOperation).toBe('find');
    });
  });

  describe('fetchHistory', () => {
    it('should load entries from storeApi', async () => {
      const mockEntries: HistoryEntry[] = [
        {
          id: '1',
          timestamp: Date.now(),
          databaseType: DatabaseType.MONGODB,
          method: 'POST',
          path: '/api/mongo',
          connectionName: 'test-mongo',
          mongoOperation: 'find',
          mongoCollection: 'users',
          mongoDatabase: 'mydb',
        },
        {
          id: '2',
          timestamp: Date.now(),
          databaseType: DatabaseType.ELASTICSEARCH,
          method: 'GET',
          path: '/_search',
          index: 'my-index',
          connectionName: 'test-es',
        },
      ];
      mockStore.set('queryHistory', mockEntries);

      const store = useHistoryStore();
      await store.fetchHistory();

      expect(store.entries).toHaveLength(2);
      expect(store.entries[0].mongoOperation).toBe('find');
      expect(store.entries[1].index).toBe('my-index');
    });

    it('should return empty array when storeApi fails', async () => {
      jest.spyOn(storeApi, 'get').mockRejectedValueOnce(new Error('Read failed'));

      const store = useHistoryStore();
      await store.fetchHistory();

      expect(store.entries).toEqual([]);
    });
  });

  describe('toggleStar', () => {
    it('should star MongoDB entry and persist', async () => {
      const store = useHistoryStore();

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      const entryId = store.entries[0].id;
      await store.toggleStar(entryId);

      expect(store.entries[0].starred).toBe(true);

      const stored = mockStore.get('queryHistory') as HistoryEntry[];
      expect(stored[0].starred).toBe(true);
    });

    it('should unstar entry on second toggle', async () => {
      const store = useHistoryStore();

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        mongoOperation: 'aggregate',
        mongoCollection: 'orders',
      });

      const entryId = store.entries[0].id;
      await store.toggleStar(entryId);
      expect(store.entries[0].starred).toBe(true);

      await store.toggleStar(entryId);
      expect(store.entries[0].starred).toBe(false);
    });

    it('should do nothing for non-existent entry', async () => {
      const store = useHistoryStore();

      await store.toggleStar('non-existent-id');

      expect(store.entries).toHaveLength(0);
    });
  });

  describe('removeEntry', () => {
    it('should remove MongoDB entry', async () => {
      const store = useHistoryStore();

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo/1',
        connectionName: 'test-mongo',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });
      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo/2',
        connectionName: 'test-mongo',
        mongoOperation: 'aggregate',
        mongoCollection: 'orders',
      });

      const findEntry = store.entries.find(e => e.mongoOperation === 'find')!;
      await store.removeEntry(findEntry.id);

      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].mongoOperation).toBe('aggregate');
    });

    it('should clear selectedEntryId if removed entry was selected', async () => {
      const store = useHistoryStore();

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      const entryId = store.entries[0].id;
      store.selectEntry(entryId);
      expect(store.selectedEntryId).toBe(entryId);

      await store.removeEntry(entryId);
      expect(store.selectedEntryId).toBeNull();
    });

    it('should persist after removal', async () => {
      const store = useHistoryStore();

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      const entryId = store.entries[0].id;
      await store.removeEntry(entryId);

      const stored = mockStore.get('queryHistory') as HistoryEntry[];
      expect(stored).toHaveLength(0);
    });
  });

  describe('clearHistory', () => {
    it('should clear all entries including MongoDB', async () => {
      const store = useHistoryStore();

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });
      await store.addEntry({
        databaseType: DatabaseType.ELASTICSEARCH,
        method: 'GET',
        path: '/_search',
        connectionName: 'test-es',
      });

      expect(store.entries).toHaveLength(2);

      await store.clearHistory();

      expect(store.entries).toHaveLength(0);
      expect(store.selectedEntryId).toBeNull();
    });

    it('should persist empty array', async () => {
      const store = useHistoryStore();

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      await store.clearHistory();

      const stored = mockStore.get('queryHistory') as HistoryEntry[];
      expect(stored).toEqual([]);
    });
  });

  describe('selectEntry', () => {
    it('should set selectedEntryId', async () => {
      const store = useHistoryStore();

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      const entryId = store.entries[0].id;
      store.selectEntry(entryId);

      expect(store.selectedEntryId).toBe(entryId);
    });

    it('should allow selecting null', () => {
      const store = useHistoryStore();
      store.selectedEntryId = 'some-id';

      store.selectEntry(null);

      expect(store.selectedEntryId).toBeNull();
    });
  });

  describe('getters', () => {
    it('selectedEntry returns the correct entry', async () => {
      const store = useHistoryStore();

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      const entryId = store.entries[0].id;
      store.selectEntry(entryId);

      expect(store.selectedEntry?.mongoOperation).toBe('find');
    });

    it('starredEntries returns only starred entries', async () => {
      const store = useHistoryStore();

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo/1',
        connectionName: 'test-mongo',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });
      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo/2',
        connectionName: 'test-mongo',
        mongoOperation: 'aggregate',
        mongoCollection: 'orders',
      });

      const findEntry = store.entries.find(e => e.mongoOperation === 'find')!;
      await store.toggleStar(findEntry.id);

      expect(store.starredEntries).toHaveLength(1);
      expect(store.starredEntries[0].mongoOperation).toBe('find');
    });
  });
});

describe('MongoDB operation extraction', () => {
  const extractOperation = (code: string): string | undefined =>
    code.match(/db\.\w+\.\s*(\w+)\s*\(/)?.[1];

  it('should extract find operation', () => {
    expect(extractOperation('db.users.find({ name: "Alice" })')).toBe('find');
  });

  it('should extract aggregate operation', () => {
    expect(extractOperation('db.orders.aggregate([{ $match: {} }])')).toBe('aggregate');
  });

  it('should extract insertOne operation', () => {
    expect(extractOperation('db.users.insertOne({ name: "Bob" })')).toBe('insertOne');
  });

  it('should extract updateMany operation', () => {
    expect(
      extractOperation('db.users.updateMany({ age: { $gt: 18 } }, { $set: { active: true } })'),
    ).toBe('updateMany');
  });

  it('should extract deleteOne operation', () => {
    expect(extractOperation('db.users.deleteOne({ _id: ObjectId("...") })')).toBe('deleteOne');
  });

  it('should extract insertMany operation', () => {
    expect(extractOperation('db.products.insertMany([{ name: "A" }, { name: "B" }])')).toBe(
      'insertMany',
    );
  });

  it('should extract updateOne operation', () => {
    expect(extractOperation('db.users.updateOne({ _id: 1 }, { $set: { name: "Updated" } })')).toBe(
      'updateOne',
    );
  });

  it('should extract deleteMany operation', () => {
    expect(extractOperation('db.logs.deleteMany({ timestamp: { $lt: date } })')).toBe('deleteMany');
  });

  it('should extract countDocuments operation', () => {
    expect(extractOperation('db.users.countDocuments({ active: true })')).toBe('countDocuments');
  });

  it('should extract distinct operation', () => {
    expect(extractOperation('db.users.distinct("status")')).toBe('distinct');
  });

  it('should handle whitespace between method and parenthesis', () => {
    expect(extractOperation('db.users.find ({})')).toBe('find');
  });

  it('should handle multiline queries', () => {
    const multiline = `db.users.aggregate([
  { $match: { status: "active" } },
  { $group: { _id: "$role", count: { $sum: 1 } } }
])`;
    expect(extractOperation(multiline)).toBe('aggregate');
  });

  it('should return undefined for non-matching code', () => {
    expect(extractOperation('SELECT * FROM users')).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    expect(extractOperation('')).toBeUndefined();
  });

  it('should extract createIndex operation', () => {
    expect(extractOperation('db.users.createIndex({ email: 1 }, { unique: true })')).toBe(
      'createIndex',
    );
  });

  it('should extract dropIndex operation', () => {
    expect(extractOperation('db.users.dropIndex("email_idx")')).toBe('dropIndex');
  });
});
