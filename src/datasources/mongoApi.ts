import { invoke } from '@tauri-apps/api/core';
import type { MongoDBConnection, MongoDBAuth } from '../store';
import { invokeCapability, parseMongoCapabilityResponse } from './capabilityInvoker.ts';
import { jsonify } from '../common';

type MongoTestResult = {
  success: boolean;
  message: string;
  collections?: string[];
};

type MongoQueryResult = {
  success: boolean;
  data?: unknown;
  error?: string;
};

export type MongoDatabaseInfo = {
  name: string;
  size_on_disk?: number;
  empty?: boolean;
  collections?: number;
};

export type MongoListDatabasesResult = {
  success: boolean;
  databases?: MongoDatabaseInfo[];
  total_size?: number;
  error?: string;
};

export type MongoCollectionInfo = {
  name: string;
  collection_type: string;
  document_count?: number;
  storage_size?: number;
  index_count?: number;
  avg_document_size?: number;
};

export type MongoListCollectionsResult = {
  success: boolean;
  collections?: MongoCollectionInfo[];
  error?: string;
};

export type MongoCollectionStats = {
  ns: string;
  count: number;
  size: number;
  avg_obj_size?: number;
  storage_size: number;
  nindexes: number;
  total_index_size: number;
  index_sizes?: Record<string, number>;
  capped?: boolean;
  max?: number;
  max_size?: number;
};

export type MongoCollectionStatsResult = {
  success: boolean;
  stats?: MongoCollectionStats;
  error?: string;
};

export type MongoDatabaseStats = {
  db: string;
  collections: number;
  objects: number;
  avg_obj_size?: number;
  data_size: number;
  storage_size: number;
  indexes: number;
  index_size: number;
  total_size: number;
  scale_factor?: number;
};

export type MongoDatabaseStatsResult = {
  success: boolean;
  stats?: MongoDatabaseStats;
  version?: string;
  error?: string;
};

export type MongoOperationResult = {
  success: boolean;
  message?: string;
  error?: string;
};

export type MongoCreateCollectionOptions = {
  capped?: boolean;
  size?: number;
  max?: number;
  timeseries?: {
    timeField: string;
    metaField?: string;
    granularity?: string;
  };
  validator?: Record<string, unknown>;
};

export type MongoServerStatus = {
  host: string;
  version: string;
  uptime: number;
  connections: {
    current: number;
    available: number;
    total_created?: number;
  };
  network: {
    bytes_in: number;
    bytes_out: number;
    num_requests: number;
  };
  memory: {
    resident: number;
    virtual_mem: number;
  };
};

export type MongoServerStatusResult = {
  success: boolean;
  status?: MongoServerStatus;
  error?: string;
};

export type MongoReplicaMember = {
  name: string;
  state: number;
  state_str: string;
  health?: number;
  uptime: number;
  optime?: string;
  optime_date?: string;
  lag_time?: number;
  ping_ms?: number;
  election_time?: string;
};

export type MongoReplicaSetStatus = {
  set: string;
  date?: string;
  my_state: number;
  members: MongoReplicaMember[];
  election_time?: string;
};

export type MongoReplSetStatusResult = {
  success: boolean;
  status?: MongoReplicaSetStatus;
  error?: string;
};

export type MongoShardInfo = {
  id: string;
  host: string;
  state: number;
  tags?: string[];
};

export type MongoMongosInfo = {
  id: string;
  host: string;
  ping?: number;
};

export type MongoConfigServerInfo = {
  type_: string;
  name?: string;
  members?: MongoReplicaMember[];
};

export type MongoShardCluster = {
  is_sharding_enabled: boolean;
  mongos: MongoMongosInfo[];
  config_servers?: MongoConfigServerInfo;
  shards: MongoShardInfo[];
};

export type MongoShardStatusResult = {
  success: boolean;
  cluster?: MongoShardCluster;
  error?: string;
};

export type MongoFindDocumentsResult = {
  success: boolean;
  documents?: Record<string, unknown>[];
  total?: number;
  error?: string;
};

export type MongoWriteResult = {
  success: boolean;
  matched_count?: number;
  modified_count?: number;
  deleted_count?: number;
  inserted_id?: string;
  error?: string;
};

export type MongoConnectionConfig = {
  host: string;
  port: number;
  auth?: MongoDBAuth;
  database?: string;
  tls?: boolean;
};

export type MongoExportResult = {
  success: boolean;
  documents?: Record<string, unknown>[];
  total?: number;
  has_more: boolean;
  error?: string;
};

export type MongoImportResult = {
  success: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  errors?: string[];
  error?: string;
};

const buildConfig = (con: MongoDBConnection) => ({
  host: con.host,
  port: con.port,
  auth: con.auth,
  database: con.activeDatabase || con.database,
  tls: con.tls,
});

