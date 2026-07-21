import { DatabaseType } from '../src/store/connectionStore';
import type { MongoDBConnection } from '../src/store/connectionStore';

jest.mock('@tauri-apps/api/core', () => ({
  invoke: jest.fn(),
}));

jest.mock('../src/lang', () => ({ lang: { t: (k: string) => k } }));
jest.mock('pinia', () => ({ defineStore: () => () => ({}) }));
jest.mock('../src/datasources', () => ({}));
jest.mock('../src/store/tabStore.ts', () => ({}));
jest.mock('../src/common', () => ({
  buildAuthHeader: jest.fn(),
  buildURL: jest.fn(),
  CustomError: class CustomError extends Error {},
  pureObject: jest.fn(),
  jsonify: {
    parse: (str: string) => JSON.parse(str),
  },
}));
jest.mock('../src/common/monaco', () => ({
  SearchAction: {},
  transformToCurl: jest.fn(),
  configureDynamicOptions: jest.fn(),
}));

jest.mock('../src/datasources/capabilityInvoker.ts', () => ({
  invokeCapability: jest.fn(),
  parseCapabilityResponse: <T>(raw: string): T => {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.status === 'number') {
      if (parsed.status >= 400) throw new Error(parsed.message || 'Request failed');
      return (parsed.data ?? {}) as T;
    }
    return parsed as T;
  },
  parseDirectResponse: jest.fn(),
}));

const { invoke } = require('@tauri-apps/api/core');
const { mongoApi } = require('../src/datasources/mongoApi');
const { invokeCapability } = require('../src/datasources/capabilityInvoker.ts');
const mockedInvokeCapability = invokeCapability as jest.MockedFunction<typeof invokeCapability>;

