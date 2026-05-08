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

    it('throws when invoke fails', async () => {
      const error = new Error('Connection failed');
      invoke.mockRejectedValue(error);

      await expect(mongoApi.testConnection(baseConnection)).rejects.toThrow('Connection failed');
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
});
