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
}));
jest.mock('../src/common/monaco', () => ({
  SearchAction: {},
  transformToCurl: jest.fn(),
  configureDynamicOptions: jest.fn(),
}));

const { invoke } = require('@tauri-apps/api/core');
const { mongoApi } = require('../src/datasources/mongoApi');

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
      const mockResult = {
        success: true,
        message: 'Connection successful',
        collections: ['users'],
      };
      invoke.mockResolvedValue(mockResult);

      const result = await mongoApi.testConnection(baseConnection);

      expect(invoke).toHaveBeenCalledWith('mongo_test_connection', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: { kind: 'none' },
          database: undefined,
          tls: undefined,
        },
      });
      expect(result).toEqual(mockResult);
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
      const mockResult = { success: true, message: 'Connection successful', collections: [] };
      invoke.mockResolvedValue(mockResult);

      await mongoApi.testConnection(connection);

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
      });
    });

    it('calls invoke with correct config for scram auth with mechanism', async () => {
      const connection: MongoDBConnection = {
        ...baseConnection,
        auth: {
          kind: 'scram',
          username: 'admin',
          password: 'secret',
          authSource: 'admin',
          authMechanism: 'SCRAM-SHA-256',
        },
      };
      const mockResult = { success: true, message: 'Connection successful', collections: [] };
      invoke.mockResolvedValue(mockResult);

      await mongoApi.testConnection(connection);

      expect(invoke).toHaveBeenCalledWith('mongo_test_connection', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: {
            kind: 'scram',
            username: 'admin',
            password: 'secret',
            authSource: 'admin',
            authMechanism: 'SCRAM-SHA-256',
          },
          database: undefined,
          tls: undefined,
        },
      });
    });

    it('calls invoke with correct config for uri auth', async () => {
      const connection: MongoDBConnection = {
        ...baseConnection,
        host: '',
        port: 0,
        auth: {
          kind: 'uri',
          uri: 'mongodb+srv://user:pass@cluster.mongodb.net/db',
        },
      };
      const mockResult = { success: true, message: 'Connection successful', collections: [] };
      invoke.mockResolvedValue(mockResult);

      await mongoApi.testConnection(connection);

      expect(invoke).toHaveBeenCalledWith('mongo_test_connection', {
        config: {
          host: '',
          port: 0,
          auth: {
            kind: 'uri',
            uri: 'mongodb+srv://user:pass@cluster.mongodb.net/db',
          },
          database: undefined,
          tls: undefined,
        },
      });
    });

    it('includes database and tls when provided', async () => {
      const connection: MongoDBConnection = {
        ...baseConnection,
        database: 'mydb',
        tls: true,
      };
      const mockResult = { success: true, message: 'Connection successful', collections: [] };
      invoke.mockResolvedValue(mockResult);

      await mongoApi.testConnection(connection);

      expect(invoke).toHaveBeenCalledWith('mongo_test_connection', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: { kind: 'none' },
          database: 'mydb',
          tls: true,
        },
      });
    });

    it('returns result from invoke', async () => {
      const mockResult = {
        success: true,
        message: 'Connection successful',
        collections: ['users', 'orders'],
      };
      invoke.mockResolvedValue(mockResult);

      const result = await mongoApi.testConnection(baseConnection);

      expect(result).toEqual(mockResult);
      expect(result.success).toBe(true);
      expect(result.collections).toEqual(['users', 'orders']);
    });

    it('returns failure result when invoke throws', async () => {
      const error = new Error('Connection failed');
      invoke.mockRejectedValue(error);

      const result = await mongoApi.testConnection(baseConnection);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Connection failed');
    });

    it('returns failure result when success is false', async () => {
      const mockResult = {
        success: false,
        message: 'Authentication failed',
      };
      invoke.mockResolvedValue(mockResult);

      const result = await mongoApi.testConnection(baseConnection);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Authentication failed');
    });
  });

  describe('listDatabases', () => {
    const baseConnection: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    };

    it('calls invoke with correct command', async () => {
      const mockResult = {
        success: true,
        databases: [
          { name: 'test', size_on_disk: 1024, empty: false },
          { name: 'admin', size_on_disk: 512, empty: false },
        ],
        totalSize: 1536,
      };
      invoke.mockResolvedValue(mockResult);

      const result = await mongoApi.listDatabases(baseConnection);

      expect(invoke).toHaveBeenCalledWith('mongo_list_databases', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: { kind: 'none' },
          database: undefined,
          tls: undefined,
        },
      });
      expect(result).toEqual(mockResult);
    });

    it('returns error on invoke failure', async () => {
      invoke.mockRejectedValue(new Error('Failed to list databases'));

      const result = await mongoApi.listDatabases(baseConnection);

      expect(result.success).toBe(false);
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
    };

    it('calls invoke with correct command and database', async () => {
      const mockResult = {
        success: true,
        collections: [
          { name: 'users', collection_type: 'collection', document_count: 100 },
          { name: 'orders', collection_type: 'collection', document_count: 50 },
        ],
      };
      invoke.mockResolvedValue(mockResult);

      const result = await mongoApi.listCollections(baseConnection, 'testdb');

      expect(invoke).toHaveBeenCalledWith('mongo_list_collections', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: { kind: 'none' },
          database: undefined,
          tls: undefined,
        },
        database: 'testdb',
      });
      expect(result).toEqual(mockResult);
    });

    it('returns error on invoke failure', async () => {
      invoke.mockRejectedValue(new Error('Failed to list collections'));

      const result = await mongoApi.listCollections(baseConnection, 'testdb');

      expect(result.success).toBe(false);
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
    };

    it('calls invoke with correct command', async () => {
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
      invoke.mockResolvedValue(mockResult);

      const result = await mongoApi.collectionStats(baseConnection, 'testdb', 'users');

      expect(invoke).toHaveBeenCalledWith('mongo_collection_stats', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: { kind: 'none' },
          database: undefined,
          tls: undefined,
        },
        database: 'testdb',
        collection: 'users',
      });
      expect(result).toEqual(mockResult);
    });

    it('returns error on invoke failure', async () => {
      invoke.mockRejectedValue(new Error('Collection not found'));

      const result = await mongoApi.collectionStats(baseConnection, 'testdb', 'users');

      expect(result.success).toBe(false);
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
    };

    it('calls invoke with correct command', async () => {
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
      invoke.mockResolvedValue(mockResult);

      const result = await mongoApi.databaseStats(baseConnection, 'testdb');

      expect(invoke).toHaveBeenCalledWith('mongo_database_stats', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: { kind: 'none' },
          database: undefined,
          tls: undefined,
        },
        database: 'testdb',
      });
      expect(result).toEqual(mockResult);
    });

    it('returns error on invoke failure', async () => {
      invoke.mockRejectedValue(new Error('Database not found'));

      const result = await mongoApi.databaseStats(baseConnection, 'testdb');

      expect(result.success).toBe(false);
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
    };

    it('calls invoke with correct command', async () => {
      const mockResult = {
        success: true,
        message: 'Database created successfully',
      };
      invoke.mockResolvedValue(mockResult);

      const result = await mongoApi.createDatabase(baseConnection, 'newdb', 'initcollection');

      expect(invoke).toHaveBeenCalledWith('mongo_create_database', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: { kind: 'none' },
          database: undefined,
          tls: undefined,
        },
        database: 'newdb',
        collection: 'initcollection',
      });
      expect(result).toEqual(mockResult);
    });

    it('returns error on invoke failure', async () => {
      invoke.mockRejectedValue(new Error('Failed to create database'));

      const result = await mongoApi.createDatabase(baseConnection, 'newdb', 'initcollection');

      expect(result.success).toBe(false);
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
    };

    it('calls invoke with correct command', async () => {
      const mockResult = {
        success: true,
        message: 'Database dropped successfully',
      };
      invoke.mockResolvedValue(mockResult);

      const result = await mongoApi.dropDatabase(baseConnection, 'olddb');

      expect(invoke).toHaveBeenCalledWith('mongo_drop_database', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: { kind: 'none' },
          database: undefined,
          tls: undefined,
        },
        database: 'olddb',
      });
      expect(result).toEqual(mockResult);
    });

    it('returns error on invoke failure', async () => {
      invoke.mockRejectedValue(new Error('Failed to drop database'));

      const result = await mongoApi.dropDatabase(baseConnection, 'olddb');

      expect(result.success).toBe(false);
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
    };

    it('calls invoke with correct command without options', async () => {
      const mockResult = {
        success: true,
        message: 'Collection created successfully',
      };
      invoke.mockResolvedValue(mockResult);

      const result = await mongoApi.createCollection(baseConnection, 'testdb', 'newcollection');

      expect(invoke).toHaveBeenCalledWith('mongo_create_collection', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: { kind: 'none' },
          database: undefined,
          tls: undefined,
        },
        database: 'testdb',
        collection: 'newcollection',
        options: undefined,
      });
      expect(result).toEqual(mockResult);
    });

    it('calls invoke with capped collection options', async () => {
      const mockResult = {
        success: true,
        message: 'Collection created successfully',
      };
      invoke.mockResolvedValue(mockResult);

      const options = { capped: true, size: 1024, max: 100 };
      const result = await mongoApi.createCollection(
        baseConnection,
        'testdb',
        'cappedcollection',
        options,
      );

      expect(invoke).toHaveBeenCalledWith('mongo_create_collection', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: { kind: 'none' },
          database: undefined,
          tls: undefined,
        },
        database: 'testdb',
        collection: 'cappedcollection',
        options,
      });
      expect(result).toEqual(mockResult);
    });

    it('calls invoke with timeseries options', async () => {
      const mockResult = {
        success: true,
        message: 'Collection created successfully',
      };
      invoke.mockResolvedValue(mockResult);

      const options = {
        timeseries: { time_field: 'timestamp', meta_field: 'metadata', granularity: 'hours' },
      };
      const result = await mongoApi.createCollection(
        baseConnection,
        'testdb',
        'timeseriescollection',
        options,
      );

      expect(invoke).toHaveBeenCalledWith('mongo_create_collection', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: { kind: 'none' },
          database: undefined,
          tls: undefined,
        },
        database: 'testdb',
        collection: 'timeseriescollection',
        options,
      });
      expect(result).toEqual(mockResult);
    });

    it('returns error on invoke failure', async () => {
      invoke.mockRejectedValue(new Error('Failed to create collection'));

      const result = await mongoApi.createCollection(baseConnection, 'testdb', 'newcollection');

      expect(result.success).toBe(false);
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
    };

    it('calls invoke with correct command', async () => {
      const mockResult = {
        success: true,
        message: 'Collection dropped successfully',
      };
      invoke.mockResolvedValue(mockResult);

      const result = await mongoApi.dropCollection(baseConnection, 'testdb', 'oldcollection');

      expect(invoke).toHaveBeenCalledWith('mongo_drop_collection', {
        config: {
          host: 'localhost',
          port: 27017,
          auth: { kind: 'none' },
          database: undefined,
          tls: undefined,
        },
        database: 'testdb',
        collection: 'oldcollection',
      });
      expect(result).toEqual(mockResult);
    });

    it('returns error on invoke failure', async () => {
      invoke.mockRejectedValue(new Error('Failed to drop collection'));

      const result = await mongoApi.dropCollection(baseConnection, 'testdb', 'oldcollection');

      expect(result.success).toBe(false);
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
      favoriteCollections: ['users', 'orders', 'products'],
    };
    expect(conn.favoriteCollections).toHaveLength(3);
    expect(conn.favoriteCollections).toContain('users');
    expect(conn.favoriteCollections).toContain('orders');
    expect(conn.favoriteCollections).toContain('products');
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
      favoriteCollections: ['users', 'orders'],
    };
    expect(conn.database).toBe('mydb');
    expect(conn.tls).toBe(true);
    expect(conn.activeDatabase).toBe('production');
    expect(conn.favoriteCollections).toHaveLength(2);
  });
});