describe('mongoApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('testConnection', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    };

    it('calls invoke with correct config for no auth', async () => {
      const mockApiResponse = {
        status: 200,
        data: { collections: ['users'] },
      };
      invoke.mockResolvedValue(mockApiResponse);

      const result = await mongoApi.testConnection(baseConnection);

      expect(invoke).toHaveBeenCalledWith('mongo_test_connection', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: { kind: 'none' },
          database: undefined,
          tls: undefined,
        },
        sshTunnel: null,
      });
      expect(result.collections).toEqual(['users']);
    });

    it('calls invoke with correct config for scram auth', async () => {
      const connection: MongoDBConnection = {
        ...baseConnection,
        auth: {
          kind: 'scram',
          username: 'admin',
          password: 'secret',
          authSource: 'admin',
        },
      };
      const mockApiResponse = { status: 200, data: { collections: [] } };
      invoke.mockResolvedValue(mockApiResponse);

      const result = await mongoApi.testConnection(connection);

      expect(invoke).toHaveBeenCalledWith('mongo_test_connection', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: {
            kind: 'scram',
            username: 'admin',
            password: 'secret',
            authSource: 'admin',
          },
          database: undefined,
          tls: undefined,
        },
        sshTunnel: null,
      });
      expect(result.collections).toEqual([]);
    });

    it('calls invoke with correct config for URI auth', async () => {
      const connection: MongoDBConnection = {
        name: 'test',
        type: DatabaseType.MONGODB,
        host: '',
        port: 0,
        auth: { kind: 'uri', uri: 'mongodb://localhost:27017' },
      };
      const mockApiResponse = { status: 200, data: { collections: [] } };
      invoke.mockResolvedValue(mockApiResponse);

      await mongoApi.testConnection(connection);

      expect(invoke).toHaveBeenCalledWith('mongo_test_connection', {
        config: {
          host: '',
          port: 0,
          auth: { kind: 'uri', uri: 'mongodb://localhost:27017' },
          database: undefined,
          tls: undefined,
        },
        sshTunnel: null,
      });
    });

    it('calls invoke with TLS and database', async () => {
      const tlsConnection: MongoDBConnection = {
        ...baseConnection,
        tls: true,
        database: 'testdb',
      };
      const mockApiResponse = {
        status: 200,
        data: { collections: ['users', 'orders'] },
      };
      invoke.mockResolvedValue(mockApiResponse);

      const result = await mongoApi.testConnection(tlsConnection);

      expect(invoke).toHaveBeenCalledWith('mongo_test_connection', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: { kind: 'none' },
          database: 'testdb',
          tls: true,
        },
        sshTunnel: null,
      });
      expect(result.collections).toEqual(['users', 'orders']);
    });

    it('returns failure result when invoke throws', async () => {
      const error = new Error('Connection failed');
      invoke.mockRejectedValue(error);

      const result = await mongoApi.testConnection(baseConnection);

      expect(result.error).toBe('Connection failed');
      expect(result.message).toBe('Connection failed');
    });

    it('returns failure result when status >= 400', async () => {
      const mockApiResponse = {
        status: 400,
        message: 'Authentication failed',
      };
      invoke.mockResolvedValue(mockApiResponse);

      const result = await mongoApi.testConnection(baseConnection);

      expect(result.error).toBe('Authentication failed');
      expect(result.message).toBe('Authentication failed');
    });
  });

  describe('executeQuery', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    };

    it('calls invoke with correct config and returns result', async () => {
      const mockApiResponse = {
        status: 200,
        data: [{ _id: '1', name: 'Alice' }],
      };
      invoke.mockResolvedValue(mockApiResponse);

      const result = await mongoApi.executeQuery(baseConnection, 'db.users.find()');

      expect(invoke).toHaveBeenCalledWith('mongo_execute_query', {
        config: expect.objectContaining({ host: 'localhost' }),
        code: 'db.users.find()',
        sshTunnel: null,
      });
      expect(result.data).toEqual([{ _id: '1', name: 'Alice' }]);
    });

    it('returns failure result when invoke throws', async () => {
      invoke.mockRejectedValue(new Error('Syntax error'));

      const result = await mongoApi.executeQuery(baseConnection, 'bad code');

      expect(result.error).toBe('Syntax error');
    });
  });

  describe('listDatabases', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with correct command', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({
          databases: ['test', 'admin'],
        }),
      );

      const result = await mongoApi.listDatabases(baseConnection);

      expect(mockedInvokeCapability).toHaveBeenCalledWith('mongo__list_databases', {}, 'conn-123');
      expect(result.databases).toEqual([{ name: 'test' }, { name: 'admin' }]);
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to list databases'));

      const result = await mongoApi.listDatabases(baseConnection);

      expect(result.error).toBe('Failed to list databases');
    });
  });

  describe('listCollections', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with correct command and database', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({
          collections: ['users', 'orders'],
        }),
      );

      const result = await mongoApi.listCollections(baseConnection, 'testdb');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__list_collections',
        { database: 'testdb' },
        'conn-123',
      );
      expect(result.collections).toEqual([
        { name: 'users', collection_type: 'collection' },
        { name: 'orders', collection_type: 'collection' },
      ]);
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to list collections'));

      const result = await mongoApi.listCollections(baseConnection, 'testdb');

      expect(result.error).toBe('Failed to list collections');
    });
  });

  describe('collectionStats', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with correct command', async () => {
      const mockResult = {
        success: true,
        stats: {
          ns: 'testdb.users',
          count: 1000,
          size: 102400,
          storage_size: 51200,
          nindexes: 3,
          total_index_size: 8192,
        },
      };
      mockedInvokeCapability.mockResolvedValue(JSON.stringify(mockResult));

      const result = await mongoApi.collectionStats(baseConnection, 'testdb', 'users');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__collection_stats',
        { database: 'testdb', collection: 'users' },
        'conn-123',
      );
      expect(result.stats).toEqual(mockResult.stats);
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Collection not found'));

      const result = await mongoApi.collectionStats(baseConnection, 'testdb', 'users');

      expect(result.error).toBe('Collection not found');
    });
  });

  describe('databaseStats', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with correct command', async () => {
      const mockResult = {
        success: true,
        stats: {
          db: 'testdb',
          collections: 5,
          objects: 1000,
          data_size: 102400,
          storage_size: 51200,
          indexes: 10,
          index_size: 8192,
          total_size: 60352,
        },
        version: '7.0.0',
      };
      mockedInvokeCapability.mockResolvedValue(JSON.stringify(mockResult));

      const result = await mongoApi.databaseStats(baseConnection, 'testdb');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__database_stats',
        { database: 'testdb' },
        'conn-123',
      );
      expect(result.stats).toEqual(mockResult.stats);
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Database not found'));

      const result = await mongoApi.databaseStats(baseConnection, 'testdb');

      expect(result.error).toBe('Database not found');
    });
  });

  describe('createDatabase', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with correct command', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ message: 'Database created successfully' }),
      );

      const result = await mongoApi.createDatabase(baseConnection, 'newdb', 'initcollection');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__create_database',
        { database: 'newdb', collection: 'initcollection' },
        'conn-123',
      );
      expect(result.message).toBe('Database created successfully');
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to create database'));

      const result = await mongoApi.createDatabase(baseConnection, 'newdb', 'initcollection');

      expect(result.error).toBe('Failed to create database');
    });
  });

  describe('dropDatabase', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with correct command', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ message: 'Database dropped successfully' }),
      );

      const result = await mongoApi.dropDatabase(baseConnection, 'olddb');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__drop_database',
        { database: 'olddb' },
        'conn-123',
      );
      expect(result.message).toBe('Database dropped successfully');
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to drop database'));

      const result = await mongoApi.dropDatabase(baseConnection, 'olddb');

      expect(result.error).toBe('Failed to drop database');
    });
  });

  describe('createCollection', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with correct command without options', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ message: 'Collection created successfully' }),
      );

      const result = await mongoApi.createCollection(baseConnection, 'testdb', 'newcollection');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__create_collection',
        { database: 'testdb', collection: 'newcollection', options: undefined },
        'conn-123',
      );
      expect(result.message).toBe('Collection created successfully');
    });

    it('calls invokeCapability with capped collection options', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ message: 'Collection created successfully' }),
      );

      const options = { capped: true, size: 1024, max: 100 };
      const result = await mongoApi.createCollection(
        baseConnection,
        'testdb',
        'cappedcollection',
        options,
      );

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__create_collection',
        { database: 'testdb', collection: 'cappedcollection', options },
        'conn-123',
      );
      expect(result.message).toBe('Collection created successfully');
    });

    it('calls invokeCapability with timeseries options', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ message: 'Collection created successfully' }),
      );

      const options = {
        timeseries: { time_field: 'timestamp', meta_field: 'metadata', granularity: 'hours' },
      };
      const result = await mongoApi.createCollection(
        baseConnection,
        'testdb',
        'timeseriescollection',
        options,
      );

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__create_collection',
        { database: 'testdb', collection: 'timeseriescollection', options },
        'conn-123',
      );
      expect(result.message).toBe('Collection created successfully');
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to create collection'));

      const result = await mongoApi.createCollection(baseConnection, 'testdb', 'newcollection');

      expect(result.error).toBe('Failed to create collection');
    });
  });

  describe('dropCollection', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with correct command', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ message: 'Collection dropped successfully' }),
      );

      const result = await mongoApi.dropCollection(baseConnection, 'testdb', 'oldcollection');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__drop_collection',
        { database: 'testdb', collection: 'oldcollection' },
        'conn-123',
      );
      expect(result.message).toBe('Collection dropped successfully');
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to drop collection'));

      const result = await mongoApi.dropCollection(baseConnection, 'testdb', 'oldcollection');

      expect(result.error).toBe('Failed to drop collection');
    });
  });
});

