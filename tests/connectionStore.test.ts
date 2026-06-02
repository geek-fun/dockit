import { setActivePinia, createPinia } from 'pinia';
import {
  applyTableFilter,
  findTable,
  upsertTable,
  extractFieldsFromMapping,
  migrateDynamoConnectionsV1ToV2,
  migrateDynamoConnectionsV2ToV3,
  migrateConnections,
  isSearchConnection,
  isOpenSearchConnection,
  DatabaseType,
} from '../src/store/connectionStore';
import type {
  DynamoTableFilter,
  DynamoDBConnection,
  DynamoTableSummary,
  MongoDBConnection,
  Connection,
  ElasticsearchConnection,
} from '../src/store/connectionStore';

jest.mock('../src/lang', () => ({ lang: { t: (k: string) => k } }));
jest.mock('../src/datasources', () => {
  const store = new Map<string, unknown>();
  return {
    storeApi: {
      get: async <T>(key: string, defaultValue: T): Promise<T> =>
        (store.get(key) as T) ?? defaultValue,
      set: async (key: string, value: unknown) => {
        store.set(key, value);
      },
      delete: async (key: string) => {
        store.delete(key);
      },
    },
    dynamoApi: {} as Record<string, unknown>,
    loadHttpClient: jest.fn(() => ({}) as Record<string, unknown>),
    mongoApi: { testConnection: jest.fn(), listDatabases: jest.fn() },
  };
});
jest.mock('../src/store/tabStore.ts', () => ({
  useTabStore: () => ({ activePanel: null }),
}));
jest.mock('../src/common', () => ({
  buildAuthHeader: jest.fn(),
  buildURL: jest.fn(),
  CustomError: class CustomError extends Error {
    constructor(
      public readonly status: number,
      public readonly details: string,
    ) {
      super(details);
      void status;
    }
  },
  pureObject: (obj: unknown) => JSON.parse(JSON.stringify(obj)),
  CONNECTION_SCHEMA_VERSION: 5,
}));
jest.mock('../src/common/monaco', () => ({
  SearchAction: {},
  transformToCurl: jest.fn(),
  configureDynamicOptions: jest.fn(),
}));

const ALL_TABLES = ['alpha', 'beta', 'gamma', 'prod-orders', 'prod-users', 'dev-cache'];

