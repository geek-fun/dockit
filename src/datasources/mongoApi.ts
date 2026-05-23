import { invoke } from '@tauri-apps/api/core';
import type { MongoDBConnection } from '../store';

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
    time_field: string;
    meta_field?: string;
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
    const config = buildConfig(con);
    try {
      return await invoke<MongoListDatabasesResult>('mongo_list_databases', { config });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  listCollections: async (
    con: MongoDBConnection,
    database: string,
  ): Promise<MongoListCollectionsResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoListCollectionsResult>('mongo_list_collections', {
        config,
        database,
      });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  collectionStats: async (
    con: MongoDBConnection,
    database: string,
    collection: string,
  ): Promise<MongoCollectionStatsResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoCollectionStatsResult>('mongo_collection_stats', {
        config,
        database,
        collection,
      });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  databaseStats: async (
    con: MongoDBConnection,
    database: string,
  ): Promise<MongoDatabaseStatsResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoDatabaseStatsResult>('mongo_database_stats', { config, database });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  createDatabase: async (
    con: MongoDBConnection,
    database: string,
    collection: string,
  ): Promise<MongoOperationResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoOperationResult>('mongo_create_database', {
        config,
        database,
        collection,
      });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  dropDatabase: async (con: MongoDBConnection, database: string): Promise<MongoOperationResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoOperationResult>('mongo_drop_database', { config, database });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  createCollection: async (
    con: MongoDBConnection,
    database: string,
    collection: string,
    options?: MongoCreateCollectionOptions,
  ): Promise<MongoOperationResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoOperationResult>('mongo_create_collection', {
        config,
        database,
        collection,
        options,
      });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  dropCollection: async (
    con: MongoDBConnection,
    database: string,
    collection: string,
  ): Promise<MongoOperationResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoOperationResult>('mongo_drop_collection', {
        config,
        database,
        collection,
      });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  serverStatus: async (con: MongoDBConnection): Promise<MongoServerStatusResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoServerStatusResult>('mongo_server_status', { config });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  replSetStatus: async (con: MongoDBConnection): Promise<MongoReplSetStatusResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoReplSetStatusResult>('mongo_repl_set_status', { config });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  shardStatus: async (con: MongoDBConnection): Promise<MongoShardStatusResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoShardStatusResult>('mongo_shard_status', { config });
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  findDocuments: async (
    con: MongoDBConnection,
    collection: string,
    filter?: string,
    sort?: string,
    skip?: number,
    limit?: number,
  ): Promise<MongoFindDocumentsResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoFindDocumentsResult>('mongo_find_documents', {
        config,
        collection,
        filter,
        sort,
        skip,
        limit,
      });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  countDocuments: async (
    con: MongoDBConnection,
    collection: string,
    filter?: string,
  ): Promise<number> => {
    const config = buildConfig(con);
    try {
      return await invoke<number>('mongo_count_documents', { config, collection, filter });
    } catch {
      return -1;
    }
  },

  insertDocument: async (
    con: MongoDBConnection,
    collection: string,
    document: string,
  ): Promise<MongoWriteResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoWriteResult>('mongo_insert_document', {
        config,
        collection,
        document,
      });
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
    const config = buildConfig(con);
    try {
      return await invoke<MongoWriteResult>('mongo_update_document', {
        config,
        collection,
        id,
        document,
      });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  deleteDocument: async (
    con: MongoDBConnection,
    collection: string,
    id: string,
  ): Promise<MongoWriteResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoWriteResult>('mongo_delete_document', { config, collection, id });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  deleteDocuments: async (
    con: MongoDBConnection,
    collection: string,
    filter: string,
  ): Promise<MongoWriteResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoWriteResult>('mongo_delete_documents', {
        config,
        collection,
        filter,
      });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