describe('MongoDB connection types', () => {
  it('DatabaseType.MONGODB is defined', () => {
    expect(DatabaseType.MONGODB).toBe('MONGODB');
  });

  it('can create connection with no auth', () => {
    const conn: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    };
    expect(conn.type).toBe(DatabaseType.MONGODB);
    expect(conn.auth.kind).toBe('none');
  });

  it('can create connection with scram auth', () => {
    const conn: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: {
        kind: 'scram',
        username: 'admin',
        password: 'secret',
        authSource: 'admin',
        authMechanism: 'SCRAM-SHA-256',
      },
    };
    expect(conn.auth.kind).toBe('scram');
    if (conn.auth.kind === 'scram') {
      expect(conn.auth.username).toBe('admin');
      expect(conn.auth.authMechanism).toBe('SCRAM-SHA-256');
    }
  });

  it('can create connection with uri auth', () => {
    const conn: MongoDBConnection = {
      name: 'test',
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

  it('can include collections', () => {
    const conn: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      collections: [{ name: 'users', type: 'collection', count: 100 }, { name: 'orders' }],
    };
    expect(conn.collections).toHaveLength(2);
    expect(conn.collections?.[0].name).toBe('users');
    expect(conn.collections?.[0].count).toBe(100);
    expect(conn.collections?.[1].name).toBe('orders');
  });

  it('can include database and tls', () => {
    const conn: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      database: 'mydb',
      tls: true,
    };
    expect(conn.database).toBe('mydb');
    expect(conn.tls).toBe(true);
  });

  it('can include activeDatabase', () => {
    const conn: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      activeDatabase: 'production',
    };
    expect(conn.activeDatabase).toBe('production');
  });

  it('can include favoriteCollections', () => {
    const conn: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      favoriteCollections: [
        { database: 'mydb', collection: 'users' },
        { database: 'mydb', collection: 'orders' },
        { database: 'mydb', collection: 'products' },
      ],
    };
    expect(conn.favoriteCollections).toHaveLength(3);
    expect(conn.favoriteCollections[0].collection).toBe('users');
    expect(conn.favoriteCollections[1].collection).toBe('orders');
    expect(conn.favoriteCollections[2].collection).toBe('products');
  });

  it('can include both activeDatabase and favoriteCollections', () => {
    const conn: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      database: 'mydb',
      tls: true,
      activeDatabase: 'production',
      favoriteCollections: [
        { database: 'production', collection: 'users' },
        { database: 'production', collection: 'orders' },
      ],
    };
    expect(conn.database).toBe('mydb');
    expect(conn.tls).toBe(true);
    expect(conn.activeDatabase).toBe('production');
    expect(conn.favoriteCollections).toHaveLength(2);
    expect(conn.favoriteCollections[0].database).toBe('production');
  });
});

