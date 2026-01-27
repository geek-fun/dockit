import { defineStore } from 'pinia';
import { buildAuthHeader, buildURL, CustomError, pureObject } from '../common';
import { lang } from '../lang';
import { SearchAction, transformToCurl, configureDynamicOptions } from '../common/monaco';
import {
  AttributeDefinition,
  DynamoAttributeItem,
  dynamoApi,
  DynamoIndex,
  KeySchema,
  loadHttpClient,
  QueryParams,
  storeApi,
} from '../datasources';
import { DynamoIndexOrTableOption, useTabStore } from './tabStore.ts';

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
  indices?: Array<DynamoIndex>;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  tableName: string;
  keySchema?: Array<KeySchema>;
  partitionKey: {
    name: string;
    type: string;
    valueType: string;
  };
  attributeDefinitions: Array<AttributeDefinition>;
  sortKey?: {
    name: string;
    type: string;
    valueType: string;
  };
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
  version: string;
  clusterName: string;
  clusterUuid: string;
};

type ElasticsearchClusterInfo = {
  cluster_name: string;
  cluster_uuid: string;
  name: string;
  tagline: string;
  version: {
    build_date: string;
    build_flavor: string;
    build_hash: string;
    build_snapshot: boolean;
    build_type: string;
    lucene_version: string;
    minimum_index_compatibility_version: string;
    minimum_wire_compatibility_version: string;
    number: string;
  };
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
  '_aliases',
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
        if (!targetConnection?.keySchema) return [];

        const { partitionKeyName, sortKeyName } = getIndexInfo(targetConnection.keySchema);
        const partitionKeyOption = partitionKeyName && {
          label: `Table - ${targetConnection.tableName}`,
          value: targetConnection.tableName,
          partitionKeyName,
          sortKeyName,
        };

        const indexOptions =
          targetConnection.indices?.map(index => {
            const { partitionKeyName, sortKeyName } = getIndexInfo(index.keySchema);

            return {
              label: `${index.type} - ${index.name}`,
              value: index.name,
              partitionKeyName,
              sortKeyName,
            };
          }) || [];

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
        this.connections = [];
      }
    },
    async freshConnection(con: Connection) {
      if (con.type === DatabaseType.DYNAMODB) {
        const tableInfo = await dynamoApi.describeTable(con);
        return {
          ...con,
          keySchema: tableInfo.keySchema,
          attributeDefinitions: tableInfo.attributeDefinitions,
          partitionKey: tableInfo.partitionKey,
          sortKey: tableInfo.sortKey,
          indices: tableInfo.indices,
        } as DynamoDBConnection;
      } else if (con.type === DatabaseType.ELASTICSEARCH) {
        const client = loadHttpClient(con);
        const clusterInfo = await client.get<ElasticsearchClusterInfo>(
          con.activeIndex?.index,
          'format=json',
        );

        return {
          ...con,
          version: clusterInfo.version.number,
          clusterName: clusterInfo.cluster_name,
          clusterUuid: clusterInfo.cluster_uuid,
        } as ElasticsearchConnection;
      } else {
        throw new CustomError(
          400,
          lang.global.t('connection.unsupportedType') + `: ${(con as { type: string }).type}`,
        );
      }
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

        await storeApi.set('connections', pureObject(updatedConnections));
      } catch (error) {
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
        const indices = data.map((index: { [key: string]: string }) => ({
          ...index,
          docs: {
            count: parseInt(index['docs.count'], 10),
            deleted: parseInt(index['docs.deleted'], 10),
          },
          store: { size: index['store.size'] },
        })) as ElasticSearchIndex[];

        // Sort indices: system indices (starting with .) go to the end
        connection.indices = indices.sort((a, b) => {
          const aIsSystem = a.index.startsWith('.');
          const bIsSystem = b.index.startsWith('.');
          if (aIsSystem && !bIsSystem) return 1;
          if (!aIsSystem && bIsSystem) return -1;
          return a.index.localeCompare(b.index);
        });

        // Update dynamic completion options with fetched indices
        configureDynamicOptions({
          activeIndex: connection.activeIndex?.index,
          indices: connection.indices.map(i => i.index),
        });
      }
      if (connection.type === DatabaseType.DYNAMODB) {
        const tableInfo = await dynamoApi.describeTable(con as DynamoDBConnection);
        connection.keySchema = tableInfo.keySchema;
        connection.indices = tableInfo.indices as DynamoIndex[];
        connection.partitionKey = tableInfo.partitionKey;
        connection.sortKey = tableInfo.sortKey;
        connection.attributeDefinitions = tableInfo.attributeDefinitions;
      }

      // Update activePanel.connection if it matches the fetched connection
      const tabStore = useTabStore();
      if (tabStore.activePanel?.connection?.id === connection.id) {
        tabStore.activePanel.connection = connection;
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

      // Update dynamic completion options with the selected index
      configureDynamicOptions({
        activeIndex: indexName,
        indices: connection.indices?.map(i => i.index) ?? [],
      });
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
      return queryParams.partitionKey.value
        ? await dynamoApi.queryTable(con, queryParams)
        : await dynamoApi.scanTable(con, queryParams);
    },

    async createItem(
      con: DynamoDBConnection,
      attributes: DynamoAttributeItem[],
      options?: { skipExisting?: boolean; partitionKey?: string },
    ) {
      return await dynamoApi.createItem(con, attributes, options);
    },

    async updateItem(
      con: DynamoDBConnection,
      keys: DynamoAttributeItem[],
      attributes: DynamoAttributeItem[],
    ) {
      return await dynamoApi.updateItem(con, keys, attributes);
    },

    async deleteItem(con: DynamoDBConnection, keys: DynamoAttributeItem[]) {
      return await dynamoApi.deleteItem(con, keys);
    },
  },
});
