import { defineStore } from 'pinia';
import {
  buildAuthHeader,
  buildURL,
  CustomError,
  pureObject,
  CONNECTION_SCHEMA_VERSION,
} from '../common';
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
  OPENSEARCH = 'OPENSEARCH',
  DYNAMODB = 'DYNAMODB',
  MONGODB = 'MONGODB',
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

/**
 * Extract field names from an Elasticsearch index mapping response.
 * The mapping response format is:
 *   { "index_name": { "mappings": { "properties": { "field1": {...}, ... } } } }
 */
export const extractFieldsFromMapping = (
  mapping: Record<string, unknown> | undefined,
): string[] => {
  if (!mapping) return [];
  const firstIndex = Object.values(mapping)[0] as Record<string, unknown> | undefined;
  const mappings = firstIndex?.mappings as Record<string, unknown> | undefined;
  const properties = mappings?.properties as Record<string, unknown> | undefined;
  return properties ? Object.keys(properties) : [];
};

export type DynamoTableFilter =
  | { kind: 'all' }
  | { kind: 'explicit'; tableNames: string[] }
  | { kind: 'exclude'; tableNames: string[] }
  | { kind: 'regex'; pattern: string };

export type DynamoTableKey = {
  name: string;
  type: string;
  valueType: string;
};

export type DynamoTableSummary = {
  name: string;
  status?: string;
  itemCount?: number;
  sizeBytes?: number;
  billingMode?: string;
  partitionKey?: DynamoTableKey;
  sortKey?: DynamoTableKey;
  keySchema?: Array<KeySchema>;
  attributeDefinitions?: Array<AttributeDefinition>;
  indices?: Array<DynamoIndex>;
  creationDateTime?: string;
};

export const findTable = (
  connection: DynamoDBConnection,
  tableName: string,
): DynamoTableSummary | undefined =>
  (connection.tables ?? []).find(({ name }) => name === tableName);

export const upsertTable = (
  tables: ReadonlyArray<DynamoTableSummary>,
  next: DynamoTableSummary,
): Array<DynamoTableSummary> => {
  const exists = tables.some(({ name }) => name === next.name);
  return exists
    ? tables.map(t => (t.name === next.name ? { ...t, ...next } : t))
    : [...tables, next];
};

export const applyTableFilter = (
  allTables: string[],
  filter: DynamoTableFilter | undefined,
): string[] => {
  if (!filter || filter.kind === 'all') return [...allTables];
  if (filter.kind === 'explicit') {
    const allowed = new Set(filter.tableNames);
    return allTables.filter(name => allowed.has(name));
  }
  if (filter.kind === 'exclude') {
    const blocked = new Set(filter.tableNames);
    return allTables.filter(name => !blocked.has(name));
  }
  if (filter.kind === 'regex') {
    try {
      const re = new RegExp(filter.pattern);
      return allTables.filter(name => re.test(name));
    } catch {
      return [];
    }
  }
  return [...allTables];
};

export type DynamoDBAuth =
  | { kind: 'accessKey'; accessKeyId: string; secretAccessKey: string }
  | { kind: 'profile'; profileName: string }
  | {
      kind: 'sso';
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken: string;
      region: string;
      expirationTimestamp?: number;
    }
  | {
      kind: 'assumeRole';
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken: string;
      region: string;
      expirationTimestamp?: number;
    };

export type DynamoDBConnection = {
  id?: number | string;
  name: string;
  type: DatabaseType.DYNAMODB;
  region: string;
  endpointUrl?: string;
  auth: DynamoDBAuth;

  tableFilter?: DynamoTableFilter;
  tables?: Array<DynamoTableSummary>;
  favoriteTables?: Array<string>;
};

// Shared base for HTTP-API-compatible search engines
export type SearchConnectionBase = {
  id?: number;
  name: string;
  indices: Array<ElasticSearchIndex>;
  host: string;
  port: number;
  authType?: 'basic' | 'apiKey';
  username?: string;
  sslCertVerification: boolean;
  password?: string;
  apiKey?: string;
  queryParameters?: string;
  activeIndex: ElasticSearchIndex | undefined;
  version: string;
  clusterName: string;
  clusterUuid: string;
};

export type ElasticsearchConnection = SearchConnectionBase & {
  type: DatabaseType.ELASTICSEARCH;
};