describe('mongoApi cluster monitoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseConnection: MongoDBConnection = {
    name: 'test',
    type: DatabaseType.MONGODB,
    host: 'localhost',
    port: 27017,
    auth: { kind: 'none' },
    id: 'conn-123',
  };

  describe('serverStatus', () => {
    it('calls invokeCapability with correct command', async () => {
      const mockResult = {
        success: true,
        status: {
          host: 'localhost:27017',
          version: '7.0.0',
          uptime: 3600,
          connections: { current: 10, available: 100, total_created: 50 },
          network: { bytes_in: 102400, bytes_out: 51200, num_requests: 1000 },
          memory: { resident: 128, virtual_mem: 256 },
        },
      };
      mockedInvokeCapability.mockResolvedValue(JSON.stringify(mockResult));

      const result = await mongoApi.serverStatus(baseConnection);

      expect(mockedInvokeCapability).toHaveBeenCalledWith('mongo__server_status', {}, 'conn-123');
      expect(result.status?.host).toBe('localhost:27017');
      expect(result.status?.version).toBe('7.0.0');
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to get server status'));

      const result = await mongoApi.serverStatus(baseConnection);

      expect(result.error).toBe('Failed to get server status');
    });
  });

  describe('replSetStatus', () => {
    it('calls invokeCapability with correct command for replica set', async () => {
      const mockResult = {
        success: true,
        status: {
          set: 'rs0',
          my_state: 1,
          members: [
            { name: 'host1:27017', state: 1, state_str: 'PRIMARY', health: 1, uptime: 3600 },
            {
              name: 'host2:27017',
              state: 2,
              state_str: 'SECONDARY',
              health: 1,
              uptime: 3500,
              lag_time: 5,
            },
          ],
        },
      };
      mockedInvokeCapability.mockResolvedValue(JSON.stringify(mockResult));

      const result = await mongoApi.replSetStatus(baseConnection);

      expect(mockedInvokeCapability).toHaveBeenCalledWith('mongo__repl_set_status', {}, 'conn-123');
      expect(result.status?.set).toBe('rs0');
      expect(result.status?.members).toHaveLength(2);
    });

    it('returns error in status for standalone instance', async () => {
      const mockError = { success: false, error: 'Not a replica set or error: ...' };
      mockedInvokeCapability.mockResolvedValue(JSON.stringify(mockError));

      const result = await mongoApi.replSetStatus(baseConnection);

      expect(result.error).toContain('Not a replica set');
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Connection failed'));

      const result = await mongoApi.replSetStatus(baseConnection);

      expect(result.error).toBe('Connection failed');
    });
  });

  describe('shardStatus', () => {
    it('calls invokeCapability with correct command for sharded cluster', async () => {
      const mockResult = {
        success: true,
        cluster: {
          is_sharding_enabled: true,
          shards: [
            { id: 'shard01', host: 'shard01/host1:27017,host2:27017', state: 1 },
            { id: 'shard02', host: 'shard02/host3:27017,host4:27017', state: 1 },
          ],
          mongos: [{ id: 'mongos1', host: 'localhost:27017' }],
        },
      };
      mockedInvokeCapability.mockResolvedValue(JSON.stringify(mockResult));

      const result = await mongoApi.shardStatus(baseConnection);

      expect(mockedInvokeCapability).toHaveBeenCalledWith('mongo__shard_status', {}, 'conn-123');
      expect(result.cluster?.is_sharding_enabled).toBe(true);
      expect(result.cluster?.shards).toHaveLength(2);
    });

    it('returns cluster with sharding disabled for standalone', async () => {
      const mockCluster = {
        success: true,
        cluster: {
          is_sharding_enabled: false,
          shards: [],
          mongos: [],
        },
      };
      mockedInvokeCapability.mockResolvedValue(JSON.stringify(mockCluster));

      const result = await mongoApi.shardStatus(baseConnection);

      expect(result.cluster?.is_sharding_enabled).toBe(false);
      expect(result.cluster?.shards).toHaveLength(0);
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to get shard status'));

      const result = await mongoApi.shardStatus(baseConnection);

      expect(result.error).toBe('Failed to get shard status');
    });
  });

  describe('findDocuments', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with collection and optional params', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({
          documents: [{ _id: '1', name: 'Alice' }],
          count: 1,
        }),
      );

      const result = await mongoApi.findDocuments(baseConnection, 'users', '{}', '{}', 0, 25);

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__find',
        {
          collection: 'users',
          filter: {},
          sort: {},
          projection: undefined,
          skip: 0,
          limit: 25,
        },
        'conn-123',
      );
      expect(result.documents).toEqual([{ _id: '1', name: 'Alice' }]);
    });

    it('calls invokeCapability without optional params when omitted', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ documents: [], count: 0 }));

      await mongoApi.findDocuments(baseConnection, 'users');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__find',
        {
          collection: 'users',
          filter: {},
          sort: undefined,
          projection: undefined,
          skip: undefined,
          limit: 20,
        },
        'conn-123',
      );
    });

    it('returns error result on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Collection not found'));

      const result = await mongoApi.findDocuments(baseConnection, 'users');

      expect(result.error).toBe('Collection not found');
    });
  });

  describe('countDocuments', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability and returns count', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ count: 42 }));

      const result = await mongoApi.countDocuments(baseConnection, 'users', '{}');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__count_documents',
        { collection: 'users', filter: '{}' },
        'conn-123',
      );
      expect(result).toBe(42);
    });

    it('returns -1 on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Count failed'));

      const result = await mongoApi.countDocuments(baseConnection, 'users');

      expect(result).toBe(-1);
    });
  });

  describe('insertDocument', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with collection and document', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ inserted_id: 'abc123' }));

      const result = await mongoApi.insertDocument(baseConnection, 'users', '{"name":"Alice"}');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__insert_one',
        {
          collection: 'users',
          document: { name: 'Alice' },
        },
        'conn-123',
      );
      expect(result.inserted_id).toBe('abc123');
    });

    it('returns error result on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Insert failed'));

      const result = await mongoApi.insertDocument(baseConnection, 'users', '{"name":"Alice"}');

      expect(result.error).toBe('Insert failed');
    });
  });

  describe('updateDocument', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with collection, id, and document', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ matched_count: 1, modified_count: 1 }),
      );

      const result = await mongoApi.updateDocument(
        baseConnection,
        'users',
        'abc123',
        '{"name":"Bob"}',
      );

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__update_document',
        { collection: 'users', id: 'abc123', document: '{"name":"Bob"}' },
        'conn-123',
      );
      expect(result.matched_count).toBe(1);
      expect(result.modified_count).toBe(1);
    });

    it('returns error result on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Update failed'));

      const result = await mongoApi.updateDocument(baseConnection, 'users', 'abc123', '{}');

      expect(result.error).toBe('Update failed');
    });
  });

  describe('deleteDocument', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with collection and id', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ deleted_count: 1 }));

      const result = await mongoApi.deleteDocument(baseConnection, 'users', 'abc123');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__delete_document',
        { collection: 'users', id: 'abc123' },
        'conn-123',
      );
      expect(result).toEqual({ deleted_count: 1 });
    });

    it('returns error result on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Delete failed'));

      const result = await mongoApi.deleteDocument(baseConnection, 'users', 'abc123');

      expect(result.error).toBe('Delete failed');
    });
  });

  describe('deleteDocuments', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with collection and filter', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ deleted_count: 5 }));

      const result = await mongoApi.deleteDocuments(baseConnection, 'users', '{"active":false}');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__delete_many',
        {
          collection: 'users',
          filter: { active: false },
        },
        'conn-123',
      );
      expect(result.deleted_count).toBe(5);
    });

    it('returns error result on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Bulk delete failed'));

      const result = await mongoApi.deleteDocuments(baseConnection, 'users', '{}');

      expect(result.error).toBe('Bulk delete failed');
    });
  });

  describe('renameCollection', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with correct command', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ message: 'Collection renamed successfully' }),
      );

      const result = await mongoApi.renameCollection(
        baseConnection,
        'testdb',
        'oldname',
        'newname',
      );

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__rename_collection',
        { database: 'testdb', collection: 'oldname', to_collection: 'newname' },
        'conn-123',
      );
      expect(result.message).toBe('Collection renamed successfully');
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to rename collection'));

      const result = await mongoApi.renameCollection(
        baseConnection,
        'testdb',
        'oldname',
        'newname',
      );

      expect(result.error).toBe('Failed to rename collection');
    });
  });

  describe('cloneCollection', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with correct command', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({
          success: true,
          documents_copied: 100,
          indexes_copied: 2,
          message: 'Collection cloned successfully',
        }),
      );

      const result = await mongoApi.cloneCollection(
        baseConnection,
        'testdb',
        'sourcecoll',
        'targetcoll',
      );

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__clone_collection',
        { database: 'testdb', source_collection: 'sourcecoll', target_collection: 'targetcoll' },
        'conn-123',
      );
      expect(result.documents_copied).toBe(100);
      expect(result.indexes_copied).toBe(2);
      expect(result.message).toBe('Collection cloned successfully');
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to clone collection'));

      const result = await mongoApi.cloneCollection(
        baseConnection,
        'testdb',
        'sourcecoll',
        'targetcoll',
      );

      expect(result.error).toBe('Failed to clone collection');
    });
  });

  describe('truncateCollection', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with correct command', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ deleted_count: 500 }));

      const result = await mongoApi.truncateCollection(baseConnection, 'testdb', 'users');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__truncate_collection',
        { database: 'testdb', collection: 'users' },
        'conn-123',
      );
      expect(result.deleted_count).toBe(500);
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to truncate collection'));

      const result = await mongoApi.truncateCollection(baseConnection, 'testdb', 'users');

      expect(result.error).toBe('Failed to truncate collection');
    });
  });

  describe('listIndexes', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with correct command', async () => {
      const mockIndexes = [
        { name: '_id_', key: { _id: 1 }, unique: false, sparse: false, size: 8192, accesses: 0 },
        {
          name: 'name_idx',
          key: { name: 1 },
          unique: true,
          sparse: false,
          size: 4096,
          accesses: 150,
        },
      ];
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ indexes: mockIndexes }));

      const result = await mongoApi.listIndexes(baseConnection, 'testdb', 'users');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__list_indexes',
        { database: 'testdb', collection: 'users' },
        'conn-123',
      );
      expect(result.indexes).toEqual(mockIndexes);
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to list indexes'));

      const result = await mongoApi.listIndexes(baseConnection, 'testdb', 'users');

      expect(result.error).toBe('Failed to list indexes');
    });
  });

  describe('createIndex', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with correct command without options', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ index_name: 'email_idx' }));

      const result = await mongoApi.createIndex(baseConnection, 'testdb', 'users', { email: 1 });

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__create_index',
        { database: 'testdb', collection: 'users', keys: { email: 1 } },
        'conn-123',
      );
      expect(result.index_name).toBe('email_idx');
    });

    it('calls invokeCapability with index options', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ index_name: 'custom_idx' }));

      const options = { name: 'custom_idx', unique: true, sparse: true };
      const result = await mongoApi.createIndex(
        baseConnection,
        'testdb',
        'users',
        { name: 1, email: -1 },
        options,
      );

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__create_index',
        {
          database: 'testdb',
          collection: 'users',
          keys: { name: 1, email: -1 },
          name: 'custom_idx',
          unique: true,
          sparse: true,
        },
        'conn-123',
      );
      expect(result.index_name).toBe('custom_idx');
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to create index'));

      const result = await mongoApi.createIndex(baseConnection, 'testdb', 'users', { field: 1 });

      expect(result.error).toBe('Failed to create index');
    });
  });

  describe('dropIndex', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with correct command', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ message: 'Index dropped successfully' }),
      );

      const result = await mongoApi.dropIndex(baseConnection, 'testdb', 'users', 'name_idx');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__drop_index',
        { database: 'testdb', collection: 'users', index_name: 'name_idx' },
        'conn-123',
      );
      expect(result.message).toBe('Index dropped successfully');
    });

    it('returns error on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to drop index'));

      const result = await mongoApi.dropIndex(baseConnection, 'testdb', 'users', 'name_idx');

      expect(result.error).toBe('Failed to drop index');
    });
  });
});

