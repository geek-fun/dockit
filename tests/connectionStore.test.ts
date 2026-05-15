import { setActivePinia, createPinia } from 'pinia';
import {
  applyTableFilter,
  findTable,
  upsertTable,
  extractFieldsFromMapping,
  migrateDynamoConnectionsV1ToV2,
  migrateDynamoConnectionsV2ToV3,
  migrateSearchConnectionsV4ToV5,
  DatabaseType,
} from '../src/store/connectionStore';
import type {
  DynamoTableFilter,
  DynamoDBConnection,
  DynamoTableSummary,
  MongoDBConnection,
  Connection,
  ElasticsearchConnection,
  OpenSearchConnection,
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
    },
    dynamoApi: {} as Record<string, unknown>,
    loadHttpClient: () => ({}) as Record<string, unknown>,
    mongoApi: { testConnection: jest.fn() },
  };
});
jest.mock('../src/store/tabStore.ts', () => ({}));
jest.mock('../src/common', () => ({
  buildAuthHeader: jest.fn(),
  buildURL: jest.fn(),
  CustomError: class CustomError extends Error {},
  pureObject: (obj: unknown) => JSON.parse(JSON.stringify(obj)),
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
  let storeApi: { set: jest.Mock };

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
});

describe('migrateSearchConnectionsV4ToV5', () => {
  it('converts Elasticsearch connection with isOpenSearch: true to OPENSEARCH type', () => {
    const raw: Connection[] = [
      {
        name: 'my-opensearch',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9200,
        sslCertVerification: false,
        isOpenSearch: true,
        version: '2.11.0',
        clusterName: 'my-cluster',
        clusterUuid: 'abc-123',
        indices: [],
        activeIndex: undefined,
      } as unknown as Connection,
    ];

    const result = migrateSearchConnectionsV4ToV5(raw);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(DatabaseType.OPENSEARCH);
    expect((result[0] as OpenSearchConnection).version).toBe('2.11.0');
    expect((result[0] as unknown as Record<string, unknown>).isOpenSearch).toBeUndefined();
  });

  it('strips isOpenSearch: false from Elasticsearch connection and keeps ELASTICSEARCH type', () => {
    const raw: Connection[] = [
      {
        name: 'my-elasticsearch',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9200,
        sslCertVerification: false,
        isOpenSearch: false,
        version: '8.10.0',
        clusterName: 'my-cluster',
        clusterUuid: 'abc-123',
        indices: [],
        activeIndex: undefined,
      } as unknown as Connection,
    ];

    const result = migrateSearchConnectionsV4ToV5(raw);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(DatabaseType.ELASTICSEARCH);
    expect((result[0] as ElasticsearchConnection).version).toBe('8.10.0');
    expect((result[0] as unknown as Record<string, unknown>).isOpenSearch).toBeUndefined();
  });

  it('leaves non-search connections unchanged', () => {
    const raw: Connection[] = [
      {
        name: 'my-dynamo',
        type: DatabaseType.DYNAMODB,
        region: 'us-east-1',
        auth: { kind: 'accessKey', accessKeyId: 'ak', secretAccessKey: 'sk' },
      } as unknown as Connection,
      {
        name: 'my-mongo',
        type: DatabaseType.MONGODB,
        host: 'localhost',
        port: 27017,
        auth: { kind: 'none' },
      } as unknown as Connection,
    ];

    const result = migrateSearchConnectionsV4ToV5(raw);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe(DatabaseType.DYNAMODB);
    expect(result[1].type).toBe(DatabaseType.MONGODB);
  });

  it('handles mixed connections correctly', () => {
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
        clusterUuid: 'os-123',
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
        clusterUuid: 'es-123',
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

    const result = migrateSearchConnectionsV4ToV5(raw);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe(DatabaseType.OPENSEARCH);
    expect(result[0].name).toBe('os-cluster');
    expect(result[1].type).toBe(DatabaseType.ELASTICSEARCH);
    expect(result[1].name).toBe('es-cluster');
    expect(result[2].type).toBe(DatabaseType.DYNAMODB);
    expect(result[2].name).toBe('dynamo');
  });

  it('handles Elasticsearch connection without isOpenSearch field', () => {
    const raw: Connection[] = [
      {
        name: 'legacy-es',
        type: DatabaseType.ELASTICSEARCH,
        host: 'http://localhost',
        port: 9200,
        sslCertVerification: false,
        version: '7.10.0',
        clusterName: 'legacy',
        clusterUuid: 'legacy-123',
        indices: [],
        activeIndex: undefined,
      } as unknown as Connection,
    ];

    const result = migrateSearchConnectionsV4ToV5(raw);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(DatabaseType.ELASTICSEARCH);
  });
});
