import { setActivePinia, createPinia } from 'pinia';
import { useHistoryStore } from '../src/store/historyStore';
import { DatabaseType } from '../src/store/connectionStore';

let mockInvoke = jest.fn();
const mockStore = new Map<string, unknown>();

jest.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

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

const makeBackendEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-id',
  timestamp: Date.now(),
  databaseType: null,
  method: 'GET',
  path: '',
  indexName: null,
  qdsl: null,
  connectionName: 'test',
  connectionId: 'test-conn',
  mongoOperation: null,
  mongoCollection: null,
  mongoDatabase: null,
  mongoDuration: null,
  mongoResultCount: null,
  starred: false,
  ...overrides,
});

describe('historyStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockStore.clear();
    jest.clearAllMocks();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'load_query_history') return Promise.resolve([]);
      if (cmd === 'add_query_history_entry') return Promise.resolve(makeBackendEntry());
      if (cmd === 'toggle_query_history_star') return Promise.resolve();
      if (cmd === 'delete_query_history_entry') return Promise.resolve();
      if (cmd === 'clear_query_history') return Promise.resolve();
      return Promise.reject(new Error(`Unexpected invoke: ${cmd}`));
    });
  });

  describe('addEntry', () => {
    it('should add MongoDB entry with all fields', async () => {
      const store = useHistoryStore();
      const expectedId = 'mongo-entry-1';
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry') {
          return Promise.resolve(
            makeBackendEntry({ id: expectedId, mongoOperation: 'find', databaseType: 'MONGODB' }),
          );
        }
        if (cmd === 'load_query_history') {
          return Promise.resolve([
            makeBackendEntry({
              id: expectedId,
              mongoOperation: 'find',
              databaseType: 'MONGODB',
              mongoCollection: 'users',
              mongoDatabase: 'mydb',
              mongoDuration: 42,
              mongoResultCount: 10,
            }),
          ]);
        }
        return Promise.resolve();
      });

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
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

    it('should call add_query_history_entry with connectionId as string', async () => {
      const store = useHistoryStore();
      let capturedInput: unknown;
      mockInvoke.mockImplementation((cmd: string, args?: { input: unknown }) => {
        if (cmd === 'add_query_history_entry') {
          capturedInput = args?.input;
          return Promise.resolve(makeBackendEntry());
        }
        if (cmd === 'load_query_history') return Promise.resolve([]);
        return Promise.resolve();
      });

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 42,
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      expect(capturedInput).toBeDefined();
      expect((capturedInput as Record<string, unknown>).connectionId).toBe('42');
    });

    it('should handle entry add with re-fetch from backend', async () => {
      const store = useHistoryStore();
      let addCalled = false;

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry') {
          addCalled = true;
          return Promise.resolve(makeBackendEntry({ id: 'new-1', method: 'POST' }));
        }
        if (cmd === 'load_query_history') {
          if (addCalled) {
            return Promise.resolve([makeBackendEntry({ id: 'new-1', method: 'POST' })]);
          }
          return Promise.resolve([]);
        }
        return Promise.resolve();
      });

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].method).toBe('POST');
    });

    it('should not update entries on add failure', async () => {
      const store = useHistoryStore();
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry') {
          return Promise.reject(new Error('DB error'));
        }
        if (cmd === 'load_query_history') return Promise.resolve([]);
        return Promise.resolve();
      });

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      expect(store.entries).toHaveLength(0);
    });
  });

  describe('fetchHistory', () => {
    it('should load entries from SQLite via invoke', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'load_query_history') {
          return Promise.resolve([
            makeBackendEntry({
              id: '1',
              mongoOperation: 'find',
              databaseType: 'MONGODB',
              connectionName: 'test-mongo',
            }),
            makeBackendEntry({
              id: '2',
              method: 'GET',
              path: '/_search',
              indexName: 'my-index',
              connectionName: 'test-es',
              databaseType: 'ELASTICSEARCH',
            }),
          ]);
        }
        return Promise.resolve();
      });

      const store = useHistoryStore();
      await store.fetchHistory();

      expect(store.entries).toHaveLength(2);
      expect(store.entries[0].mongoOperation).toBe('find');
      expect(store.entries[1].index).toBe('my-index');
    });

    it('should migrate old data from storeApi when fetchHistory finds it', async () => {
      const oldEntries = [
        {
          id: 'old-1',
          connectionName: 'test',
          connectionId: 'old-conn',
          method: 'GET',
          path: '/_search',
          timestamp: Date.now(),
        },
      ];
      mockStore.set('queryHistory', oldEntries);

      let migrateCalled = false;
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry') {
          migrateCalled = true;
          return Promise.resolve(makeBackendEntry({ id: 'new-1' }));
        }
        if (cmd === 'load_query_history') {
          return Promise.resolve([makeBackendEntry({ id: 'migrated-1' })]);
        }
        return Promise.resolve();
      });

      const store = useHistoryStore();
      await store.fetchHistory();

      expect(migrateCalled).toBe(true);
      expect(store.entries).toHaveLength(1);
      const stored = mockStore.get('queryHistory');
      expect(stored).toEqual([]);
    });

    it('should return empty array when invoke fails', async () => {
      mockInvoke.mockRejectedValue(new Error('Invoke failed'));

      const store = useHistoryStore();
      await store.fetchHistory();

      expect(store.entries).toEqual([]);
    });
  });

  describe('toggleStar', () => {
    it('should star MongoDB entry via toggle invocation', async () => {
      let toggleInvoked = false;
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry')
          return Promise.resolve(makeBackendEntry({ id: 'entry-1' }));
        if (cmd === 'load_query_history')
          return Promise.resolve([makeBackendEntry({ id: 'entry-1' })]);
        if (cmd === 'toggle_query_history_star') {
          toggleInvoked = true;
          return Promise.resolve();
        }
        return Promise.resolve();
      });

      const store = useHistoryStore();
      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      const entryId = store.entries[0].id;
      await store.toggleStar(entryId);

      expect(store.entries[0].starred).toBe(true);
      expect(toggleInvoked).toBe(true);
    });

    it('should unstar entry on second toggle', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry')
          return Promise.resolve(makeBackendEntry({ id: 'entry-1' }));
        if (cmd === 'load_query_history')
          return Promise.resolve([makeBackendEntry({ id: 'entry-1' })]);
        if (cmd === 'toggle_query_history_star') return Promise.resolve();
        return Promise.resolve();
      });

      const store = useHistoryStore();
      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
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

    it('should revert star on toggle failure', async () => {
      let toggleCount = 0;
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry')
          return Promise.resolve(makeBackendEntry({ id: 'entry-1' }));
        if (cmd === 'load_query_history')
          return Promise.resolve([makeBackendEntry({ id: 'entry-1' })]);
        if (cmd === 'toggle_query_history_star') {
          toggleCount++;
          if (toggleCount === 1) return Promise.resolve();
          return Promise.reject(new Error('DB error'));
        }
        return Promise.resolve();
      });

      const store = useHistoryStore();
      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      const entryId = store.entries[0].id;
      await store.toggleStar(entryId);
      expect(store.entries[0].starred).toBe(true);

      // Second toggle fails — star should revert
      await store.toggleStar(entryId);
      expect(store.entries[0].starred).toBe(true);
    });
  });

  describe('removeEntry', () => {
    it('should remove MongoDB entry', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry') {
          return Promise.resolve(makeBackendEntry({ id: 'entry-1' }));
        }
        if (cmd === 'load_query_history') {
          return Promise.resolve([makeBackendEntry({ id: 'entry-1', mongoOperation: 'find' })]);
        }
        if (cmd === 'delete_query_history_entry') return Promise.resolve();
        return Promise.resolve();
      });

      const store = useHistoryStore();

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo/1',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      expect(store.entries).toHaveLength(1);
      const entryId = store.entries[0].id;
      await store.removeEntry(entryId);
      expect(store.entries).toHaveLength(0);
    });

    it('should clear selectedEntryId if removed entry was selected', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry')
          return Promise.resolve(makeBackendEntry({ id: 'entry-1' }));
        if (cmd === 'load_query_history')
          return Promise.resolve([makeBackendEntry({ id: 'entry-1' })]);
        if (cmd === 'delete_query_history_entry') return Promise.resolve();
        return Promise.resolve();
      });

      const store = useHistoryStore();
      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      const entryId = store.entries[0].id;
      store.selectEntry(entryId);
      expect(store.selectedEntryId).toBe(entryId);

      await store.removeEntry(entryId);
      expect(store.selectedEntryId).toBeNull();
    });

    it('should call delete_query_history_entry on remove', async () => {
      let deleteCalled = false;
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry')
          return Promise.resolve(makeBackendEntry({ id: 'entry-1' }));
        if (cmd === 'load_query_history')
          return Promise.resolve([makeBackendEntry({ id: 'entry-1' })]);
        if (cmd === 'delete_query_history_entry') {
          deleteCalled = true;
          return Promise.resolve();
        }
        return Promise.resolve();
      });

      const store = useHistoryStore();
      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      const entryId = store.entries[0].id;
      await store.removeEntry(entryId);
      expect(deleteCalled).toBe(true);
    });

    it('should restore entry on delete failure', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry')
          return Promise.resolve(makeBackendEntry({ id: 'entry-1' }));
        if (cmd === 'load_query_history')
          return Promise.resolve([makeBackendEntry({ id: 'entry-1' })]);
        if (cmd === 'delete_query_history_entry') return Promise.reject(new Error('DB error'));
        return Promise.resolve();
      });

      const store = useHistoryStore();
      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      expect(store.entries).toHaveLength(1);
      const entryId = store.entries[0].id;
      await store.removeEntry(entryId);
      // Entry should be restored after failed delete
      expect(store.entries).toHaveLength(1);
    });
  });

  describe('clearHistory', () => {
    it('should clear all entries', async () => {
      let clearCalled = false;
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry')
          return Promise.resolve(makeBackendEntry({ id: 'entry-1' }));
        if (cmd === 'load_query_history')
          return Promise.resolve([makeBackendEntry({ id: 'entry-1' })]);
        if (cmd === 'clear_query_history') {
          clearCalled = true;
          return Promise.resolve();
        }
        return Promise.resolve();
      });

      const store = useHistoryStore();
      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      expect(store.entries).toHaveLength(1);

      await store.clearHistory();

      expect(store.entries).toHaveLength(0);
      expect(store.selectedEntryId).toBeNull();
      expect(clearCalled).toBe(true);
    });

    it('should call clear_query_history on clear', async () => {
      let clearCalled = false;
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry')
          return Promise.resolve(makeBackendEntry({ id: 'entry-1' }));
        if (cmd === 'load_query_history')
          return Promise.resolve([makeBackendEntry({ id: 'entry-1' })]);
        if (cmd === 'clear_query_history') {
          clearCalled = true;
          return Promise.resolve();
        }
        return Promise.resolve();
      });

      const store = useHistoryStore();

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      await store.clearHistory();
      expect(clearCalled).toBe(true);
    });

    it('should restore entries on clear failure', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry')
          return Promise.resolve(makeBackendEntry({ id: 'entry-1' }));
        if (cmd === 'load_query_history')
          return Promise.resolve([makeBackendEntry({ id: 'entry-1' })]);
        if (cmd === 'clear_query_history') return Promise.reject(new Error('DB error'));
        return Promise.resolve();
      });

      const store = useHistoryStore();
      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      expect(store.entries).toHaveLength(1);
      await store.clearHistory();
      expect(store.entries).toHaveLength(1);
    });
  });

  describe('selectEntry', () => {
    it('should set selectedEntryId', async () => {
      const store = useHistoryStore();
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry')
          return Promise.resolve(makeBackendEntry({ id: 'entry-1' }));
        if (cmd === 'load_query_history')
          return Promise.resolve([makeBackendEntry({ id: 'entry-1' })]);
        return Promise.resolve();
      });

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
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
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry')
          return Promise.resolve(makeBackendEntry({ id: 'entry-1', mongoOperation: 'find' }));
        if (cmd === 'load_query_history')
          return Promise.resolve([makeBackendEntry({ id: 'entry-1', mongoOperation: 'find' })]);
        if (cmd === 'toggle_query_history_star') return Promise.resolve();
        return Promise.resolve();
      });

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });

      const entryId = store.entries[0].id;
      store.selectEntry(entryId);

      expect(store.selectedEntry?.mongoOperation).toBe('find');
    });

    it('starredEntries returns only starred entries', async () => {
      const store = useHistoryStore();
      let addCount = 0;
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'add_query_history_entry') {
          addCount++;
          return Promise.resolve(
            makeBackendEntry({
              id: `entry-${addCount}`,
              mongoOperation: addCount === 1 ? 'find' : 'aggregate',
            }),
          );
        }
        if (cmd === 'load_query_history') {
          if (addCount === 2) {
            return Promise.resolve([
              makeBackendEntry({ id: 'entry-2', mongoOperation: 'aggregate' }),
              makeBackendEntry({ id: 'entry-1', mongoOperation: 'find' }),
            ]);
          }
          return Promise.resolve([]);
        }
        if (cmd === 'toggle_query_history_star') return Promise.resolve();
        return Promise.resolve();
      });

      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo/1',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
        mongoOperation: 'find',
        mongoCollection: 'users',
      });
      await store.addEntry({
        databaseType: DatabaseType.MONGODB,
        method: 'POST',
        path: '/api/mongo/2',
        connectionName: 'test-mongo',
        connectionId: 'test-mongo-id',
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
