import { defineStore } from 'pinia';
import { buildAuthHeader, buildURL, CustomError, pureObject } from '../common';
import { SearchAction, transformToCurl } from '../common/monaco';
import {
  loadHttpClient,
  storeApi,
  dynamoApi,
  DynamoIndex,
  KeySchema,
  QueryParams,
} from '../datasources';
import { DynamoIndexOrTableOption } from './tabStore.ts';

export enum DatabaseType {
  ELASTICSEARCH = 'ELASTICSEARCH',
  DYNAMODB = 'DYNAMODB',
}

type ElasticSearchIndex = {
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

export type DynamoDBConnection = {
  id?: number;
  name: string;
  type: DatabaseType.DYNAMODB;
  indices: Array<DynamoIndex>;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  tableName: string;
  keySchema: Array<KeySchema>;
};

export type ElasticsearchConnection = {
  id?: number;
  name: string;
  type: DatabaseType.ELASTICSEARCH;
  indices: Array<ElasticSearchIndex>;
  host: string;
  port: number;
  username?: string;
  sslCertVerification: boolean;
  password?: string;
  queryParameters?: string;
  activeIndex: ElasticSearchIndex | undefined;
};

export type Connection = ElasticsearchConnection | DynamoDBConnection;

const globalPathActions = [
  '_cluster',
  '_cat',
  '_nodes',
  '_template',
  '_ilm',
  '_reindex',
  '_ingest',
  '_snapshot',
  '_tasks',
  '_analyze',
];

const buildPath = (
  index: string | undefined,
  path: string | undefined,
  connection: ElasticsearchConnection,
) => {
  // return user specified path if exists
  if (index) return `/${index}/${path}`;

  // ignore default path if it is a global path action
  const pathAction = path?.split('/')[0] ?? '';
  if (globalPathActions.includes(pathAction)) {
    return `/${path}`;
  }

  // attach index name to path if it is not a global path action
  const selectedIndex = connection?.activeIndex?.index;

  return selectedIndex ? `/${selectedIndex}/${path}` : `/${path}`;
};

const getIndexInfo = (keySchema: KeySchema[]) => {
  const partitionKey = keySchema.find(({ keyType }) => keyType.toUpperCase() === 'HASH');
  const sortKey = keySchema.find(({ keyType }) => keyType.toUpperCase() === 'RANGE');

  return {
    partitionKeyName: partitionKey?.attributeName || '',
    sortKeyName: sortKey?.attributeName || undefined,
  };
};

export const useConnectionStore = defineStore('connectionStore', {
  state: (): {
    connections: Connection[];
  } => {
    return {
      connections: [],
    };
  },
  getters: {
    connectionOptions(state) {
      return state.connections.map(({ name }) => ({ label: name, value: name }));
    },
    getDynamoIndexOrTableOption: () => {
      return (targetConnection?: DynamoDBConnection) => {
        if (!targetConnection || targetConnection.type !== DatabaseType.DYNAMODB) return [];

        const { partitionKeyName, sortKeyName } = getIndexInfo(targetConnection.keySchema);
        const partitionKeyOption = partitionKeyName && {
          label: `Table - ${targetConnection.tableName}`,
          value: targetConnection.tableName,
          partitionKeyName,
          sortKeyName,
        };

        const indexOptions = targetConnection.indices?.map(index => {
          const { partitionKeyName, sortKeyName } = getIndexInfo(index.keySchema);

          return {
            label: `GSI - ${index.name}`,
            value: index.name,
            partitionKeyName,
            sortKeyName,
          };
        });

        return [partitionKeyOption, ...indexOptions].filter(
          Boolean,
        ) as Array<DynamoIndexOrTableOption>;
      };
    },
  },
  actions: {
    async fetchConnections() {
      try {
        const fetchedConnections = (await storeApi.get('connections', [])) as Connection[];
        this.connections = fetchedConnections.map(connection => ({
          ...connection,
          type: connection.type?.toUpperCase() ?? DatabaseType.ELASTICSEARCH,
        })) as Connection[];
      } catch (error) {
        console.error('Error fetching connections:', error);
        this.connections = [];
      }
    },
    async testConnection(con: Connection) {
      if (con.type === DatabaseType.DYNAMODB) {
        return await dynamoApi.describeTable(con);
      } else if (con.type === DatabaseType.ELASTICSEARCH) {
        const client = loadHttpClient(con);

        return await client.get(con.activeIndex?.index, 'format=json');
      }

      throw new CustomError(
        400,
        'Connection test failed Connection test failed. Please check your connection settings.',
      );
    },
    async saveConnection(connection: Connection): Promise<{ success: boolean; message: string }> {
      try {
        const newConnection = {
          ...connection,
          type: 'host' in connection ? DatabaseType.ELASTICSEARCH : DatabaseType.DYNAMODB,
          id: connection.id || this.connections.length + 1,
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
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    async removeConnection(connection: Connection) {
      try {
        const updatedConnections = this.connections.filter(c => c.id !== connection.id);
        this.connections = updatedConnections;

        try {
          await storeApi.set('connections', pureObject(updatedConnections));
        } catch (error) {
          console.warn('Failed to persist connections after removal:', error);
        }
      } catch (error) {
        console.error('Error removing connection:', error);
        throw error;
      }
    },
    async fetchIndices(con: Connection) {
      const connection = this.connections.find(({ id }) => id === con.id);
      if (!connection) throw new Error('no connection established');
      if (connection.type === DatabaseType.ELASTICSEARCH) {
        const client = loadHttpClient(connection);
        const data = (await client.get('/_cat/indices', 'format=json')) as Array<{
          [key: string]: string;
        }>;
        connection.indices = data.map((index: { [key: string]: string }) => ({
          ...index,
          docs: {
            count: parseInt(index['docs.count'], 10),
            deleted: parseInt(index['docs.deleted'], 10),
          },
          store: { size: index['store.size'] },
        })) as ElasticSearchIndex[];
      }
      if (connection.type === DatabaseType.DYNAMODB) {
        const tableInfo = await dynamoApi.describeTable(con as DynamoDBConnection);
        connection.keySchema = tableInfo.keySchema;
        connection.indices = tableInfo.indices as DynamoIndex[];
      }
    },
    async selectIndex(con: Connection, indexName: string) {
      const connection = this.connections.find(
        ({ id }) => id === con.id,
      ) as ElasticsearchConnection;
      const client = loadHttpClient(connection);

      // get the index mapping
      const mapping = await client.get(`/${indexName}/_mapping`, 'format=json');
      const activeIndex = (connection.indices as ElasticSearchIndex[]).find(
        ({ index }: { index: string }) => index === indexName,
      );
      connection.activeIndex = { ...activeIndex, mapping } as ElasticSearchIndex;
    },
    async searchQDSL(
      con: Connection,
      {
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
      },
    ) {
      const connection = this.connections.find(
        ({ id }) => id === con.id,
      ) as ElasticsearchConnection;
      if (!connection) throw new Error('no connection established');
      if (connection.type !== DatabaseType.ELASTICSEARCH) {
        throw new Error('Operation only supported for Elasticsearch connections');
      }
      const client = loadHttpClient(connection);
      // refresh the index mapping
      try {
        if (index && index !== connection.activeIndex?.index) {
          const newIndex = (connection.indices as ElasticSearchIndex[]).find(
            ({ index: indexName }) => indexName === index,
          ) as ElasticSearchIndex;

          if (newIndex) {
            if (!newIndex.mapping) {
              newIndex.mapping = await client.get(`/${index}/_mapping`, 'format=json');
            }
            connection.activeIndex = newIndex;
          }
        }
      } catch (err) {}

      const reqPath = buildPath(index, path, connection);

      const dispatch: { [method: string]: () => Promise<unknown> } = {
        POST: async () => client.post(reqPath, queryParams, qdsl),
        PUT: async () => client.put(reqPath, queryParams, qdsl),
        DELETE: async () => client.delete(reqPath, queryParams, qdsl),
        GET: async () =>
          qdsl ? client.post(reqPath, queryParams, qdsl) : client.get(reqPath, queryParams),
      };
      return dispatch[method]();
    },
    queryToCurl(connection: Connection, { method, path, index, qdsl, queryParams }: SearchAction) {
      if (connection?.type !== DatabaseType.ELASTICSEARCH) {
        throw new Error('Operation only supported for Elasticsearch connections');
      }
      const { username, password, host, port, sslCertVerification } = connection ?? {
        host: 'http://localhost',
        port: 9200,
        username: undefined,
        password: undefined,
        sslCertVerification: false,
      };
      const url = buildURL(host, port, buildPath(index, path, connection), queryParams);

      const headers = {
        ...buildAuthHeader(username, password),
        ...(qdsl ? { 'Content-Type': 'application/json' } : {}),
      };

      return transformToCurl({ method, headers, url, ssl: sslCertVerification, qdsl });
    },
    async queryTable(con: DynamoDBConnection, queryParams: QueryParams) {
      try {
        if (queryParams.partitionKey.value) {
          return await dynamoApi.queryTable(con, queryParams);
        } else {
          return await dynamoApi.scanTable(con, queryParams);
        }
      } catch (err) {
        console.error('Error querying table:', err);
        throw new CustomError(
          400,
          'Query failed. Please check your query parameters and try again.',
        );
      }
    },
  },
});