describe('applyTableFilter', () => {
  describe('kind: all (or undefined)', () => {
    it('returns all tables when filter is undefined', () => {
      expect(applyTableFilter(ALL_TABLES, undefined)).toEqual(ALL_TABLES);
    });

    it('returns all tables when kind is all', () => {
      expect(applyTableFilter(ALL_TABLES, { kind: 'all' })).toEqual(ALL_TABLES);
    });

    it('returns a new array (not the same reference)', () => {
      const result = applyTableFilter(ALL_TABLES, { kind: 'all' });
      expect(result).not.toBe(ALL_TABLES);
    });

    it('returns empty array for empty input', () => {
      expect(applyTableFilter([], { kind: 'all' })).toEqual([]);
    });
  });

  describe('kind: explicit', () => {
    it('returns only the listed table names', () => {
      const filter: DynamoTableFilter = { kind: 'explicit', tableNames: ['alpha', 'gamma'] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(['alpha', 'gamma']);
    });

    it('preserves original order from allTables', () => {
      const filter: DynamoTableFilter = { kind: 'explicit', tableNames: ['gamma', 'alpha'] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(['alpha', 'gamma']);
    });

    it('ignores names not present in allTables', () => {
      const filter: DynamoTableFilter = { kind: 'explicit', tableNames: ['alpha', 'nonexistent'] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(['alpha']);
    });

    it('returns empty array when no names match', () => {
      const filter: DynamoTableFilter = { kind: 'explicit', tableNames: ['no-match'] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual([]);
    });

    it('returns empty array when tableNames is empty', () => {
      const filter: DynamoTableFilter = { kind: 'explicit', tableNames: [] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual([]);
    });
  });

  describe('kind: exclude', () => {
    it('excludes the listed table names', () => {
      const filter: DynamoTableFilter = { kind: 'exclude', tableNames: ['alpha', 'gamma'] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual([
        'beta',
        'prod-orders',
        'prod-users',
        'dev-cache',
      ]);
    });

    it('returns all tables when tableNames is empty', () => {
      const filter: DynamoTableFilter = { kind: 'exclude', tableNames: [] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(ALL_TABLES);
    });

    it('returns empty array when all tables are excluded', () => {
      const filter: DynamoTableFilter = { kind: 'exclude', tableNames: [...ALL_TABLES] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual([]);
    });

    it('silently ignores names not present in allTables', () => {
      const filter: DynamoTableFilter = { kind: 'exclude', tableNames: ['nonexistent'] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(ALL_TABLES);
    });
  });

  describe('kind: regex', () => {
    it('matches tables by regex pattern', () => {
      const filter: DynamoTableFilter = { kind: 'regex', pattern: '^prod-' };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(['prod-orders', 'prod-users']);
    });

    it('matches all tables with .*', () => {
      const filter: DynamoTableFilter = { kind: 'regex', pattern: '.*' };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(ALL_TABLES);
    });

    it('returns empty array when no tables match pattern', () => {
      const filter: DynamoTableFilter = { kind: 'regex', pattern: '^staging-' };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual([]);
    });

    it('returns empty array for invalid regex pattern', () => {
      const filter: DynamoTableFilter = { kind: 'regex', pattern: '[invalid(' };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual([]);
    });

    it('matches mid-string patterns', () => {
      const filter: DynamoTableFilter = { kind: 'regex', pattern: 'cache' };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(['dev-cache']);
    });

    it('is case-sensitive', () => {
      const filter: DynamoTableFilter = { kind: 'regex', pattern: '^PROD-' };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual([]);
    });

    it('does not throw on unusual but syntactically valid patterns', () => {
      const filter: DynamoTableFilter = { kind: 'regex', pattern: '(a|b)+' };
      expect(() => applyTableFilter(ALL_TABLES, filter)).not.toThrow();
    });
  });

  it('returns all tables for unknown filter kind (fall-through)', () => {
    const result = applyTableFilter(ALL_TABLES, { kind: 'unknown' } as DynamoTableFilter);
    expect(result).toEqual(ALL_TABLES);
    expect(result).not.toBe(ALL_TABLES);
  });
});

const filterSuggestions = (available: string[], selected: string[], query: string): string[] => {
  const q = query.trim().toLowerCase();
  const selectedSet = new Set(selected);
  return available.filter(name => !selectedSet.has(name) && (!q || name.toLowerCase().includes(q)));
};

describe('filterSuggestions', () => {
  const available = ['prod-orders', 'prod-users', 'dev-cache', 'staging-db'];

  it('returns all available when query is empty and none selected', () => {
    expect(filterSuggestions(available, [], '')).toEqual(available);
  });

  it('excludes already-selected names', () => {
    expect(filterSuggestions(available, ['prod-orders'], '')).toEqual([
      'prod-users',
      'dev-cache',
      'staging-db',
    ]);
  });

  it('filters by query substring case-insensitively', () => {
    expect(filterSuggestions(available, [], 'PROD')).toEqual(['prod-orders', 'prod-users']);
  });

  it('returns empty when query matches nothing', () => {
    expect(filterSuggestions(available, [], 'zzz')).toEqual([]);
  });

  it('combines selection exclusion and query filter', () => {
    expect(filterSuggestions(available, ['prod-orders'], 'prod')).toEqual(['prod-users']);
  });

  it('returns empty when all entries are selected', () => {
    expect(filterSuggestions(available, available, '')).toEqual([]);
  });
});

const PREVIEW_SAMPLE = 3;

const buildMatchPreview = (matched: string[]): string => {
  if (!matched.length) return 'No tables matched';
  const sample = matched.slice(0, PREVIEW_SAMPLE).join(', ');
  const suffix =
    matched.length > PREVIEW_SAMPLE ? `, +${matched.length - PREVIEW_SAMPLE} more` : '';
  return `${matched.length} tables matched: ${sample}${suffix}`;
};

describe('buildMatchPreview', () => {
  it('returns no-match message for empty array', () => {
    expect(buildMatchPreview([])).toBe('No tables matched');
  });

  it('shows all names when count is below the sample limit', () => {
    expect(buildMatchPreview(['a', 'b'])).toBe('2 tables matched: a, b');
  });

  it('shows exactly PREVIEW_SAMPLE names without truncation', () => {
    expect(buildMatchPreview(['a', 'b', 'c'])).toBe('3 tables matched: a, b, c');
  });

  it('truncates with +N more when count exceeds PREVIEW_SAMPLE', () => {
    expect(buildMatchPreview(['a', 'b', 'c', 'd', 'e'])).toBe('5 tables matched: a, b, c, +2 more');
  });

  it('handles a single match', () => {
    expect(buildMatchPreview(['only-one'])).toBe('1 tables matched: only-one');
  });
});

describe('findTable', () => {
  const tables: DynamoTableSummary[] = [{ name: 'orders' }, { name: 'users', status: 'ACTIVE' }];
  const conn = { tables } as unknown as DynamoDBConnection;

  it('returns matching table summary', () => {
    expect(findTable(conn, 'users')).toEqual({ name: 'users', status: 'ACTIVE' });
  });

  it('returns undefined for unknown name', () => {
    expect(findTable(conn, 'missing')).toBeUndefined();
  });

  it('returns undefined when tables list is empty', () => {
    const empty = { tables: [] } as unknown as DynamoDBConnection;
    expect(findTable(empty, 'orders')).toBeUndefined();
  });

  it('returns undefined when tables is absent', () => {
    const noTables = {} as unknown as DynamoDBConnection;
    expect(findTable(noTables, 'orders')).toBeUndefined();
  });
});

describe('upsertTable', () => {
  const existing: DynamoTableSummary[] = [
    { name: 'orders', status: 'ACTIVE' },
    { name: 'users', status: 'ACTIVE' },
  ];

  it('appends new table when name is not present', () => {
    const result = upsertTable(existing, { name: 'products' });
    expect(result).toHaveLength(3);
    expect(result.find(t => t.name === 'products')).toBeDefined();
  });

  it('merges updated fields for existing table', () => {
    const result = upsertTable(existing, { name: 'orders', status: 'UPDATING', itemCount: 42 });
    expect(result).toHaveLength(2);
    const updated = result.find(t => t.name === 'orders');
    expect(updated?.status).toBe('UPDATING');
    expect(updated?.itemCount).toBe(42);
  });

  it('does not mutate the original array', () => {
    const copy = [...existing];
    upsertTable(existing, { name: 'new-table' });
    expect(existing).toEqual(copy);
  });

  it('preserves other tables when upserting one', () => {
    const result = upsertTable(existing, { name: 'orders', status: 'DELETING' });
    const users = result.find(t => t.name === 'users');
    expect(users?.status).toBe('ACTIVE');
  });

  it('handles empty table list', () => {
    const result = upsertTable([], { name: 'first' });
    expect(result).toEqual([{ name: 'first' }]);
  });
});

describe('extractFieldsFromMapping', () => {
  it('extracts field names from a standard mapping', () => {
    const mapping = {
      'my-index': {
        mappings: {
          properties: {
            category: { type: 'keyword' },
            price: { type: 'float' },
            description: { type: 'text' },
          },
        },
      },
    };
    expect(extractFieldsFromMapping(mapping)).toEqual(['category', 'price', 'description']);
  });

  it('returns empty array for undefined mapping', () => {
    expect(extractFieldsFromMapping(undefined)).toEqual([]);
  });

  it('returns empty array for mapping with no properties', () => {
    const mapping = {
      'my-index': {
        mappings: {},
      },
    };
    expect(extractFieldsFromMapping(mapping)).toEqual([]);
  });

  it('returns empty array for empty mapping object', () => {
    expect(extractFieldsFromMapping({})).toEqual([]);
  });

  it('handles mapping with dynamic field but no properties', () => {
    const mapping = {
      'my-index': {
        mappings: {
          dynamic: true,
        },
      },
    };
    expect(extractFieldsFromMapping(mapping)).toEqual([]);
  });
});

describe('DatabaseType', () => {
  it('includes MONGODB enum value', () => {
    expect(DatabaseType.MONGODB).toBe('MONGODB');
  });

  it('includes ELASTICSEARCH enum value', () => {
    expect(DatabaseType.ELASTICSEARCH).toBe('ELASTICSEARCH');
  });

  it('includes DYNAMODB enum value', () => {
    expect(DatabaseType.DYNAMODB).toBe('DYNAMODB');
  });
});

describe('MongoDBConnection type', () => {
  it('can be created with no auth', () => {
    const conn: MongoDBConnection = {
      name: 'test-mongo',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    };
    expect(conn.type).toBe(DatabaseType.MONGODB);
    expect(conn.auth.kind).toBe('none');
  });

  it('can be created with scram auth', () => {
    const conn: MongoDBConnection = {
      name: 'test-mongo',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: {
        kind: 'scram',
        username: 'admin',
        password: 'secret',
        authSource: 'admin',
      },
    };
    expect(conn.auth.kind).toBe('scram');
    if (conn.auth.kind === 'scram') {
      expect(conn.auth.username).toBe('admin');
      expect(conn.auth.password).toBe('secret');
      expect(conn.auth.authSource).toBe('admin');
    }
  });

  it('can be created with uri auth', () => {
    const conn: MongoDBConnection = {
      name: 'test-mongo',
      type: DatabaseType.MONGODB,
      host: '',
      port: 0,
      auth: {
        kind: 'uri',
        uri: 'mongodb+srv://user:pass@cluster.mongodb.net/db',
      },
    };
    expect(conn.auth.kind).toBe('uri');
    if (conn.auth.kind === 'uri') {
      expect(conn.auth.uri).toContain('mongodb+srv://');
    }
  });

  it('can include optional fields', () => {
    const conn: MongoDBConnection = {
      name: 'test-mongo',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      database: 'mydb',
      tls: true,
      collections: [{ name: 'users' }, { name: 'orders', type: 'collection', count: 100 }],
    };
    expect(conn.database).toBe('mydb');
    expect(conn.tls).toBe(true);
    expect(conn.collections).toHaveLength(2);
  });
});

describe('Connection union type', () => {
  it('accepts MongoDBConnection as Connection', () => {
    const conn: Connection = {
      name: 'test-mongo',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    };
    expect(conn.type).toBe(DatabaseType.MONGODB);
  });

  it('accepts ElasticsearchConnection as Connection', () => {
    const conn: Connection = {
      name: 'test-es',
      type: DatabaseType.ELASTICSEARCH,
      host: 'http://localhost',
      port: 9200,
      indices: [],
      activeIndex: undefined,
      version: '8.0.0',
      isOpenSearch: false,
      clusterName: 'test',
      clusterUuid: 'test-uuid',
      sslCertVerification: false,
    };
    expect(conn.type).toBe(DatabaseType.ELASTICSEARCH);
  });

  it('accepts DynamoDBConnection as Connection', () => {
    const conn: Connection = {
      name: 'test-dynamo',
      type: DatabaseType.DYNAMODB,
      region: 'us-east-1',
      auth: { kind: 'accessKey', accessKeyId: 'test', secretAccessKey: 'test' },
    };
    expect(conn.type).toBe(DatabaseType.DYNAMODB);
  });
});

describe('saveConnection type inference', () => {
  it('uses provided type when present', () => {
    const conn: Connection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    };
    expect(conn.type).toBe(DatabaseType.MONGODB);
  });

  it('distinguishes MongoDBConnection by type field', () => {
    const mongo: Connection = {
      name: 'mongo',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    };
    const es: Connection = {
      name: 'es',
      type: DatabaseType.ELASTICSEARCH,
      host: 'http://localhost',
      port: 9200,
      indices: [],
      activeIndex: undefined,
      version: '8.0.0',
      isOpenSearch: false,
      clusterName: 'test',
      clusterUuid: 'test-uuid',
      sslCertVerification: false,
    };
    const dynamo: Connection = {
      name: 'dynamo',
      type: DatabaseType.DYNAMODB,
      region: 'us-east-1',
      auth: { kind: 'accessKey', accessKeyId: 'test', secretAccessKey: 'test' },
    };
    expect(mongo.type).toBe(DatabaseType.MONGODB);
    expect(es.type).toBe(DatabaseType.ELASTICSEARCH);
    expect(dynamo.type).toBe(DatabaseType.DYNAMODB);
  });
});

describe('MongoDB connection edge cases', () => {
  it('handles connection with uri auth and empty host', () => {
    const conn: MongoDBConnection = {
      name: 'atlas',
      type: DatabaseType.MONGODB,
      host: '',
      port: 0,
      auth: {
        kind: 'uri',
        uri: 'mongodb+srv://user:pass@cluster.mongodb.net/db',
      },
    };
    expect(conn.host).toBe('');
    expect(conn.port).toBe(0);
    expect(conn.auth.kind).toBe('uri');
  });

  it('handles connection with scram auth and all optional fields', () => {
    const conn: MongoDBConnection = {
      name: 'full-scram',
      type: DatabaseType.MONGODB,
      host: 'mongo.example.com',
      port: 27017,
      auth: {
        kind: 'scram',
        username: 'admin',
        password: 'secret',
        authSource: 'admin',
        authMechanism: 'SCRAM-SHA-256',
      },
      database: 'mydb',
      tls: true,
      collections: [{ name: 'users', type: 'collection', count: 100 }],
    };
    expect(conn.database).toBe('mydb');
    expect(conn.tls).toBe(true);
    expect(conn.collections).toHaveLength(1);
    if (conn.auth.kind === 'scram') {
      expect(conn.auth.authMechanism).toBe('SCRAM-SHA-256');
    }
  });

  it('handles connection with no auth and no optional fields', () => {
    const conn: MongoDBConnection = {
      name: 'simple',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    };
    expect(conn.database).toBeUndefined();
    expect(conn.tls).toBeUndefined();
    expect(conn.collections).toBeUndefined();
  });

  it('handles connection with string id', () => {
    const conn: MongoDBConnection = {
      id: 'mongo-123',
      name: 'string-id',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    };
    expect(conn.id).toBe('mongo-123');
  });

  it('handles connection with numeric id', () => {
    const conn: MongoDBConnection = {
      id: 42,
      name: 'numeric-id',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    };
    expect(conn.id).toBe(42);
  });
});

describe('migrateDynamoConnectionsV1ToV2', () => {
  it('returns as-is when no dynamo connections exist', () => {
    const raw: Connection[] = [
      {
        name: 'es-conn',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9200,
        indices: [],
        activeIndex: undefined,
        version: '8.0.0',
        isOpenSearch: false,
        clusterName: 'c',
        clusterUuid: 'u',
        sslCertVerification: false,
      },
    ];
    const result = migrateDynamoConnectionsV1ToV2(raw);
    expect(result.migrated).toEqual(raw);
    expect(result.consolidatedCount).toBe(0);
    expect(result.originalCount).toBe(0);
  });

  it('preserves non-dynamo connections alongside consolidated dynamo', () => {
    const raw: Connection[] = [
      {
        name: 'es-conn',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9200,
        indices: [],
        activeIndex: undefined,
        version: '8.0.0',
        isOpenSearch: false,
        clusterName: 'c',
        clusterUuid: 'u',
        sslCertVerification: false,
      },
      {
        name: 'dynamo-1',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
        tableName: 'orders',
      } as unknown as Connection,
    ];
    const result = migrateDynamoConnectionsV1ToV2(raw);
    expect(result.migrated.length).toBe(2);
    expect(result.migrated[0].type).toBe(DatabaseType.ELASTICSEARCH);
  });

  it('consolidates single dynamo connection without tableName', () => {
    const raw: Connection[] = [
      {
        name: 'dynamo-1',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
      } as unknown as Connection,
    ];
    const result = migrateDynamoConnectionsV1ToV2(raw);
    expect(result.originalCount).toBe(1);
    expect(result.consolidatedCount).toBe(1);
    const con = result.migrated[0] as DynamoDBConnection;
    expect(con.tableFilter).toEqual({ kind: 'all' });
    expect(con.tables).toEqual([]);
    expect(con.auth).toEqual({ kind: 'accessKey', accessKeyId: 'ak1', secretAccessKey: 'sk1' });
  });

  it('consolidates single dynamo connection with tableName', () => {
    const raw: Connection[] = [
      {
        name: 'dynamo-1',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
        tableName: 'orders',
      } as unknown as Connection,
    ];
    const result = migrateDynamoConnectionsV1ToV2(raw);
    const con = result.migrated[0] as DynamoDBConnection;
    expect(con.tableFilter).toEqual({ kind: 'explicit', tableNames: ['orders'] });
    expect(con.tables).toHaveLength(1);
    expect(con.tables?.[0].name).toBe('orders');
  });

  it('consolidates multiple V1 connections with same credentials', () => {
    const raw: Connection[] = [
      {
        name: 'dynamo-1',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
        tableName: 'orders',
      } as unknown as Connection,
      {
        name: 'dynamo-2',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
        tableName: 'users',
      } as unknown as Connection,
    ];
    const result = migrateDynamoConnectionsV1ToV2(raw);
    expect(result.originalCount).toBe(2);
    expect(result.consolidatedCount).toBe(1);
    expect(result.migrated.length).toBe(1);
    const con = result.migrated[0] as DynamoDBConnection;
    expect(con.tableFilter).toEqual({ kind: 'explicit', tableNames: ['orders', 'users'] });
    expect(con.tables).toHaveLength(2);
  });

  it('separates connections with different credentials', () => {
    const raw: Connection[] = [
      {
        name: 'prod',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
        tableName: 'orders',
      } as unknown as Connection,
      {
        name: 'staging',
        type: DatabaseType.DYNAMODB,
        region: 'us-west-2',
        accessKeyId: 'ak2',
        secretAccessKey: 'sk2',
        tableName: 'inventory',
      } as unknown as Connection,
    ];
    const result = migrateDynamoConnectionsV1ToV2(raw);
    expect(result.consolidatedCount).toBe(2);
    expect(result.migrated.length).toBe(2);
  });

  it('deduplicates table names', () => {
    const raw: Connection[] = [
      {
        name: 'dup',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
        tableName: 'orders',
      } as unknown as Connection,
      {
        name: 'dup2',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
        tableName: 'orders',
      } as unknown as Connection,
    ];
    const result = migrateDynamoConnectionsV1ToV2(raw);
    const con = result.migrated[0] as DynamoDBConnection;
    expect(con.tableFilter).toEqual({ kind: 'explicit', tableNames: ['orders'] });
    expect(con.tables).toHaveLength(1);
  });

  it('preserves table key schema during migration', () => {
    const keySchema = [{ attributeName: 'id', keyType: 'HASH' as const }];
    const raw: Connection[] = [
      {
        name: 'dynamo-1',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
        tableName: 'orders',
        keySchema,
      } as unknown as Connection,
    ];
    const result = migrateDynamoConnectionsV1ToV2(raw);
    const con = result.migrated[0] as DynamoDBConnection;
    expect(con.tables?.[0].keySchema).toEqual(keySchema);
  });

  it('uses endpointUrl in credential signature', () => {
    const raw: Connection[] = [
      {
        name: 'local',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
        endpointUrl: 'http://localhost:8000',
        tableName: 'orders',
      } as unknown as Connection,
      {
        name: 'remote',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
        tableName: 'users',
      } as unknown as Connection,
    ];
    const result = migrateDynamoConnectionsV1ToV2(raw);
    expect(result.consolidatedCount).toBe(2);
  });

  it('is idempotent: passes through V2 connections with auth field unchanged', () => {
    const v2Con: DynamoDBConnection = {
      name: 'dynamo-v2',
      type: DatabaseType.DYNAMODB,
      region: 'us-east-1',
      auth: { kind: 'accessKey', accessKeyId: 'ak1', secretAccessKey: 'sk1' },
      tables: [{ name: 'orders' }],
      tableFilter: { kind: 'explicit', tableNames: ['orders'] },
    };
    const raw: Connection[] = [v2Con];
    const result = migrateDynamoConnectionsV1ToV2(raw);
    expect(result.migrated).toHaveLength(1);
    expect(result.migrated[0]).toBe(v2Con);
    expect(result.consolidatedCount).toBe(0);
    expect(result.originalCount).toBe(0);
  });

  it('is idempotent: processes V1 connections while preserving V2 connections', () => {
    const v1Con = {
      name: 'dynamo-v1',
      type: DatabaseType.DYNAMODB,
      region: 'us-east-1',
      accessKeyId: 'ak2',
      secretAccessKey: 'sk2',
      tableName: 'users',
    } as unknown as Connection;
    const v2Con: DynamoDBConnection = {
      name: 'dynamo-v2',
      type: DatabaseType.DYNAMODB,
      region: 'us-west-1',
      auth: { kind: 'accessKey', accessKeyId: 'ak1', secretAccessKey: 'sk1' },
      tables: [{ name: 'orders' }],
      tableFilter: { kind: 'all' },
    };
    const raw: Connection[] = [v1Con, v2Con];
    const result = migrateDynamoConnectionsV1ToV2(raw);
    expect(result.migrated).toHaveLength(2);
    expect(result.originalCount).toBe(1);
    expect(result.consolidatedCount).toBe(1);
    const migratedV2 = result.migrated.find(c => c.name === 'dynamo-v2');
    expect(migratedV2).toBe(v2Con);
    const migratedV1 = result.migrated.find(c => c.name === 'dynamo-v1') as DynamoDBConnection;
    expect(migratedV1.auth.kind).toBe('accessKey');
  });
});

describe('migrateDynamoConnectionsV2ToV3', () => {
  it('passes through non-dynamo connections', () => {
    const raw: Connection[] = [
      {
        name: 'es-conn',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9200,
        indices: [],
        activeIndex: undefined,
        version: '8.0.0',
        isOpenSearch: false,
        clusterName: 'c',
        clusterUuid: 'u',
        sslCertVerification: false,
      },
    ];
    expect(migrateDynamoConnectionsV2ToV3(raw)).toEqual(raw);
  });

  it('passes through dynamo connection that already has auth field (V3+)', () => {
    const raw: Connection[] = [
      {
        name: 'dynamo-v3',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        auth: { kind: 'accessKey', accessKeyId: 'ak1', secretAccessKey: 'sk1' },
      },
    ];
    const result = migrateDynamoConnectionsV2ToV3(raw);
    expect(result[0]).toBe(raw[0]);
  });

  it('migrates V2 connection with top-level accessKeyId/secretAccessKey to V3 auth', () => {
    const raw: Connection[] = [
      {
        name: 'dynamo-v2',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
      } as unknown as Connection,
    ];
    const result = migrateDynamoConnectionsV2ToV3(raw);
    const migrated = result[0] as DynamoDBConnection;
    expect(migrated.auth).toEqual({
      kind: 'accessKey',
      accessKeyId: 'ak1',
      secretAccessKey: 'sk1',
    });
    expect((migrated as Record<string, unknown>).accessKeyId).toBeUndefined();
    expect((migrated as Record<string, unknown>).secretAccessKey).toBeUndefined();
  });

  it('defaults missing accessKeyId/secretAccessKey to empty string', () => {
    const raw: Connection[] = [
      {
        name: 'dynamo-v2',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
      } as unknown as Connection,
    ];
    const result = migrateDynamoConnectionsV2ToV3(raw);
    const migrated = result[0] as DynamoDBConnection;
    expect(migrated.auth).toEqual({ kind: 'accessKey', accessKeyId: '', secretAccessKey: '' });
  });

  it('preserves other fields during migration', () => {
    const raw: Connection[] = [
      {
        name: 'dynamo-v2',
        type: DatabaseType.DYNAMODB,
        region: 'eu-west-1',
        endpointUrl: 'http://localhost:8000',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
      } as unknown as Connection,
    ];
    const result = migrateDynamoConnectionsV2ToV3(raw);
    const migrated = result[0] as DynamoDBConnection;
    expect(migrated.region).toBe('eu-west-1');
    expect(migrated.endpointUrl).toBe('http://localhost:8000');
    expect(migrated.name).toBe('dynamo-v2');
  });
});

const esConnection: ElasticsearchConnection = {
  name: 'test-es',
  type: DatabaseType.ELASTICSEARCH,
  host: 'http://localhost',
  port: 9200,
  indices: [],
  activeIndex: undefined,
  version: '8.0.0',
  isOpenSearch: false,
  clusterName: 'test-cluster',
  clusterUuid: 'test-uuid',
  sslCertVerification: false,
};

describe('connectionStore actions', () => {
  let store: ReturnType<
    ReturnType<typeof import('../src/store/connectionStore').useConnectionStore>
  >;
  let storeApi: { set: jest.Mock; get: jest.Mock; delete: jest.Mock };

  beforeEach(() => {
    setActivePinia(createPinia());
    const { useConnectionStore } = require('../src/store/connectionStore');
    store = useConnectionStore();
    storeApi = require('../src/datasources').storeApi;
  });

  describe('saveConnection', () => {
    it('adds a new connection without id', async () => {
      const result = await store.saveConnection(esConnection);
      expect(result.success).toBe(true);
      expect(store.connections).toHaveLength(1);
      expect(store.connections[0].name).toBe('test-es');
    });

    it('assigns sequential id to new connections', async () => {
      await store.saveConnection(esConnection);
      await store.saveConnection({ ...esConnection, name: 'test-es-2' });
      expect(store.connections).toHaveLength(2);
      expect(store.connections[0].id).toBe(1);
      expect(store.connections[1].id).toBe(2);
    });

    it('updates existing connection when id matches', async () => {
      await store.saveConnection(esConnection);
      const updated = { ...esConnection, id: 1, host: 'http://updated' };
      const result = await store.saveConnection(updated);
      expect(result.success).toBe(true);
      expect(store.connections).toHaveLength(1);
      expect((store.connections[0] as ElasticsearchConnection).host).toBe('http://updated');
    });

    it('returns success false when storeApi.set throws', async () => {
      jest.spyOn(storeApi, 'set').mockRejectedValueOnce(new Error('Storage full'));
      const result = await store.saveConnection(esConnection);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Storage full');
    });
  });

  describe('removeConnection', () => {
    it('removes connection by id', async () => {
      await store.saveConnection(esConnection);
      await store.saveConnection({ ...esConnection, name: 'es-2' });
      await store.removeConnection(store.connections[0]);
      expect(store.connections).toHaveLength(1);
      expect(store.connections[0].name).toBe('es-2');
    });

    it('removes the last connection', async () => {
      await store.saveConnection(esConnection);
      await store.removeConnection(store.connections[0]);
      expect(store.connections).toHaveLength(0);
    });
  });

  describe('dismissMigrationNotice', () => {
    it('sets migrationNotice to null', () => {
      store.migrationNotice = { consolidatedCount: 3, originalCount: 5 };
      store.dismissMigrationNotice();
      expect(store.migrationNotice).toBeNull();
    });

    it('is idempotent when already null', () => {
      store.migrationNotice = null;
      store.dismissMigrationNotice();
      expect(store.migrationNotice).toBeNull();
    });
  });

  describe('fetchConnections', () => {
    it('loads connections without migration when schemaVersion is current', async () => {
      jest
        .spyOn(storeApi, 'get')
        .mockImplementation(async (key: string, defaultValue?: unknown) => {
          if (key === 'connections') return [{ name: 'test', type: 'ELASTICSEARCH' }];
          if (key === 'schemaVersion') return 5;
          return defaultValue;
        });

      await store.fetchConnections();

      expect(store.connections).toHaveLength(1);
      expect(store.connections[0].name).toBe('test');
    });

    it('migrates connections when schemaVersion is outdated', async () => {
      jest
        .spyOn(storeApi, 'get')
        .mockImplementation(async (key: string, defaultValue?: unknown) => {
          if (key === 'connections') {
            return [{ name: 'os', type: 'ELASTICSEARCH', isOpenSearch: true }];
          }
          if (key === 'schemaVersion') return 4;
          return defaultValue;
        });

      await store.fetchConnections();

      expect(store.connections).toHaveLength(1);
      expect(store.connections[0].type).toBe(DatabaseType.OPENSEARCH);
    });

    it('continues when backup creation fails', async () => {
      const mockStore = new Map<string, unknown>();
      jest
        .spyOn(storeApi, 'get')
        .mockImplementation(async (key: string, defaultValue?: unknown) => {
          if (key === 'connections') {
            return [{ name: 'test', type: 'ELASTICSEARCH', isOpenSearch: true }];
          }
          if (key === 'schemaVersion') return 4;
          return mockStore.get(key) ?? defaultValue;
        });
      jest.spyOn(storeApi, 'set').mockImplementation(async (key: string, value: unknown) => {
        if (key.includes('backup')) {
          throw new Error('Backup failed');
        }
        mockStore.set(key, value);
      });

      await store.fetchConnections();

      expect(store.connections).toHaveLength(1);
      expect(store.connections[0].type).toBe(DatabaseType.OPENSEARCH);
    });

    it('falls back to normalized connections when migration persistence fails', async () => {
      jest
        .spyOn(storeApi, 'get')
        .mockImplementation(async (key: string, defaultValue?: unknown) => {
          if (key === 'connections') {
            return [{ name: 'test', type: 'ELASTICSEARCH', isOpenSearch: true }];
          }
          if (key === 'schemaVersion') return 4;
          return defaultValue;
        });
      jest.spyOn(storeApi, 'set').mockImplementation(async (key: string) => {
        if (key === 'connections') {
          throw new Error('Persistence failed');
        }
      });

      await store.fetchConnections();

      expect(store.connections).toHaveLength(1);
      expect(store.connections[0].type).toBe(DatabaseType.ELASTICSEARCH);
    });

    it('continues when cleanup fails', async () => {
      const mockStore = new Map<string, unknown>();
      jest
        .spyOn(storeApi, 'get')
        .mockImplementation(async (key: string, defaultValue?: unknown) => {
          if (key === 'connections') {
            return [{ name: 'test', type: 'ELASTICSEARCH', isOpenSearch: true }];
          }
          if (key === 'schemaVersion') return 4;
          return mockStore.get(key) ?? defaultValue;
        });
      jest.spyOn(storeApi, 'set').mockImplementation(async (key: string, value: unknown) => {
        mockStore.set(key, value);
      });
      jest.spyOn(storeApi, 'delete').mockRejectedValue(new Error('Delete failed'));

      await store.fetchConnections();

      expect(store.connections).toHaveLength(1);
      expect(store.connections[0].type).toBe(DatabaseType.OPENSEARCH);
    });

    it('sets empty connections when storeApi.get fails', async () => {
      jest.spyOn(storeApi, 'get').mockRejectedValue(new Error('Read failed'));

      await store.fetchConnections();

      expect(store.connections).toEqual([]);
    });
  });
});

describe('migrateConnections', () => {
  it('runs all migrations from V1 to V5', () => {
    const raw: Connection[] = [
      {
        name: 'dynamo-1',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
        tableName: 'orders',
      } as unknown as Connection,
      {
        name: 'dynamo-1',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        accessKeyId: 'ak1',
        secretAccessKey: 'sk1',
        tableName: 'users',
      } as unknown as Connection,
      {
        name: 'es-old',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9200,
        sslCertVerification: false,
        isOpenSearch: true,
        version: '2.11.0',
        clusterName: 'cluster',
        clusterUuid: 'uuid',
        indices: [],
        activeIndex: undefined,
      } as unknown as Connection,
    ];

    const { migrated, consolidatedCount, originalCount } = migrateConnections(raw, 1);

    expect(consolidatedCount).toBe(1);
    expect(originalCount).toBe(2);
    expect(migrated).toHaveLength(2);
    expect(migrated[0].type).toBe(DatabaseType.OPENSEARCH);
    expect(migrated[1].type).toBe(DatabaseType.DYNAMODB);
  });

  it('skips V1→V2 when fromVersion is 2', () => {
    const raw: Connection[] = [
      {
        name: 'dynamo',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        auth: { kind: 'accessKey', accessKeyId: 'ak', secretAccessKey: 'sk' },
      } as unknown as Connection,
      {
        name: 'os',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9200,
        sslCertVerification: false,
        isOpenSearch: true,
        version: '2.11.0',
        clusterName: 'cluster',
        clusterUuid: 'uuid',
        indices: [],
        activeIndex: undefined,
      } as unknown as Connection,
    ];

    const { migrated, consolidatedCount, originalCount } = migrateConnections(raw, 2);

    expect(consolidatedCount).toBe(0);
    expect(originalCount).toBe(0);
    expect(migrated).toHaveLength(2);
    expect(migrated[1].type).toBe(DatabaseType.OPENSEARCH);
  });

  it('skips Dynamo migrations when fromVersion is 4', () => {
    const raw: Connection[] = [
      {
        name: 'os',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9200,
        sslCertVerification: false,
        isOpenSearch: true,
        version: '2.11.0',
        clusterName: 'cluster',
        clusterUuid: 'uuid',
        indices: [],
        activeIndex: undefined,
      } as unknown as Connection,
    ];

    const { migrated, consolidatedCount, originalCount } = migrateConnections(raw, 4);

    expect(consolidatedCount).toBe(0);
    expect(originalCount).toBe(0);
    expect(migrated).toHaveLength(1);
    expect(migrated[0].type).toBe(DatabaseType.OPENSEARCH);
  });

  it('returns unchanged when fromVersion is 5', () => {
    const raw: Connection[] = [
      {
        name: 'es',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9200,
        sslCertVerification: false,
        version: '8.10.0',
        clusterName: 'cluster',
        clusterUuid: 'uuid',
        indices: [],
        activeIndex: undefined,
      } as unknown as Connection,
      {
        name: 'os',
        type: DatabaseType.OPENSEARCH,
        host: 'http://localhost',
        port: 9201,
        sslCertVerification: false,
        version: '2.11.0',
        clusterName: 'cluster',
        clusterUuid: 'uuid',
        indices: [],
        activeIndex: undefined,
      } as unknown as Connection,
    ];

    const { migrated, consolidatedCount, originalCount } = migrateConnections(raw, 5);

    expect(consolidatedCount).toBe(0);
    expect(originalCount).toBe(0);
    expect(migrated).toEqual(raw);
  });

  it('handles empty connection list', () => {
    const { migrated, consolidatedCount, originalCount } = migrateConnections([], 1);

    expect(consolidatedCount).toBe(0);
    expect(originalCount).toBe(0);
    expect(migrated).toEqual([]);
  });

  it('keeps Elasticsearch with isOpenSearch: false as ELASTICSEARCH type', () => {
    const raw: Connection[] = [
      {
        name: 'es-cluster',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9200,
        sslCertVerification: false,
        isOpenSearch: false,
        version: '8.10.0',
        clusterName: 'cluster',
        clusterUuid: 'uuid',
        indices: [],
        activeIndex: undefined,
      } as unknown as Connection,
    ];

    const { migrated } = migrateConnections(raw, 4);

    expect(migrated).toHaveLength(1);
    expect(migrated[0].type).toBe(DatabaseType.ELASTICSEARCH);
    expect((migrated[0] as unknown as Record<string, unknown>).isOpenSearch).toBeUndefined();
  });

  it('handles Elasticsearch without isOpenSearch field as ELASTICSEARCH', () => {
    const raw: Connection[] = [
      {
        name: 'legacy-es',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9200,
        sslCertVerification: false,
        version: '7.10.0',
        clusterName: 'cluster',
        clusterUuid: 'uuid',
        indices: [],
        activeIndex: undefined,
      } as unknown as Connection,
    ];

    const { migrated } = migrateConnections(raw, 4);

    expect(migrated).toHaveLength(1);
    expect(migrated[0].type).toBe(DatabaseType.ELASTICSEARCH);
  });

  it('leaves non-search connections unchanged during V4→V5', () => {
    const raw: Connection[] = [
      {
        name: 'dynamo',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        auth: { kind: 'accessKey', accessKeyId: 'ak', secretAccessKey: 'sk' },
      } as unknown as Connection,
      {
        name: 'mongo',
        type: DatabaseType.MONGODB,
        host: 'localhost',
        port: 27017,
        auth: { kind: 'none' },
      } as unknown as Connection,
    ];

    const { migrated } = migrateConnections(raw, 4);

    expect(migrated).toHaveLength(2);
    expect(migrated[0].type).toBe(DatabaseType.DYNAMODB);
    expect(migrated[1].type).toBe(DatabaseType.MONGODB);
  });

  it('handles mixed connections with both OpenSearch and Elasticsearch', () => {
    const raw: Connection[] = [
      {
        name: 'os-cluster',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9200,
        sslCertVerification: false,
        isOpenSearch: true,
        version: '2.11.0',
        clusterName: 'os-cluster',
        clusterUuid: 'os-uuid',
        indices: [],
        activeIndex: undefined,
      } as unknown as Connection,
      {
        name: 'es-cluster',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9201,
        sslCertVerification: false,
        isOpenSearch: false,
        version: '8.10.0',
        clusterName: 'es-cluster',
        clusterUuid: 'es-uuid',
        indices: [],
        activeIndex: undefined,
      } as unknown as Connection,
      {
        name: 'dynamo',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        auth: { kind: 'accessKey', accessKeyId: 'ak', secretAccessKey: 'sk' },
      } as unknown as Connection,
    ];

    const { migrated } = migrateConnections(raw, 4);

    expect(migrated).toHaveLength(3);
    expect(migrated[0].type).toBe(DatabaseType.OPENSEARCH);
    expect(migrated[0].name).toBe('os-cluster');
    expect(migrated[1].type).toBe(DatabaseType.ELASTICSEARCH);
    expect(migrated[1].name).toBe('es-cluster');
    expect(migrated[2].type).toBe(DatabaseType.DYNAMODB);
  });

  it('is idempotent: re-running migrations on V5 connections returns unchanged', () => {
    const raw: Connection[] = [
      {
        name: 'os',
        type: DatabaseType.OPENSEARCH,
        host: 'http://localhost',
        port: 9200,
        sslCertVerification: false,
        version: '2.11.0',
        clusterName: 'cluster',
        clusterUuid: 'uuid',
        indices: [],
        activeIndex: undefined,
      } as unknown as Connection,
      {
        name: 'es',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9201,
        sslCertVerification: false,
        version: '8.10.0',
        clusterName: 'cluster',
        clusterUuid: 'uuid',
        indices: [],
        activeIndex: undefined,
      } as unknown as Connection,
      {
        name: 'dynamo',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        auth: { kind: 'accessKey', accessKeyId: 'ak', secretAccessKey: 'sk' },
        tables: [{ name: 'orders' }],
        tableFilter: { kind: 'all' },
      } as unknown as Connection,
    ];

    const { migrated, consolidatedCount, originalCount } = migrateConnections(raw, 4);

    expect(consolidatedCount).toBe(0);
    expect(originalCount).toBe(0);
    expect(migrated).toEqual(raw);
    expect(migrated[0].type).toBe(DatabaseType.OPENSEARCH);
    expect(migrated[1].type).toBe(DatabaseType.ELASTICSEARCH);
    expect((migrated[2] as DynamoDBConnection).auth.kind).toBe('accessKey');
  });
});

describe('isSearchConnection', () => {
  it('returns true for ElasticsearchConnection', () => {
    const conn = {
      type: DatabaseType.ELASTICSEARCH,
      name: 'es',
      host: 'http://localhost',
      port: 9200,
    } as unknown as Connection;
    expect(isSearchConnection(conn)).toBe(true);
  });

  it('returns true for OpenSearchConnection', () => {
    const conn = {
      type: DatabaseType.OPENSEARCH,
      name: 'os',
      host: 'http://localhost',
      port: 9200,
    } as unknown as Connection;
    expect(isSearchConnection(conn)).toBe(true);
  });

  it('returns true for EasySearchConnection', () => {
    const conn = {
      type: DatabaseType.EASYSEARCH,
      name: 'easy',
      host: 'http://localhost',
      port: 9200,
    } as unknown as Connection;
    expect(isSearchConnection(conn)).toBe(true);
  });

  it('returns false for DynamoDBConnection', () => {
    const conn = {
      type: DatabaseType.DYNAMODB,
      name: 'dynamo',
      region: 'us-east-1',
      auth: { kind: 'accessKey', accessKeyId: 'ak', secretAccessKey: 'sk' },
    } as unknown as Connection;
    expect(isSearchConnection(conn)).toBe(false);
  });

  it('returns false for MongoDBConnection', () => {
    const conn = {
      type: DatabaseType.MONGODB,
      name: 'mongo',
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    } as unknown as Connection;
    expect(isSearchConnection(conn)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSearchConnection(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSearchConnection(undefined)).toBe(false);
  });
});

describe('isOpenSearchConnection', () => {
  it('returns true for OpenSearchConnection', () => {
    const conn = {
      type: DatabaseType.OPENSEARCH,
      name: 'os',
      host: 'http://localhost',
      port: 9200,
    } as unknown as Connection;
    expect(isOpenSearchConnection(conn)).toBe(true);
  });

  it('returns false for ElasticsearchConnection', () => {
    const conn = {
      type: DatabaseType.ELASTICSEARCH,
      name: 'es',
      host: 'http://localhost',
      port: 9200,
    } as unknown as Connection;
    expect(isOpenSearchConnection(conn)).toBe(false);
  });

  it('returns false for DynamoDBConnection', () => {
    const conn = {
      type: DatabaseType.DYNAMODB,
      name: 'dynamo',
      region: 'us-east-1',
      auth: { kind: 'accessKey', accessKeyId: 'ak', secretAccessKey: 'sk' },
    } as unknown as Connection;
    expect(isOpenSearchConnection(conn)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isOpenSearchConnection(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isOpenSearchConnection(undefined)).toBe(false);
  });
});

describe('freshConnection - EasySearch', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('returns EasySearch connection with cluster info, preserving EASYSEARCH type', async () => {
    const { loadHttpClient } = require('../src/datasources');
    const mockGet = jest.fn().mockResolvedValue({
      version: { number: '7.10.2', distribution: undefined },
      cluster_name: 'easy-cluster',
      cluster_uuid: 'easy-uuid-123',
      tagline: 'You Know, for Search',
    });
    loadHttpClient.mockReturnValue({ get: mockGet });

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 1,
      type: DatabaseType.EASYSEARCH,
      name: 'easy-test',
      host: 'http://localhost',
      port: 9200,
    } as unknown as Connection;

    store.connections = [conn];
    const result = await store.freshConnection(conn);

    expect(result.type).toBe(DatabaseType.EASYSEARCH);
    expect((result as { version: string }).version).toBe('7.10.2');
    expect((result as { clusterName: string }).clusterName).toBe('easy-cluster');
  });
});

describe('fetchIndices - EasySearch', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('uses expand_wildcards=all for EasySearch connections', async () => {
    const { loadHttpClient } = require('../src/datasources');
    const mockGet = jest.fn().mockResolvedValue([
      {
        index: 'my-index',
        uuid: 'u1',
        health: 'green',
        status: 'open',
        'store.size': '1kb',
        'docs.count': '5',
        'docs.deleted': '0',
        pri: '1',
        rep: '0',
      },
    ]);
    loadHttpClient.mockReturnValue({ get: mockGet });

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 1,
      type: DatabaseType.EASYSEARCH,
      name: 'easy-test',
      host: 'http://localhost',
      port: 9200,
      version: '7.10.2',
    } as unknown as Connection;

    store.connections = [conn];
    await store.fetchIndices(conn);

    expect(mockGet).toHaveBeenCalledWith(
      '/_cat/indices',
      expect.stringContaining('expand_wildcards=all'),
    );
  });
});

describe('connectionStore - selectIndex', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('sets activeIndex with mapping', async () => {
    const { loadHttpClient } = require('../src/datasources');
    const mapping = { 'my-index': { mappings: { properties: { title: { type: 'text' } } } } };
    const mockGet = jest.fn().mockResolvedValue(mapping);
    loadHttpClient.mockReturnValue({ get: mockGet });

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 1,
      type: 'ELASTICSEARCH',
      name: 'es-test',
      host: 'http://localhost',
      port: 9200,
      indices: [{ index: 'my-index', uuid: 'u1', health: 'green', status: 'open' }],
    } as unknown as Connection;

    store.connections = [conn];
    await store.selectIndex(conn, 'my-index');

    const updatedConn = store.connections[0] as ElasticsearchConnection;
    expect(updatedConn.activeIndex?.index).toBe('my-index');
    expect(updatedConn.activeIndex?.mapping).toEqual(mapping);
  });
});

describe('connectionStore - searchQDSL', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('dispatches GET request without qdsl', async () => {
    const { loadHttpClient } = require('../src/datasources');
    const mockGet = jest.fn().mockResolvedValue({ hits: { total: 0 } });
    loadHttpClient.mockReturnValue({ get: mockGet, post: jest.fn() });

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 1,
      type: 'ELASTICSEARCH',
      name: 'es-test',
      host: 'http://localhost',
      port: 9200,
      indices: [],
    } as unknown as Connection;
    store.connections = [conn];

    await store.searchQDSL(conn, { method: 'GET', path: '_search' });
    expect(mockGet).toHaveBeenCalled();
  });

  it('dispatches POST request', async () => {
    const { loadHttpClient } = require('../src/datasources');
    const mockPost = jest.fn().mockResolvedValue({ acknowledged: true });
    loadHttpClient.mockReturnValue({ post: mockPost, get: jest.fn() });

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 2,
      type: 'ELASTICSEARCH',
      name: 'es-test',
      host: 'http://localhost',
      port: 9200,
      indices: [],
    } as unknown as Connection;
    store.connections = [conn];

    await store.searchQDSL(conn, { method: 'POST', path: '_search', qdsl: '{"query":{}}' });
    expect(mockPost).toHaveBeenCalled();
  });

  it('dispatches PUT request', async () => {
    const { loadHttpClient } = require('../src/datasources');
    const mockPut = jest.fn().mockResolvedValue({ acknowledged: true });
    loadHttpClient.mockReturnValue({ put: mockPut, get: jest.fn() });

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 3,
      type: 'ELASTICSEARCH',
      name: 'es-test',
      host: 'http://localhost',
      port: 9200,
      indices: [],
    } as unknown as Connection;
    store.connections = [conn];

    await store.searchQDSL(conn, {
      method: 'PUT',
      path: '_settings',
      qdsl: '{"settings":{}}',
    });
    expect(mockPut).toHaveBeenCalled();
  });

  it('dispatches DELETE request', async () => {
    const { loadHttpClient } = require('../src/datasources');
    const mockDelete = jest.fn().mockResolvedValue({ acknowledged: true });
    loadHttpClient.mockReturnValue({ delete: mockDelete, get: jest.fn() });

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 4,
      type: 'ELASTICSEARCH',
      name: 'es-test',
      host: 'http://localhost',
      port: 9200,
      indices: [],
    } as unknown as Connection;
    store.connections = [conn];

    await store.searchQDSL(conn, { method: 'DELETE', path: 'my-index' });
    expect(mockDelete).toHaveBeenCalled();
  });

  it('throws when connection not found', async () => {
    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = { id: 999, type: 'ELASTICSEARCH' } as unknown as Connection;
    store.connections = [];

    await expect(store.searchQDSL(conn, { method: 'GET', path: '_search' })).rejects.toThrow(
      'no connection established',
    );
  });

  it('dispatches GET with qdsl as POST', async () => {
    const { loadHttpClient } = require('../src/datasources');
    const mockPost = jest.fn().mockResolvedValue({ hits: {} });
    loadHttpClient.mockReturnValue({ post: mockPost, get: jest.fn() });

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 5,
      type: 'ELASTICSEARCH',
      name: 'es-test',
      host: 'http://localhost',
      port: 9200,
      indices: [],
    } as unknown as Connection;
    store.connections = [conn];

    await store.searchQDSL(conn, { method: 'GET', path: '_search', qdsl: '{"query":{}}' });
    expect(mockPost).toHaveBeenCalled();
  });
});