export const mongoApi = {
  testConnection: async (con: MongoDBConnection): Promise<MongoTestResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoTestResult>('mongo_test_connection', { config });
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  },

  executeQuery: async (con: MongoDBConnection, code: string): Promise<MongoQueryResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoQueryResult>('mongo_execute_query', { config, code });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  listDatabases: async (con: MongoDBConnection): Promise<MongoListDatabasesResult> => {
    try {
      const raw = await invokeCapability('mongo__list_databases', {}, String(con.id));
      const data = parseMongoCapabilityResponse<{ databases: string[] }>(raw);
      return { success: true, databases: data.databases.map(name => ({ name })) };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  listCollections: async (
    con: MongoDBConnection,
    database: string,
  ): Promise<MongoListCollectionsResult> => {
    try {
      const raw = await invokeCapability('mongo__list_collections', { database }, String(con.id));
      const data = parseMongoCapabilityResponse<{ collections: string[] }>(raw);
      return {
        success: true,
        collections: data.collections.map(name => ({ name, collection_type: 'collection' })),
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  collectionStats: async (
    con: MongoDBConnection,
    database: string,
    collection: string,
  ): Promise<MongoCollectionStatsResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__collection_stats',
        { database, collection },
        String(con.id),
      );
      return parseMongoCapabilityResponse<MongoCollectionStatsResult>(raw);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  databaseStats: async (
    con: MongoDBConnection,
    database: string,
  ): Promise<MongoDatabaseStatsResult> => {
    try {
      const raw = await invokeCapability('mongo__database_stats', { database }, String(con.id));
      return parseMongoCapabilityResponse<MongoDatabaseStatsResult>(raw);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  createDatabase: async (
    con: MongoDBConnection,
    database: string,
    collection: string,
  ): Promise<MongoOperationResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__create_database',
        { database, collection },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{ message?: string }>(raw);
      return { success: true, message: data.message };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  dropDatabase: async (con: MongoDBConnection, database: string): Promise<MongoOperationResult> => {
    try {
      const raw = await invokeCapability('mongo__drop_database', { database }, String(con.id));
      const data = parseMongoCapabilityResponse<{ message?: string }>(raw);
      return { success: true, message: data.message };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  createCollection: async (
    con: MongoDBConnection,
    database: string,
    collection: string,
    options?: MongoCreateCollectionOptions,
  ): Promise<MongoOperationResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__create_collection',
        { database, collection, options },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{ message?: string }>(raw);
      return { success: true, message: data.message };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  dropCollection: async (
    con: MongoDBConnection,
    database: string,
    collection: string,
  ): Promise<MongoOperationResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__drop_collection',
        { database, collection },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{ message?: string }>(raw);
      return { success: true, message: data.message };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  serverStatus: async (con: MongoDBConnection): Promise<MongoServerStatusResult> => {
    try {
      const raw = await invokeCapability('mongo__server_status', {}, String(con.id));
      return parseMongoCapabilityResponse<MongoServerStatusResult>(raw);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  replSetStatus: async (con: MongoDBConnection): Promise<MongoReplSetStatusResult> => {
    try {
      const raw = await invokeCapability('mongo__repl_set_status', {}, String(con.id));
      return parseMongoCapabilityResponse<MongoReplSetStatusResult>(raw);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  shardStatus: async (con: MongoDBConnection): Promise<MongoShardStatusResult> => {
    try {
      const raw = await invokeCapability('mongo__shard_status', {}, String(con.id));
      return parseMongoCapabilityResponse<MongoShardStatusResult>(raw);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  findDocuments: async (
    con: MongoDBConnection,
    collection: string,
    filter?: string,
    sort?: string,
    skip?: number,
    limit?: number,
    projection?: string,
  ): Promise<MongoFindDocumentsResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__find',
        {
          collection,
          filter: filter ? jsonify.parse(filter) : {},
          sort: sort ? jsonify.parse(sort) : undefined,
          projection: projection ? jsonify.parse(projection) : undefined,
          skip,
          limit: limit ?? 20,
        },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{
        documents: Record<string, unknown>[];
        count: number;
      }>(raw);
      return { success: true, documents: data.documents, total: data.count };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  countDocuments: async (
    con: MongoDBConnection,
    collection: string,
    filter?: string,
  ): Promise<number> => {
    try {
      const raw = await invokeCapability(
        'mongo__count_documents',
        { collection, filter: filter || null },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{ count: number }>(raw);
      return data.count;
    } catch {
      return -1;
    }
  },

  insertDocument: async (
    con: MongoDBConnection,
    collection: string,
    document: string,
  ): Promise<MongoWriteResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__insert_one',
        { collection, document: jsonify.parse(document) },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{ inserted_id: string }>(raw);
      return { success: true, inserted_id: data.inserted_id };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  updateDocument: async (
    con: MongoDBConnection,
    collection: string,
    id: string,
    document: string,
  ): Promise<MongoWriteResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__update_document',
        { collection, id, document },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{
        matched_count?: number;
        modified_count?: number;
      }>(raw);
      return {
        success: true,
        matched_count: data.matched_count,
        modified_count: data.modified_count,
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  deleteDocument: async (
    con: MongoDBConnection,
    collection: string,
    id: string,
  ): Promise<MongoWriteResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__delete_document',
        { collection, id },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{ deleted_count: number }>(raw);
      return { success: true, deleted_count: data.deleted_count };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  deleteDocuments: async (
    con: MongoDBConnection,
    collection: string,
    filter: string,
  ): Promise<MongoWriteResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__delete_many',
        { collection, filter: jsonify.parse(filter) },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{ deleted_count: number }>(raw);
      return { success: true, deleted_count: data.deleted_count };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  // ==================== Collection Management ====================

  renameCollection: async (
    con: MongoDBConnection,
    database: string,
    fromCollection: string,
    toCollection: string,
  ): Promise<MongoOperationResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__rename_collection',
        { database, collection: fromCollection, to_collection: toCollection },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{ message?: string }>(raw);
      return { success: true, message: data.message };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  cloneCollection: async (
    con: MongoDBConnection,
    database: string,
    sourceCollection: string,
    targetCollection: string,
  ): Promise<MongoCloneCollectionResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__clone_collection',
        { database, source_collection: sourceCollection, target_collection: targetCollection },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{
        documents_copied?: number;
        indexes_copied?: number;
        message?: string;
      }>(raw);
      return {
        success: true,
        documents_copied: data.documents_copied,
        indexes_copied: data.indexes_copied,
        message: data.message,
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  truncateCollection: async (
    con: MongoDBConnection,
    database: string,
    collection: string,
  ): Promise<MongoTruncateCollectionResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__truncate_collection',
        { database, collection },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{ deleted_count?: number; message?: string }>(raw);
      return { success: true, deleted_count: data.deleted_count, message: data.message };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  // ==================== Index Management ====================

  listIndexes: async (
    con: MongoDBConnection,
    database: string,
    collection: string,
  ): Promise<MongoListIndexesResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__list_indexes',
        { database, collection },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{ indexes: MongoIndexInfo[] }>(raw);
      return { success: true, indexes: data.indexes };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  createIndex: async (
    con: MongoDBConnection,
    database: string,
    collection: string,
    keys: Record<string, number | string>,
    options?: MongoCreateIndexOptions,
  ): Promise<MongoCreateIndexResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__create_index',
        {
          database,
          collection,
          keys,
          name: options?.name,
          unique: options?.unique,
          sparse: options?.sparse,
          expire_after_seconds: options?.expire_after_seconds,
        },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{ index_name?: string; message?: string }>(raw);
      return { success: true, index_name: data.index_name, message: data.message };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  dropIndex: async (
    con: MongoDBConnection,
    database: string,
    collection: string,
    indexName: string,
  ): Promise<MongoOperationResult> => {
    try {
      const raw = await invokeCapability(
        'mongo__drop_index',
        { database, collection, index_name: indexName },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{ message?: string }>(raw);
      return { success: true, message: data.message };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  // ==================== Export/Import ====================

  exportDocuments: async (
    config: MongoConnectionConfig,
    collection: string,
    filter?: string,
    sort?: string,
    batchSize?: number,
    skip?: number,
  ): Promise<MongoExportResult> => {
    try {
      return await invoke<MongoExportResult>('mongo_export_documents', {
        config,
        collection,
        filter,
        sort,
        batchSize,
        skip,
      });
    } catch (e) {
      return {
        success: false,
        has_more: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  importDocuments: async (
    config: MongoConnectionConfig,
    collection: string,
    documents: string[],
    upsert?: boolean,
  ): Promise<MongoImportResult> => {
    try {
      return await invoke<MongoImportResult>('mongo_import_documents', {
        config,
        collection,
        documents,
        upsert,
      });
    } catch (e) {
      return {
        success: false,
        inserted: 0,
        updated: 0,
        skipped: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  sampleDocuments: async (
    con: MongoDBConnection,
    collection: string,
    limit?: number,
  ): Promise<Record<string, unknown>[]> => {
    try {
      const raw = await invokeCapability(
        'mongo__sample_documents',
        { collection, limit },
        String(con.id),
      );
      const data = parseMongoCapabilityResponse<{ documents: Record<string, unknown>[] }>(raw);
      return data.documents;
    } catch {
      return [];
    }
  },
};

// ==================== Additional Types ====================

export type MongoCloneCollectionResult = {
  success: boolean;
  documents_copied?: number;
  indexes_copied?: number;
  message?: string;
  error?: string;
};

export type MongoTruncateCollectionResult = {
  success: boolean;
  deleted_count?: number;
  message?: string;
  error?: string;
};

export type MongoIndexInfo = {
  name: string;
  key: Record<string, unknown>;
  unique?: boolean;
  sparse?: boolean;
  ttl_seconds?: number;
  size?: number;
  accesses?: number;
  since?: string;
};

export type MongoListIndexesResult = {
  success: boolean;
  indexes?: MongoIndexInfo[];
  error?: string;
};

export type MongoCreateIndexOptions = {
  name?: string;
  unique?: boolean;
  sparse?: boolean;
  expire_after_seconds?: number;
  partial_filter_expression?: Record<string, unknown>;
};

export type MongoCreateIndexResult = {
  success: boolean;
  index_name?: string;
  message?: string;
  error?: string;
};