export type OpenSearchConnection = SearchConnectionBase & {
  type: DatabaseType.OPENSEARCH;
};

export type SearchConnection = ElasticsearchConnection | OpenSearchConnection;

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
    distribution?: string;
    lucene_version: string;
    minimum_index_compatibility_version: string;
    minimum_wire_compatibility_version: string;
    number: string;
  };
};

export type MongoDBAuth =
  | { kind: 'none' }
  | {
      kind: 'scram';
      username: string;
      password: string;
      authSource?: string;
      authMechanism?: string;
    }
  | { kind: 'uri'; uri: string };

export type MongoDBConnection = {
  id?: number | string;
  name: string;
  type: DatabaseType.MONGODB;
  host: string;
  port: number;
  auth: MongoDBAuth;
  database?: string;
  tls?: boolean;
  collections?: Array<MongoDBCollection>;
};

export type MongoDBCollection = {
  name: string;
  type?: string;
  count?: number;
};

export type Connection =
  | ElasticsearchConnection
  | OpenSearchConnection
  | DynamoDBConnection
  | MongoDBConnection;

export const isSearchConnection = (
  connection: Connection | undefined | null,
): connection is SearchConnection =>
  connection != null &&
  (connection.type === DatabaseType.ELASTICSEARCH || connection.type === DatabaseType.OPENSEARCH);

export const isOpenSearchConnection = (
  connection: Connection | undefined | null,
): connection is OpenSearchConnection =>
  connection != null && connection.type === DatabaseType.OPENSEARCH;

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
  '_query',
  '_sql',
  '_plugins',
];