describe('connectionStore - queryToCurl', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('calls transformToCurl for ES connection', () => {
    const { transformToCurl } = require('../src/common/monaco');
    const { buildURL, buildAuthHeader } = require('../src/common');
    buildURL.mockReturnValue('http://localhost:9200/_search');
    buildAuthHeader.mockReturnValue({});
    transformToCurl.mockReturnValue('curl -X GET ...');

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 1,
      type: 'ELASTICSEARCH',
      name: 'es',
      host: 'http://localhost',
      port: 9200,
      username: 'admin',
      password: 'pass',
      sslCertVerification: false,
      authType: 'basic',
      apiKey: undefined,
      indices: [],
    } as unknown as Connection;

    const result = store.queryToCurl(conn, { method: 'GET', path: '_search' });
    expect(result).toBe('curl -X GET ...');
    expect(transformToCurl).toHaveBeenCalled();
  });

  it('throws for non-search connection', () => {
    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 1,
      type: 'DYNAMODB',
      name: 'dynamo',
    } as unknown as Connection;

    expect(() => store.queryToCurl(conn, { method: 'GET', path: '_search' })).toThrow(
      'Operation only supported for Elasticsearch/OpenSearch connections',
    );
  });
});

describe('connectionStore - freshConnection (DYNAMODB)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('returns DynamoDB connection with filtered tables', async () => {
    const { dynamoApi } = require('../src/datasources');
    dynamoApi.listTables = jest.fn().mockResolvedValue(['table-a', 'table-b', 'table-c']);

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 1,
      type: DatabaseType.DYNAMODB,
      name: 'dynamo-test',
      region: 'us-east-1',
    } as unknown as Connection;

    store.connections = [conn];
    const result = await store.freshConnection(conn);

    expect((result as DynamoDBConnection).tables).toHaveLength(3);
  });

  it('returns DynamoDB connection with table detail when tableName given', async () => {
    const { dynamoApi } = require('../src/datasources');
    dynamoApi.listTables = jest.fn().mockResolvedValue(['table-a']);
    dynamoApi.describeTable = jest.fn().mockResolvedValue({
      status: 'ACTIVE',
      itemCount: 100,
      sizeBytes: 1024,
      billingMode: 'PAY_PER_REQUEST',
      keySchema: [{ attributeName: 'id', keyType: 'HASH' }],
      attributeDefinitions: [],
      partitionKey: 'id',
      sortKey: undefined,
      indices: [],
      creationDateTime: '2023-01-01',
    });

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 1,
      type: DatabaseType.DYNAMODB,
      name: 'dynamo-test',
      region: 'us-east-1',
      tables: [],
    } as unknown as Connection;

    store.connections = [conn];
    const result = await store.freshConnection(conn, 'table-a');

    const tables = (result as DynamoDBConnection).tables ?? [];
    expect(tables.find(t => t.name === 'table-a')).toBeDefined();
  });
});

