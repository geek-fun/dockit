import { defineStore } from 'pinia';
import { buildAuthHeader, buildURL, pureObject } from '../common';
import { loadHttpClient, storeApi } from '../datasources';
import { SearchAction, transformToCurl } from '../common/monaco';

export enum DatabaseType {
  ELASTICSEARCH = 'elasticsearch',
  DYNAMODB = 'dynamodb'
}

export interface BaseConnection {
  id?: number;
  name: string;
  type: DatabaseType;
}


export interface DynamoDBConnection extends BaseConnection {
  type: DatabaseType.DYNAMODB;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export type Connection = ElasticsearchConnection | DynamoDBConnection; 

export interface ElasticsearchConnection extends BaseConnection {
  type: DatabaseType.ELASTICSEARCH;
  host: string;
  port: number;
  username?: string;
  sslCertVerification: boolean;
  password?: string;
  indexName?: string;
  queryParameters?: string;
}

export type ConnectionIndex = {
  health: string;
  status: string;
  index: string;
  uuid: string;
  docs: {
    count: number;
    deleted: number;
  };
  mapping: { [key: string]: unknown };
  store: {
    size: string;
  };
  pri: {
    store: {
      size: string;
    };
  };
};

type Established =
  | (Connection & { indices: Array<ConnectionIndex>; activeIndex?: ConnectionIndex })
  | null;

const buildPath = (
  index: string | undefined,
  path: string | undefined,
  established: Established,
) => {
  const pathAction = path?.split('/')[0] ?? '';
  if (['_nodes', '_cluster', '_cat', '_aliases', '_analyze'].includes(pathAction)) {
    return `/${path}`;
  }
  if (index && ['_search', '_msearch', '_bulk'].includes(pathAction)) {
    return `/${index}/${path}`;
  }
  const indexName = index ?? established?.activeIndex?.index;

  return indexName ? `/${indexName}/${path}` : `/${path}`;
};

export const useConnectionStore = defineStore('connectionStore', {
  state: (): {
    connections: Connection[];
    established: Established;
    currentConnection: Connection | null;
  } => {
    return {
      connections: [],
      established: null,
      currentConnection: null,
    };
  },
  getters: {
    establishedIndexNames(state) {
      return state.established?.indices.map(({ index }) => index) ?? [];
    },
    establishedIndexOptions(state) {
      return state.established?.indices.map(({ index }) => ({ label: index, value: index })) ?? [];
    },
    connectionOptions(state) {
      return state.connections.map(({ name }) => ({ label: name, value: name }));
    },
  },
  actions: {
    async fetchConnections() {
      try {
        const connections = await storeApi.get('connections', []) as Connection[];
        this.connections = connections;
      } catch (error) {
        console.error('Error fetching connections:', error);
        this.connections = [];
      }
    },
    async testElasticsearchConnection(con: ElasticsearchConnection) {
      if (con.type !== DatabaseType.ELASTICSEARCH) {
        throw new Error('Unsupported connection type');
      }
      const client = loadHttpClient(con);

      return await client.get(con.indexName ?? undefined, 'format=json');
    },
    async saveConnection(connection: Connection): Promise<{ success: boolean; message: string }> {
      try {
        const newConnection = {
          ...connection,
          type: 'host' in connection ? DatabaseType.ELASTICSEARCH : DatabaseType.DYNAMODB,
          id: connection.id || this.connections.length + 1
        } as Connection;

        if (connection.id) {
          const index = this.connections.findIndex(c => c.id === connection.id);
          if (index !== -1) {
            this.connections[index] = newConnection;
          }
        } else {
          this.connections.push(newConnection);
        }
        
        await storeApi.set('connections', pureObject(this.connections));
        return { success: true, message: 'Connection saved successfully' };
      } catch (error) {
        console.error('Error saving connection:', error);
        return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
      }
    },
    async removeConnection(connection: Connection) {
      try {
        this.connections = this.connections.filter(c => c.id !== connection.id);
        
        try {
          await storeApi.set('connections', pureObject(this.connections));
        } catch (error) {
          console.warn('Failed to persist connections after removal:', error);
        }
      } catch (error) {
        console.error('Error removing connection:', error);
        throw error;
      }
    },
    async establishConnection(connection: Connection) {
      if (connection.type === DatabaseType.ELASTICSEARCH) {
        try {
          await this.testElasticsearchConnection(connection);
          const client = loadHttpClient(connection);
          let indices: ConnectionIndex[] = [];

          try {
            const data = (await client.get('/_cat/indices', 'format=json')) as Array<{
              [key: string]: string;
            }>;
            
            indices = data.map((index) => ({
              ...index,
              docs: {
                count: parseInt(index['docs.count'], 10),
                deleted: parseInt(index['docs.deleted'], 10),
              },
              store: { size: index['store.size'] },
            })) as ConnectionIndex[];
            this.established = { ...connection, indices };
          } catch (err) {
            this.established = { ...connection, indices: [] };
          }
        } catch (err) {
          console.warn('Failed to establish elasticsearch connection:', err);
          this.established = { ...connection, indices: [] };
        }
      } else if (connection.type === DatabaseType.DYNAMODB) {
        this.established = {...connection, indices: [], activeIndex: undefined};
      }
    },
    async fetchIndices() {
      if (!this.established) throw new Error('no connection established');
      if (this.established.type !== DatabaseType.ELASTICSEARCH) {
        throw new Error('Operation only supported for Elasticsearch connections');
      }
      const client = loadHttpClient(this.established);
      const data = (await client.get('/_cat/indices', 'format=json')) as Array<{
        [key: string]: string;
      }>;
      this.established.indices = data.map((index: { [key: string]: string }) => ({
        ...index,
        docs: {
          count: parseInt(index['docs.count'], 10),
          deleted: parseInt(index['docs.deleted'], 10),
        },
        store: { size: index['store.size'] },
      })) as ConnectionIndex[];
    },
    async selectIndex(indexName: string) {
      const client = loadHttpClient(this.established as ElasticsearchConnection);

      // get the index mapping
      const mapping = await client.get(`/${indexName}/_mapping`, 'format=json');
      const activeIndex = this.established?.indices.find(
        ({ index }: { index: string }) => index === indexName,
      );
      this.established = {
        ...this.established,
        activeIndex: { ...activeIndex, mapping },
      } as Established;
    },
    async searchQDSL({
      method,
      path,
      index,
      qdsl,
      queryParams,
    }: {
      method: string;
      path: string;
      queryParams?: string;
      index?: string;
      qdsl?: string;
    }) {
      if (!this.established) throw new Error('no connection established');
      if (this.established.type !== DatabaseType.ELASTICSEARCH) {
        throw new Error('Operation only supported for Elasticsearch connections');
      }
      const client = loadHttpClient(this.established);
      const queryParameters = queryParams ? `${queryParams}&format=json` : 'format=json';
      // refresh the index mapping
      try {
        if (index && index !== this.established.activeIndex?.index) {
          const newIndex = this.established.indices.find(
            ({ index: indexName }: ConnectionIndex) => indexName === index,
          );
          if (newIndex) {
            if (!newIndex.mapping) {
              newIndex.mapping = await client.get(`/${index}/_mapping`, queryParameters);
            }
            this.established = { ...this.established, activeIndex: newIndex };
          }
        }
      } catch (err) {}

      const reqPath = buildPath(index, path, this.established);

      const dispatch: { [method: string]: () => Promise<unknown> } = {
        POST: async () => client.post(reqPath, queryParameters, qdsl),
        PUT: async () => client.put(reqPath, queryParameters, qdsl),
        DELETE: async () => client.delete(reqPath, queryParameters, qdsl),
        GET: async () =>
          qdsl ? client.post(reqPath, queryParams, qdsl) : client.get(reqPath, queryParameters),
      };
      return dispatch[method]();
    },
    queryToCurl({ method, path, index, qdsl, queryParams }: SearchAction) {
      if (this.established?.type !== DatabaseType.ELASTICSEARCH) {
        throw new Error('Operation only supported for Elasticsearch connections');
      }
      const { username, password, host, port, sslCertVerification } = this.established ?? {
        host: 'http://localhost',
        port: 9200,
        username: undefined,
        password: undefined,
        sslCertVerification: false
      };
      const params = queryParams ? `${queryParams}&format=json` : 'format=json';
      const url = buildURL(host, port, buildPath(index, path, this.established), params);

      const headers = {
        'Content-Type': 'application/json',
        ...buildAuthHeader(username, password),
      };

      return transformToCurl({ method, headers, url, ssl: sslCertVerification, qdsl });
    },
    async testDynamoDBConnection(connection: DynamoDBConnection) {
      // test later, should send request to rust backend
      console.log('test connect to ',connection.type)
      return undefined;

    },
    validateConnection(connection: Connection): boolean {
      if (connection.type === DatabaseType.ELASTICSEARCH) {
        return !!(
          connection.host &&
          connection.port &&
          typeof connection.sslCertVerification === 'boolean'
        );
      } else if (connection.type === DatabaseType.DYNAMODB) {
        return !!(
          connection.region &&
          connection.accessKeyId &&
          connection.secretAccessKey
        );
      }
      return false;
    }
  },
});
