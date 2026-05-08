import { DatabaseType } from '../src/store/connectionStore';
import type {
  MongoDBConnection,
  MongoDBAuth,
  MongoDBCollection,
} from '../src/store/connectionStore';

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

describe('MongoDBAuth', () => {
  it('can be none', () => {
    const auth: MongoDBAuth = { kind: 'none' };
    expect(auth.kind).toBe('none');
  });

  it('can be scram with credentials', () => {
    const auth: MongoDBAuth = {
      kind: 'scram',
      username: 'admin',
      password: 'secret',
      authSource: 'admin',
      authMechanism: 'SCRAM-SHA-256',
    };
    expect(auth.kind).toBe('scram');
    if (auth.kind === 'scram') {
      expect(auth.username).toBe('admin');
      expect(auth.password).toBe('secret');
      expect(auth.authSource).toBe('admin');
      expect(auth.authMechanism).toBe('SCRAM-SHA-256');
    }
  });

  it('can be scram with minimal fields', () => {
    const auth: MongoDBAuth = {
      kind: 'scram',
      username: 'user',
      password: 'pass',
    };
    expect(auth.kind).toBe('scram');
    if (auth.kind === 'scram') {
      expect(auth.authSource).toBeUndefined();
      expect(auth.authMechanism).toBeUndefined();
    }
  });

  it('can be uri', () => {
    const auth: MongoDBAuth = {
      kind: 'uri',
      uri: 'mongodb+srv://user:pass@cluster.mongodb.net/db',
    };
    expect(auth.kind).toBe('uri');
    if (auth.kind === 'uri') {
      expect(auth.uri).toContain('mongodb+srv://');
    }
  });
});

describe('MongoDBCollection', () => {
  it('can be created with minimal fields', () => {
    const collection: MongoDBCollection = { name: 'users' };
    expect(collection.name).toBe('users');
    expect(collection.type).toBeUndefined();
    expect(collection.count).toBeUndefined();
  });

  it('can include optional fields', () => {
    const collection: MongoDBCollection = {
      name: 'users',
      type: 'collection',
      count: 1000,
    };
    expect(collection.name).toBe('users');
    expect(collection.type).toBe('collection');
    expect(collection.count).toBe(1000);
  });
});

describe('MongoDBConnection', () => {
  it('can be created with minimal fields', () => {
    const conn: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    };
    expect(conn.name).toBe('test');
    expect(conn.type).toBe(DatabaseType.MONGODB);
    expect(conn.host).toBe('localhost');
    expect(conn.port).toBe(27017);
    expect(conn.database).toBeUndefined();
    expect(conn.tls).toBeUndefined();
    expect(conn.collections).toBeUndefined();
  });

  it('can be created with all fields', () => {
    const conn: MongoDBConnection = {
      id: 1,
      name: 'production',
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
      database: 'myapp',
      tls: true,
      collections: [
        { name: 'users', type: 'collection', count: 1000 },
        { name: 'orders', type: 'collection', count: 5000 },
      ],
    };
    expect(conn.id).toBe(1);
    expect(conn.name).toBe('production');
    expect(conn.database).toBe('myapp');
    expect(conn.tls).toBe(true);
    expect(conn.collections).toHaveLength(2);
    expect(conn.collections?.[0].name).toBe('users');
    expect(conn.collections?.[0].count).toBe(1000);
    if (conn.auth.kind === 'scram') {
      expect(conn.auth.authMechanism).toBe('SCRAM-SHA-256');
    }
  });

  it('supports uri auth', () => {
    const conn: MongoDBConnection = {
      name: 'atlas',
      type: DatabaseType.MONGODB,
      host: '',
      port: 0,
      auth: {
        kind: 'uri',
        uri: 'mongodb+srv://user:pass@cluster.mongodb.net/db?retryWrites=true&w=majority',
      },
    };
    expect(conn.auth.kind).toBe('uri');
    if (conn.auth.kind === 'uri') {
      expect(conn.auth.uri).toContain('retryWrites=true');
    }
  });

  it('can be used as Connection type', () => {
    const conn: MongoDBConnection = {
      name: 'test',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
    };
    expect(conn.type).toBe(DatabaseType.MONGODB);
    expect(DatabaseType.MONGODB).toBe('MONGODB');
  });
});

describe('DatabaseType.MONGODB', () => {
  it('has correct value', () => {
    expect(DatabaseType.MONGODB).toBe('MONGODB');
  });

  it('is distinct from other types', () => {
    expect(DatabaseType.MONGODB).not.toBe(DatabaseType.ELASTICSEARCH);
    expect(DatabaseType.MONGODB).not.toBe(DatabaseType.DYNAMODB);
  });
});

describe('MongoDB connection scenarios', () => {
  it('supports local development connection', () => {
    const conn: MongoDBConnection = {
      name: 'local-dev',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      database: 'devdb',
    };
    expect(conn.host).toBe('localhost');
    expect(conn.port).toBe(27017);
    expect(conn.auth.kind).toBe('none');
    expect(conn.database).toBe('devdb');
  });

  it('supports authenticated connection with SCRAM-SHA-256', () => {
    const conn: MongoDBConnection = {
      name: 'prod-scram',
      type: DatabaseType.MONGODB,
      host: 'mongo.prod.example.com',
      port: 27017,
      auth: {
        kind: 'scram',
        username: 'appuser',
        password: 'secretpass',
        authSource: 'admin',
        authMechanism: 'SCRAM-SHA-256',
      },
      database: 'production',
      tls: true,
    };
    expect(conn.auth.kind).toBe('scram');
    if (conn.auth.kind === 'scram') {
      expect(conn.auth.authMechanism).toBe('SCRAM-SHA-256');
    }
    expect(conn.tls).toBe(true);
  });

  it('supports Atlas connection via URI', () => {
    const conn: MongoDBConnection = {
      name: 'atlas-cluster',
      type: DatabaseType.MONGODB,
      host: '',
      port: 0,
      auth: {
        kind: 'uri',
        uri: 'mongodb+srv://admin:pass@cluster0.abc123.mongodb.net/myapp?retryWrites=true&w=majority',
      },
    };
    expect(conn.auth.kind).toBe('uri');
    if (conn.auth.kind === 'uri') {
      expect(conn.auth.uri).toContain('mongodb+srv://');
      expect(conn.auth.uri).toContain('retryWrites=true');
    }
  });

  it('supports connection with multiple collections', () => {
    const conn: MongoDBConnection = {
      name: 'multi-collection',
      type: DatabaseType.MONGODB,
      host: 'localhost',
      port: 27017,
      auth: { kind: 'none' },
      database: 'mydb',
      collections: [
        { name: 'users', type: 'collection', count: 1000 },
        { name: 'orders', type: 'collection', count: 5000 },
        { name: 'products', type: 'collection', count: 200 },
      ],
    };
    expect(conn.collections).toHaveLength(3);
    expect(conn.collections?.map(c => c.name)).toEqual(['users', 'orders', 'products']);
  });

  it('supports connection with string id', () => {
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

  it('supports connection with numeric id', () => {
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