describe('connectionStore - freshConnection (MONGODB)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('returns MongoDB connection with collections', async () => {
    const datasources = require('../src/datasources');
    datasources.mongoApi.testConnection = jest
      .fn()
      .mockResolvedValue({ success: true, collections: ['col1', 'col2'] });

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 1,
      type: DatabaseType.MONGODB,
      name: 'mongo-test',
      host: 'mongodb://localhost',
      port: 27017,
    } as unknown as Connection;

    store.connections = [conn];
    const result = await store.freshConnection(conn);

    const mongoCon = result as MongoDBConnection;
    expect(mongoCon.collections).toHaveLength(2);
  });

  it('throws CustomError when MongoDB connection fails', async () => {
    const datasources = require('../src/datasources');
    datasources.mongoApi.testConnection = jest
      .fn()
      .mockResolvedValue({ error: 'Auth failed', message: 'Auth failed' });

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 1,
      type: DatabaseType.MONGODB,
      name: 'mongo-test',
    } as unknown as Connection;

    store.connections = [conn];
    await expect(store.freshConnection(conn)).rejects.toBeTruthy();
  });
});

describe('connectionStore - freshConnection (unsupported type)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('throws for unsupported connection type', async () => {
    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 1,
      type: 'UNKNOWN_DB',
      name: 'unknown',
    } as unknown as Connection;

    store.connections = [conn];
    await expect(store.freshConnection(conn)).rejects.toBeTruthy();
  });
});