describe('mongoApi export/import', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseConfig = {
    host: 'localhost',
    port: 27017,
    auth: { kind: 'none' },
    database: 'testdb',
    tls: false,
  };

  describe('exportDocuments', () => {
    it('calls invoke with correct command and returns result', async () => {
      const mockApiResponse = {
        status: 200,
        data: {
          documents: [{ _id: '1', name: 'Alice' }],
          total: 1,
          has_more: false,
        },
      };
      invoke.mockResolvedValue(mockApiResponse);

      const result = await mongoApi.exportDocuments(baseConfig, 'users');

      expect(invoke).toHaveBeenCalledWith('mongo_export_documents', {
        config: baseConfig,
        collection: 'users',
        filter: undefined,
        sort: undefined,
        batchSize: undefined,
        skip: undefined,
        sshTunnel: null,
      });
      expect(result).toEqual(mockApiResponse.data);
    });

    it('passes all optional parameters', async () => {
      invoke.mockResolvedValue({ status: 200, data: { documents: [], total: 0, has_more: false } });
      await mongoApi.exportDocuments(
        baseConfig,
        'users',
        '{"active":true}',
        '{"name":1}',
        100,
        200,
      );
      expect(invoke).toHaveBeenCalledWith('mongo_export_documents', {
        config: baseConfig,
        collection: 'users',
        filter: '{"active":true}',
        sort: '{"name":1}',
        batchSize: 100,
        skip: 200,
        sshTunnel: null,
      });
    });

    it('returns error result on invoke failure', async () => {
      invoke.mockRejectedValue(new Error('Export failed'));
      const result = await mongoApi.exportDocuments(baseConfig, 'users');
      expect(result.has_more).toBe(false);
      expect(result.error).toBe('Export failed');
    });
  });

  describe('importDocuments', () => {
    it('calls invoke with correct command and returns result', async () => {
      const mockApiResponse = { status: 200, data: { inserted: 10, updated: 0, skipped: 0 } };
      invoke.mockResolvedValue(mockApiResponse);

      const result = await mongoApi.importDocuments(baseConfig, 'users', ['{"name":"Alice"}']);

      expect(invoke).toHaveBeenCalledWith('mongo_import_documents', {
        config: baseConfig,
        collection: 'users',
        documents: ['{"name":"Alice"}'],
        upsert: undefined,
        sshTunnel: null,
      });
      expect(result).toEqual(mockApiResponse.data);
    });

    it('passes upsert parameter when true', async () => {
      invoke.mockResolvedValue({ status: 200, data: { inserted: 0, updated: 2, skipped: 0 } });
      await mongoApi.importDocuments(baseConfig, 'users', ['{"_id":"1"}'], true);
      expect(invoke).toHaveBeenCalledWith('mongo_import_documents', {
        config: baseConfig,
        collection: 'users',
        documents: ['{"_id":"1"}'],
        upsert: true,
        sshTunnel: null,
      });
    });

    it('returns error result on invoke failure', async () => {
      invoke.mockRejectedValue(new Error('Import failed'));
      const result = await mongoApi.importDocuments(baseConfig, 'users', []);
      expect(result.inserted).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.error).toBe('Import failed');
    });
  });

  describe('sampleDocuments', () => {
    const conn: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      id: 'conn-123',
    };

    it('calls invokeCapability with collection and limit and returns documents array', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ documents: [{ _id: '1', name: 'Alice' }] }),
      );

      const result = await mongoApi.sampleDocuments(conn, 'users', 5);

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__sample_documents',
        { collection: 'users', limit: 5 },
        'conn-123',
      );
      expect(result).toEqual([{ _id: '1', name: 'Alice' }]);
    });

    it('omits limit when not provided', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ documents: [] }));
      await mongoApi.sampleDocuments(conn, 'users');
      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'mongo__sample_documents',
        { collection: 'users', limit: undefined },
        'conn-123',
      );
    });

    it('returns empty array on invokeCapability failure', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Sample failed'));
      const result = await mongoApi.sampleDocuments(conn, 'users');
      expect(result).toEqual([]);
    });
  });
});