const buildPath = (
  index: string | undefined,
  path: string | undefined,
  connection: SearchConnection,
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

type V1DynamoDBConnection = DynamoDBConnection & {
  accessKeyId: string;
  secretAccessKey: string;
  tableName?: string;
  keySchema?: Array<KeySchema>;
  partitionKey?: { name: string; type: string; valueType: string };
  sortKey?: { name: string; type: string; valueType: string };
  attributeDefinitions?: Array<AttributeDefinition>;
  indices?: Array<DynamoIndex>;
};

const credentialSignature = (con: V1DynamoDBConnection): string =>
  `${con.region}|${con.accessKeyId}|${con.endpointUrl ?? ''}`;

export const migrateDynamoConnectionsV1ToV2 = (
  raw: Connection[],
): { migrated: Connection[]; consolidatedCount: number; originalCount: number } => {
  const dynamo = raw.filter((c): c is V1DynamoDBConnection => c.type === DatabaseType.DYNAMODB);
  const others = raw.filter(c => c.type !== DatabaseType.DYNAMODB);

  if (dynamo.length === 0) {
    return { migrated: raw, consolidatedCount: 0, originalCount: 0 };
  }

  const groups = dynamo.reduce<Map<string, V1DynamoDBConnection[]>>((acc, con) => {
    const sig = credentialSignature(con);
    const list = acc.get(sig) ?? [];
    list.push(con);
    acc.set(sig, list);
    return acc;
  }, new Map());

  const consolidated: DynamoDBConnection[] = Array.from(groups.values()).map(group => {
    const head = group[0];
    const tableNames = group.filter(c => c.tableName).map(c => c.tableName as string);
    const dedupedTableNames = [...new Set(tableNames)];
    const tables: DynamoTableSummary[] = dedupedTableNames.map(name => {
      const v1Con = group.find(c => c.tableName === name);
      return {
        name,
        keySchema: v1Con?.keySchema,
        attributeDefinitions: v1Con?.attributeDefinitions,
        partitionKey: v1Con?.partitionKey,
        sortKey: v1Con?.sortKey,
        indices: v1Con?.indices,
      };
    });
    return {
      id: head.id,
      name: head.name,
      type: DatabaseType.DYNAMODB,
      region: head.region,
      endpointUrl: head.endpointUrl,
      auth: {
        kind: 'accessKey' as const,
        accessKeyId: head.accessKeyId ?? '',
        secretAccessKey: head.secretAccessKey ?? '',
      },
      tableFilter:
        dedupedTableNames.length > 0
          ? { kind: 'explicit', tableNames: dedupedTableNames }
          : { kind: 'all' },
      tables,
    };
  });

  return {
    migrated: [...others, ...consolidated],
    consolidatedCount: consolidated.length,
    originalCount: dynamo.length,
  };
};

type V2DynamoDBConnection = DynamoDBConnection & {
  accessKeyId?: string;
  secretAccessKey?: string;
};

export const migrateDynamoConnectionsV2ToV3 = (raw: Connection[]): Connection[] =>
  raw.map(con => {
    if (con.type !== DatabaseType.DYNAMODB) return con;

    const v2 = con as unknown as V2DynamoDBConnection;

    const hasAuthField =
      v2.auth != null && typeof (v2.auth as Record<string, unknown>).kind === 'string';
    if (hasAuthField) return con;

    const accessKeyId = v2.accessKeyId ?? '';
    const secretAccessKey = v2.secretAccessKey ?? '';

    const { accessKeyId: _, secretAccessKey: __, ...rest } = v2 as V2DynamoDBConnection;

    return {
      ...rest,
      auth: { kind: 'accessKey' as const, accessKeyId, secretAccessKey },
    } as DynamoDBConnection;
  });

type V4ElasticsearchConnection = ElasticsearchConnection & {
  isOpenSearch?: boolean;
};

const migrateSearchConnectionsV4ToV5 = (raw: Connection[]): Connection[] =>
  raw.map(con => {
    if (con.type !== DatabaseType.ELASTICSEARCH) return con;

    const v4 = con as unknown as V4ElasticsearchConnection;
    const { isOpenSearch, ...rest } = v4;

    if (isOpenSearch) {
      return {
        ...rest,
        type: DatabaseType.OPENSEARCH,
      } as OpenSearchConnection;
    }

    return rest as ElasticsearchConnection;
  });

export const migrateConnections = (
  connections: Connection[],
  fromVersion: number,
): {
  migrated: Connection[];
  consolidatedCount: number;
  originalCount: number;
} => {
  let migrated = connections;
  let consolidatedCount = 0;
  let originalCount = 0;

  if (fromVersion < 2) {
    const result = migrateDynamoConnectionsV1ToV2(migrated);
    migrated = result.migrated;
    consolidatedCount = result.consolidatedCount;
    originalCount = result.originalCount;
  }

  if (fromVersion < 3) {
    migrated = migrateDynamoConnectionsV2ToV3(migrated);
  }

  // V3→V4: no migration needed - new auth variants added, existing connections remain valid

  if (fromVersion < 5) {
    migrated = migrateSearchConnectionsV4ToV5(migrated);
  }

  return { migrated, consolidatedCount, originalCount };
};

export const useConnectionStore = defineStore('connectionStore', {
  state: (): {
    connections: Connection[];
    migrationNotice: { consolidatedCount: number; originalCount: number } | null;
  } => {
    return {
      connections: [],
      migrationNotice: null,
    };
  },
  getters: {
    connectionOptions(state) {
      return state.connections.map(({ name }) => ({ label: name, value: name }));
    },
    getDynamoIndexOrTableOption: () => {
      return (targetConnection?: DynamoDBConnection, tableName?: string) => {
        if (!targetConnection || !tableName) return [];
        const table = findTable(targetConnection, tableName);
        if (!table?.keySchema) return [];

        const { partitionKeyName, sortKeyName } = getIndexInfo(table.keySchema);
        const tableScanOption = partitionKeyName && {
          label: `Table - ${tableName}`,
          value: tableName,
          partitionKeyName,
          sortKeyName,
        };

        const indexOptions =
          table.indices?.map(index => {
            const { partitionKeyName: pkName, sortKeyName: skName } = getIndexInfo(index.keySchema);
            return {
              label: `${index.type} - ${index.name}`,
              value: index.name,
              partitionKeyName: pkName,
              sortKeyName: skName,
            };
          }) || [];

        return [tableScanOption, ...indexOptions].filter(
          Boolean,
        ) as Array<DynamoIndexOrTableOption>;
      };
    },
  },
  actions: {
    async fetchConnections() {
      try {
        const fetchedConnections = (await storeApi.get('connections', [])) as Connection[];
        const normalized = fetchedConnections.map(connection => ({
          ...connection,
          type: connection.type?.toUpperCase() ?? DatabaseType.ELASTICSEARCH,
        })) as Connection[];

        const storedVersion = (await storeApi.get<number>('schemaVersion', 1)) ?? 1;

        if (storedVersion < CONNECTION_SCHEMA_VERSION) {
          let migrated = normalized;
          let consolidatedCount = 0;
          let originalCount = 0;

          try {
            await storeApi.set('connections_v1_backup', pureObject(normalized));
            if (storedVersion < 5) {
              await storeApi.set('connections_v4_backup', pureObject(normalized));
            }
          } catch {
            // Backup creation failed - continue without backup
          }

          try {
            const result = migrateConnections(normalized, storedVersion);
            migrated = result.migrated;
            consolidatedCount = result.consolidatedCount;
            originalCount = result.originalCount;

            await storeApi.set('connections', pureObject(migrated));
            await storeApi.set('schemaVersion', CONNECTION_SCHEMA_VERSION);

            if (originalCount > 0 && consolidatedCount < originalCount) {
              this.migrationNotice = { consolidatedCount, originalCount };
            }
          } catch {
            // Migration failed - use normalized connections, schemaVersion not updated
            migrated = normalized;
          }

          this.connections = migrated;

          try {
            await storeApi.delete('connections_v1_backup');
            await storeApi.delete('connections_v4_backup');
          } catch {
            // Cleanup failed - backups remain but app works
          }
        } else {
          this.connections = normalized;
        }
      } catch {
        this.connections = [];
      }
    },
    dismissMigrationNotice() {
      this.migrationNotice = null;
    },
    async fetchTables(con: DynamoDBConnection) {
      const connection = this.connections.find(({ id }) => id === con.id) as
        | DynamoDBConnection
        | undefined;
      if (!connection) throw new Error('no connection established');

      const allTables = await dynamoApi.listTables(connection);

      const visible = applyTableFilter(allTables, connection.tableFilter);
      const existingTablesByName = new Map(
        (connection.tables ?? []).map(table => [table.name, table]),
      );
      connection.tables = visible.map(name => existingTablesByName.get(name) ?? { name });

      const tabStore = useTabStore();
      if (tabStore.activePanel?.connection?.id === connection.id) {
        tabStore.activePanel.connection = connection;
      }

      return connection.tables;
    },
    async freshConnection(con: Connection, tableName?: string) {
      if (con.type === DatabaseType.DYNAMODB) {
        const allTables = await dynamoApi.listTables(con);

        const visible = applyTableFilter(allTables, con.tableFilter);

        if (tableName) {
          const tableInfo = await dynamoApi.describeTable(con, tableName);
          const summary: DynamoTableSummary = {
            name: tableName,
            status: tableInfo.status,
            itemCount: tableInfo.itemCount,
            sizeBytes: tableInfo.sizeBytes,
            billingMode: tableInfo.billingMode,
            keySchema: tableInfo.keySchema,
            attributeDefinitions: tableInfo.attributeDefinitions,
            partitionKey: tableInfo.partitionKey,
            sortKey: tableInfo.sortKey,
            indices: tableInfo.indices,
            creationDateTime: tableInfo.creationDateTime,
          };
          return {
            ...con,
            tables: upsertTable(con.tables ?? [], summary),
          } as DynamoDBConnection;
        }

        return {
          ...con,
          tables: visible.map(name => ({ name })),
        } as DynamoDBConnection;
      } else if (con.type === DatabaseType.ELASTICSEARCH || con.type === DatabaseType.OPENSEARCH) {
        const client = loadHttpClient(con);
        const clusterInfo = await client.get<ElasticsearchClusterInfo>(
          con.activeIndex?.index,
          'format=json',
        );

        const detectedAsOpenSearch =
          clusterInfo.version.distribution === 'opensearch' ||
          (clusterInfo.tagline ?? '').toLowerCase().includes('opensearch');
        const connectionType = detectedAsOpenSearch ? DatabaseType.OPENSEARCH : con.type;
        return {
          ...con,
          type: connectionType,
          version: clusterInfo.version.number,
          clusterName: clusterInfo.cluster_name,
          clusterUuid: clusterInfo.cluster_uuid,
        } as SearchConnection;
      } else if (con.type === DatabaseType.MONGODB) {
        const { mongoApi } = await import('../datasources');
        const result = await mongoApi.testConnection(con);
        if (!result.success) {
          throw new CustomError(400, result.message);
        }
        return {
          ...con,
          collections: result.collections?.map(name => ({ name })),
        } as MongoDBConnection;
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
      const updatedConnections = this.connections.filter(c => c.id !== connection.id);
      this.connections = updatedConnections;

      await storeApi.set('connections', pureObject(updatedConnections));
    },
    async fetchIndices(con: Connection, tableName?: string) {
      const connection = this.connections.find(({ id }) => id === con.id);
      if (!connection) throw new Error('no connection established');
      if (
        connection.type === DatabaseType.ELASTICSEARCH ||
        connection.type === DatabaseType.OPENSEARCH
      ) {
        const client = loadHttpClient(connection);
        const esCon = connection as SearchConnection;
        const majorVersionStr = esCon.version?.split('.')[0];
        const majorVersion =
          majorVersionStr !== undefined ? parseInt(majorVersionStr, 10) : undefined;
        const expandWildcards =
          connection.type === DatabaseType.OPENSEARCH ||
          (majorVersion !== undefined && majorVersion >= 6)
            ? '&expand_wildcards=all'
            : '';
        const data = (await client.get('/_cat/indices', `format=json${expandWildcards}`)) as Array<{
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
        const tabStore = useTabStore();
        configureDynamicOptions({
          activeIndex: connection.activeIndex?.index,
          indices: connection.indices.map(i => i.index),
          includeSystemIndices: tabStore.activePanel?.includeSystemIndices ?? false,
          fields: connection.activeIndex?.mapping
            ? extractFieldsFromMapping(connection.activeIndex.mapping as Record<string, unknown>)
            : undefined,
        });
      }
      if (connection.type === DatabaseType.DYNAMODB && tableName) {
        const tableInfo = await dynamoApi.describeTable(con as DynamoDBConnection, tableName);
        const summary: DynamoTableSummary = {
          name: tableName,
          status: tableInfo.status,
          itemCount: tableInfo.itemCount,
          sizeBytes: tableInfo.sizeBytes,
          billingMode: tableInfo.billingMode,
          keySchema: tableInfo.keySchema,
          attributeDefinitions: tableInfo.attributeDefinitions,
          partitionKey: tableInfo.partitionKey,
          sortKey: tableInfo.sortKey,
          indices: tableInfo.indices,
          creationDateTime: tableInfo.creationDateTime,
        };
        connection.tables = upsertTable(connection.tables ?? [], summary);
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

      // Extract field names from mapping for ES|QL completions
      const fields = extractFieldsFromMapping(mapping as Record<string, unknown>);

      // Update dynamic completion options with the selected index and its fields
      const tabStore = useTabStore();
      configureDynamicOptions({
        activeIndex: indexName,
        indices: connection.indices?.map(i => i.index) ?? [],
        includeSystemIndices: tabStore.activePanel?.includeSystemIndices ?? false,
        fields,
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
      const connection = this.connections.find(({ id }) => id === con.id) as SearchConnection;
      if (!connection) throw new Error('no connection established');
      if (!isSearchConnection(connection)) {
        throw new Error('Operation only supported for Elasticsearch/OpenSearch connections');
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
      } catch (_err) {
        // Silently ignore mapping fetch errors
      }

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
      if (!isSearchConnection(connection)) {
        throw new Error('Operation only supported for Elasticsearch/OpenSearch connections');
      }
      const { username, password, host, port, sslCertVerification, authType, apiKey } =
        connection ?? {
          host: 'http://localhost',
          port: 9200,
          username: undefined,
          password: undefined,
          sslCertVerification: false,
        };
      const url = buildURL(host, port, buildPath(index, path, connection), queryParams);

      const authHeader = buildAuthHeader(authType, username, password, apiKey);

      const headers = {
        ...authHeader,
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
      tableName: string,
      attributes: DynamoAttributeItem[],
      options?: { skipExisting?: boolean; partitionKey?: string },
    ) {
      return await dynamoApi.createItem(con, tableName, attributes, options);
    },

    async updateItem(
      con: DynamoDBConnection,
      tableName: string,
      keys: DynamoAttributeItem[],
      attributes: DynamoAttributeItem[],
    ) {
      return await dynamoApi.updateItem(con, tableName, keys, attributes);
    },

    async deleteItem(con: DynamoDBConnection, tableName: string, keys: DynamoAttributeItem[]) {
      return await dynamoApi.deleteItem(con, tableName, keys);
    },
  },
});