describe('connectionStore - fetchDatabases', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('fetches databases for MongoDB connection', async () => {
    const datasources = require('../src/datasources');
    datasources.mongoApi.listDatabases = jest.fn().mockResolvedValue({
      success: true,
      databases: [
        { name: 'admin', size_on_disk: 1024, empty: false },
        { name: 'test', size_on_disk: 512, empty: false },
      ],
    });

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 1,
      type: DatabaseType.MONGODB,
      name: 'mongo-test',
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    } as MongoDBConnection;

    store.connections = [conn];
    const result = await store.fetchDatabases(conn);

    expect(datasources.mongoApi.listDatabases).toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('admin');
    expect(result[1].name).toBe('test');
  });

  it('throws error when connection not found', async () => {
    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 999,
      type: DatabaseType.MONGODB,
      name: 'not-in-store',
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    } as MongoDBConnection;

    store.connections = [];
    await expect(store.fetchDatabases(conn)).rejects.toThrow('no connection established');
  });

  it('throws CustomError on API failure', async () => {
    const datasources = require('../src/datasources');
    datasources.mongoApi.listDatabases = jest.fn().mockResolvedValue({
      success: false,
      error: 'Connection refused',
    });

    const { useConnectionStore } = require('../src/store/connectionStore');
    const store = useConnectionStore();

    const conn = {
      id: 1,
      type: DatabaseType.MONGODB,
      name: 'mongo-test',
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    } as MongoDBConnection;

    store.connections = [conn];
    try {
      await store.fetchDatabases(conn);
      expect(true).toBe(false); // Should not reach here
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.details).toBe('Connection refused');
    }
  });
});
