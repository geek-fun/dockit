import { DynamoDBConnection, type DynamoDBAuth } from '../store';
import { tauriClient, type AwsAuthPayload, type AwsCredentials } from './ApiClients.ts';
import { CustomError } from '../common';
import { invoke } from '@tauri-apps/api/core';

export type KeySchema = {
  attributeName: string;
  keyType: string; // Values like "HASH" or "RANGE"
};

export type AttributeDefinition = {
  attributeName: string;
  attributeType: string; // Values like "S", "N", "B", etc.
};

// Shared type for DynamoDB attribute items used in create/update/delete operations
export type DynamoAttributeItem = {
  key: string;
  value: string | number | boolean | null;
  type: string;
};

export enum DynamoIndexType {
  GSI = 'GSI',
  LSI = 'LSI',
}

export type DynamoIndex = {
  type: DynamoIndexType;
  name: string;
  status?: string;
  itemCount?: number;
  sizeBytes?: number;
  keySchema: KeySchema[];
  projection?: {
    projectionType?: string;
    nonKeyAttributes?: string[];
  };
  provisionedThroughput?: {
    readCapacityUnits?: number;
    writeCapacityUnits?: number;
  };
};

// Main table info type
export type RawDynamoDBTableInfo = {
  id: string;
  name: string;
  status: string;
  itemCount: number;
  sizeBytes: number;
  billingMode?: string;
  keySchema: KeySchema[]; // Based on connection store usage
  attributeDefinitions: AttributeDefinition[];
  indices: DynamoIndex[];
  creationDateTime: string;
  streamSpecification?: {
    streamEnabled?: boolean;
    streamViewType?: string;
  };
  sseDescription?: {
    status?: string;
    sseType?: string;
    kmsMasterKeyArn?: string;
  };
  tableClassSummary?: string;
  warmThroughput?: {
    readUnitsPerSecond?: number;
    writeUnitsPerSecond?: number;
  };
};

export type DynamoDBTableInfo = {
  id: string;
  name: string;
  status: string;
  itemCount: number;
  sizeBytes: number;
  billingMode?: string;
  partitionKey: {
    name: string;
    type: string;
    valueType: string;
  };
  sortKey?: {
    name: string;
    type: string;
    valueType: string;
  };
  keySchema: KeySchema[];
  attributeDefinitions: AttributeDefinition[];
  indices?: DynamoIndex[];
  creationDateTime?: string;
  streamSpecification?: {
    streamEnabled?: boolean;
    streamViewType?: string;
  };
  sseDescription?: {
    status?: string;
    sseType?: string;
    kmsMasterKeyArn?: string;
  };
  tableClassSummary?: string;
  warmThroughput?: {
    readUnitsPerSecond?: number;
    writeUnitsPerSecond?: number;
  };
  provisionedThroughput?: {
    readCapacityUnits?: number;
    writeCapacityUnits?: number;
  };
};

export type QueryParams = {
  tableName: string;
  indexName: string | null;
  partitionKey: {
    name: string;
    value: string | null | undefined;
  };
  sortKey?: {
    name: string;
    value: string;
  };
  filters?: Array<{
    key: string;
    operator: string;
    value: string;
  }>;
  limit?: number; // Optional limit for the number of items to return
  exclusiveStartKey?: Record<string, unknown> | null; // For pagination
};

export type QueryResult = {
  items: Record<string, any>[]; // Dynamic items from DynamoDB
  count: number; // Number of items returned
  scanned_count: number; // Number of items scanned
  last_evaluated_key: Record<string, any> | null; // Pagination token
};

export type PartiQLResult = {
  items: Record<string, unknown>[]; // Dynamic items from DynamoDB
  count: number; // Number of items returned
  next_token: string | null; // Pagination token for PartiQL
};

export type PartiQLParams = {
  statement: string;
  nextToken?: string | null;
  limit?: number;
};

export type BatchWriteResult = {
  inserted: number;
  skipped: number;
  errorCount: number;
  errors: Array<{ error: string; message?: string; details?: string }>;
  unprocessedItems: Array<{ attributes: Record<string, unknown> }>;
  unprocessedCount: number;
};

const buildDynamoCredentials = (con: DynamoDBConnection): AwsCredentials => ({
  region: con.region,
  endpoint_url: con.endpointUrl || null,
  auth: buildAuthPayload(con.auth),
});

const buildAuthPayload = (auth: DynamoDBAuth): AwsAuthPayload => {
  switch (auth.kind) {
    case 'accessKey':
      return {
        kind: 'accessKey',
        access_key_id: auth.accessKeyId,
        secret_access_key: auth.secretAccessKey,
      };
    case 'profile':
      return { kind: 'profile', profile_name: auth.profileName };
    case 'sso':
      return {
        kind: 'sso',
        access_key_id: auth.accessKeyId,
        secret_access_key: auth.secretAccessKey,
        session_token: auth.sessionToken,
        region: auth.region,
      };
    case 'assumeRole':
      return {
        kind: 'assumeRole',
        access_key_id: auth.accessKeyId,
        secret_access_key: auth.secretAccessKey,
        session_token: auth.sessionToken,
        region: auth.region,
      };
  }
};

const dynamoApi = {
  listTables: async (con: DynamoDBConnection): Promise<string[]> => {
    const apiCredentials = buildDynamoCredentials(con);
    const options = {
      table_name: '',
      operation: 'LIST_TABLES',
      payload: {},
    };
    const result = await tauriClient.invokeDynamoApi(apiCredentials, options);
    const { status, message, data } = result;
    if (status !== 200) {
      throw new CustomError(status, message);
    }
    return ((data as { tableNames?: string[] })?.tableNames ?? []) as string[];
  },

  describeTable: async (con: DynamoDBConnection, tableName: string): Promise<DynamoDBTableInfo> => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'DESCRIBE_TABLE',
      payload: {},
    };
    const result = await tauriClient.invokeDynamoApi(credentials, options);
    const { status, message, data } = result;
    if (status !== 200) {
      throw new CustomError(status, message);
    }
    const { keySchema, attributeDefinitions } = data as RawDynamoDBTableInfo;

    const pkName = keySchema.find(({ keyType }) => keyType.toUpperCase() === 'HASH')?.attributeName;
    const pkValueType = attributeDefinitions.find(
      ({ attributeName }) => attributeName === pkName,
    )?.attributeType;

    const skName = keySchema.find(
      ({ keyType }) => keyType.toUpperCase() === 'RANGE',
    )?.attributeName;
    const skValueType = attributeDefinitions.find(
      ({ attributeName }) => attributeName === skName,
    )?.attributeType;

    const partitionKey = { name: pkName, valueType: pkValueType, type: 'HASH' };

    const sortKey = { name: skName, valueType: skValueType, type: 'RANGE' };

    return { ...data, partitionKey, sortKey } as DynamoDBTableInfo;
  },

  queryTable: async (con: DynamoDBConnection, queryParams: QueryParams): Promise<QueryResult> => {
    const credentials = buildDynamoCredentials(con);

    const options = {
      table_name: queryParams.tableName,
      operation: 'QUERY_TABLE',
      payload: {
        index_name:
          queryParams.indexName === queryParams.tableName ? undefined : queryParams.indexName,
        partition_key: queryParams.partitionKey,
        sort_key: queryParams.sortKey,
        filters: queryParams.filters,
        limit: queryParams.limit,
        exclusive_start_key: queryParams.exclusiveStartKey,
      },
    };

    const result = await tauriClient.invokeDynamoApi(credentials, options);
    const { status, message, data } = result;

    if (status !== 200) {
      throw new CustomError(status, message);
    }

    return data as QueryResult;
  },
  scanTable: async (con: DynamoDBConnection, queryParams: QueryParams) => {
    const credentials = buildDynamoCredentials(con);

    const options = {
      table_name: queryParams.tableName,
      operation: 'SCAN_TABLE',
      payload: {
        filters: queryParams.filters,
        index_name: queryParams.indexName,
        limit: queryParams.limit,
        exclusive_start_key: queryParams.exclusiveStartKey,
      },
    };

    const result = await tauriClient.invokeDynamoApi(credentials, options);
    const { status, message, data } = result;

    if (status !== 200) {
      throw new CustomError(status, message);
    }

    return data as QueryResult;
  },
  createItem: async (
    con: DynamoDBConnection,
    tableName: string,
    attributes: DynamoAttributeItem[],
    options?: { skipExisting?: boolean; partitionKey?: string },
  ) => {
    const credentials = buildDynamoCredentials(con);
    const apiOptions = {
      table_name: tableName,
      operation: 'CREATE_ITEM',
      payload: {
        attributes,
        skipExisting: options?.skipExisting,
        partitionKey: options?.partitionKey,
      },
    };

    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, apiOptions);

    if (status !== 200) {
      throw new CustomError(status, message);
    }
    return { message, data } as { message: string; data: QueryResult };
  },

  batchWriteItems: async (
    con: DynamoDBConnection,
    tableName: string,
    items: Array<{ attributes: DynamoAttributeItem[] }>,
    options?: { skipExisting?: boolean; partitionKey?: string },
  ): Promise<BatchWriteResult> => {
    const credentials = buildDynamoCredentials(con);
    const apiOptions = {
      table_name: tableName,
      operation: 'BATCH_WRITE_ITEM',
      payload: {
        items,
        skipExisting: options?.skipExisting,
        partitionKey: options?.partitionKey,
      },
    };

    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, apiOptions);

    if (status !== 200) {
      throw new CustomError(status, message);
    }

    return data as BatchWriteResult;
  },

  executeStatement: async (
    con: DynamoDBConnection,
    tableName: string,
    params: PartiQLParams,
  ): Promise<PartiQLResult> => {
    const credentials = buildDynamoCredentials(con);

    const options = {
      table_name: tableName,
      operation: 'EXECUTE_STATEMENT',
      payload: {
        statement: params.statement,
        next_token: params.nextToken,
        limit: params.limit,
      },
    };

    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);

    if (status !== 200) {
      throw new CustomError(status, message);
    }

    return data as PartiQLResult;
  },

  updateItem: async (
    con: DynamoDBConnection,
    tableName: string,
    keys: DynamoAttributeItem[],
    attributes: DynamoAttributeItem[],
  ) => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'UPDATE_ITEM',
      payload: { keys, attributes },
    };

    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);

    if (status !== 200) {
      throw new CustomError(status, message);
    }
    return data;
  },
  deleteItem: async (con: DynamoDBConnection, tableName: string, keys: DynamoAttributeItem[]) => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'DELETE_ITEM',
      payload: { keys },
    };

    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);

    if (status !== 200) {
      throw new CustomError(status, message);
    }
    return data;
  },

  // GSI Management Operations
  createGlobalSecondaryIndex: async (
    con: DynamoDBConnection,
    tableName: string,
    indexConfig: {
      indexName: string;
      keySchema: Array<{
        attributeName: string;
        keyType: 'HASH' | 'RANGE';
        attributeType: string;
      }>;
      projectionType: string;
      projectedAttributes?: string[];
      readCapacityUnits?: number;
      writeCapacityUnits?: number;
      warmThroughput?: {
        readUnits: number;
        writeUnits: number;
      };
    },
  ) => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'CREATE_GLOBAL_SECONDARY_INDEX',
      payload: {
        index_name: indexConfig.indexName,
        key_schema: indexConfig.keySchema.map(key => ({
          attribute_name: key.attributeName,
          key_type: key.keyType,
          attribute_type: key.attributeType,
        })),
        projection_type: indexConfig.projectionType,
        projected_attributes: indexConfig.projectedAttributes,
        read_capacity_units: indexConfig.readCapacityUnits,
        write_capacity_units: indexConfig.writeCapacityUnits,
        warm_throughput: indexConfig.warmThroughput
          ? {
              read_units_per_second: indexConfig.warmThroughput.readUnits,
              write_units_per_second: indexConfig.warmThroughput.writeUnits,
            }
          : undefined,
      },
    };

    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);

    if (status !== 200) {
      throw new CustomError(status, message);
    }
    return data;
  },

  updateGlobalSecondaryIndex: async (
    con: DynamoDBConnection,
    tableName: string,
    indexConfig: {
      indexName: string;
      readCapacityUnits: number;
      writeCapacityUnits: number;
    },
  ) => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'UPDATE_GLOBAL_SECONDARY_INDEX',
      payload: {
        index_name: indexConfig.indexName,
        read_capacity_units: indexConfig.readCapacityUnits,
        write_capacity_units: indexConfig.writeCapacityUnits,
      },
    };

    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);

    if (status !== 200) {
      throw new CustomError(status, message);
    }
    return data;
  },

  deleteGlobalSecondaryIndex: async (
    con: DynamoDBConnection,
    tableName: string,
    indexName: string,
  ) => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'DELETE_GLOBAL_SECONDARY_INDEX',
      payload: {
        index_name: indexName,
      },
    };

    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);

    if (status !== 200) {
      throw new CustomError(status, message);
    }
    return data;
  },

  // Get Point-in-Time Recovery status
  describeContinuousBackups: async (con: DynamoDBConnection, tableName: string) => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'DESCRIBE_CONTINUOUS_BACKUPS',
      payload: {},
    };

    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);

    if (status !== 200) {
      throw new CustomError(status, message);
    }
    return data as { pitrEnabled: boolean };
  },

  // Get Time To Live status
  describeTimeToLive: async (con: DynamoDBConnection, tableName: string) => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'DESCRIBE_TIME_TO_LIVE',
      payload: {},
    };

    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);

    if (status !== 200) {
      throw new CustomError(status, message);
    }
    return data as { ttlEnabled: boolean; attributeName?: string };
  },

  // CloudWatch Metrics
  getTableMetrics: async (
    con: DynamoDBConnection,
    tableName: string,
    periodHours: number = 24,
  ): Promise<{
    available: boolean;
    message?: string;
    metrics?: {
      consumedRead: number[];
      consumedWrite: number[];
      timestamps: string[];
      provisionedReadCapacity: number;
      provisionedWriteCapacity: number;
      rcuUtilization: number;
      wcuUtilization: number;
      throttledReadRequests: number;
      throttledWriteRequests: number;
      totalThrottledEvents: number;
    };
  }> => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'GET_TABLE_METRICS',
      payload: {
        period_hours: periodHours,
      },
    };

    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);

    if (status !== 200) {
      throw new CustomError(status, message);
    }
    return data as {
      available: boolean;
      message?: string;
      metrics?: {
        consumedRead: number[];
        consumedWrite: number[];
        timestamps: string[];
        provisionedReadCapacity: number;
        provisionedWriteCapacity: number;
        rcuUtilization: number;
        wcuUtilization: number;
        throttledReadRequests: number;
        throttledWriteRequests: number;
        totalThrottledEvents: number;
      };
    };
  },

  createTable: async (
    con: DynamoDBConnection,
    config: {
      tableName: string;
      tableClass?: 'STANDARD' | 'STANDARD_INFREQUENT_ACCESS';
      partitionKey: { name: string; type: 'S' | 'N' | 'B' };
      sortKey?: { name: string; type: 'S' | 'N' | 'B' };
      billingMode: 'PAY_PER_REQUEST' | 'PROVISIONED';
      deletionProtection?: boolean;
      readCapacity?: number;
      writeCapacity?: number;
      globalSecondaryIndexes?: Array<{
        indexName: string;
        keySchema: Array<{
          attributeName: string;
          keyType: 'HASH' | 'RANGE';
          attributeType: 'S' | 'N' | 'B';
        }>;
        projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
        nonKeyAttributes?: string[];
        readCapacityUnits?: number;
        writeCapacityUnits?: number;
      }>;
      localSecondaryIndexes?: Array<{
        indexName: string;
        keySchema: Array<{
          attributeName: string;
          keyType: 'HASH' | 'RANGE';
          attributeType: 'S' | 'N' | 'B';
        }>;
        projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
        nonKeyAttributes?: string[];
      }>;
      streamSpecification?: {
        streamEnabled: boolean;
        streamViewType?: 'KEYS_ONLY' | 'NEW_IMAGE' | 'OLD_IMAGE' | 'NEW_AND_OLD_IMAGES';
      };
      sseSpecification?: {
        enabled: boolean;
        sseType?: 'AES256' | 'KMS';
        kmsMasterKeyId?: string;
      };
      tags?: Array<{ key: string; value: string }>;
    },
  ): Promise<{ tableName: string }> => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: config.tableName,
      operation: 'CREATE_TABLE',
      payload: {
        table_name: config.tableName,
        table_class: config.tableClass,
        partition_key: config.partitionKey.name,
        partition_key_type: config.partitionKey.type,
        sort_key: config.sortKey?.name,
        sort_key_type: config.sortKey?.type,
        billing_mode: config.billingMode,
        deletion_protection_enabled: config.deletionProtection,
        read_capacity_units: config.readCapacity,
        write_capacity_units: config.writeCapacity,
        global_secondary_indexes: config.globalSecondaryIndexes?.map(gsi => ({
          index_name: gsi.indexName,
          key_schema: gsi.keySchema.map(k => ({
            attribute_name: k.attributeName,
            key_type: k.keyType,
            attribute_type: k.attributeType,
          })),
          projection_type: gsi.projectionType,
          non_key_attributes: gsi.nonKeyAttributes,
          read_capacity_units: gsi.readCapacityUnits,
          write_capacity_units: gsi.writeCapacityUnits,
        })),
        local_secondary_indexes: config.localSecondaryIndexes?.map(lsi => ({
          index_name: lsi.indexName,
          key_schema: lsi.keySchema.map(k => ({
            attribute_name: k.attributeName,
            key_type: k.keyType,
            attribute_type: k.attributeType,
          })),
          projection_type: lsi.projectionType,
          non_key_attributes: lsi.nonKeyAttributes,
        })),
        stream_specification: config.streamSpecification,
        sse_specification: config.sseSpecification,
        tags: config.tags,
      },
    };
    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);
    if (status >= 400) throw new CustomError(status, message);
    return data as { tableName: string };
  },

  deleteTable: async (
    con: DynamoDBConnection,
    tableName: string,
  ): Promise<{ tableName: string }> => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'DELETE_TABLE',
      payload: {},
    };
    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);
    if (status >= 400) throw new CustomError(status, message);
    return data as { tableName: string };
  },

  truncateTable: async (
    con: DynamoDBConnection,
    tableName: string,
  ): Promise<{
    totalItems: number;
    totalScanned: number;
    deletedItems: number;
    unprocessedCount: number;
    errors: Array<{ error: string; message: string }>;
  }> => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'TRUNCATE_TABLE',
      payload: {},
    };
    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);
    if (status >= 400) throw new CustomError(status, message);
    return data as {
      totalItems: number;
      totalScanned: number;
      deletedItems: number;
      unprocessedCount: number;
      errors: Array<{ error: string; message: string }>;
    };
  },

  updateTableConfig: async (
    con: DynamoDBConnection,
    tableName: string,
    config: {
      billingMode?: 'PAY_PER_REQUEST' | 'PROVISIONED';
      readCapacity?: number;
      writeCapacity?: number;
    },
  ): Promise<{ tableName: string }> => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'UPDATE_TABLE_CONFIG',
      payload: {
        billing_mode: config.billingMode,
        read_capacity_units: config.readCapacity,
        write_capacity_units: config.writeCapacity,
      },
    };
    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);
    if (status >= 400) throw new CustomError(status, message);
    return data as { tableName: string };
  },

  updateTimeToLive: async (
    con: DynamoDBConnection,
    tableName: string,
    config: {
      enabled: boolean;
      attributeName?: string;
    },
  ): Promise<{ tableName: string; enabled: boolean; attributeName?: string }> => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'UPDATE_TTL',
      payload: {
        enabled: config.enabled,
        attribute_name: config.attributeName,
      },
    };
    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);
    if (status >= 400) throw new CustomError(status, message);
    return data as { tableName: string; enabled: boolean; attributeName?: string };
  },

  updateContinuousBackups: async (
    con: DynamoDBConnection,
    tableName: string,
    enabled: boolean,
  ): Promise<{ tableName: string; enabled: boolean }> => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'UPDATE_PITR',
      payload: {
        enabled,
      },
    };
    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);
    if (status >= 400) throw new CustomError(status, message);
    return data as { tableName: string; enabled: boolean };
  },

  updateStreams: async (
    con: DynamoDBConnection,
    tableName: string,
    config: {
      enabled: boolean;
      streamViewType?: 'KEYS_ONLY' | 'NEW_IMAGE' | 'OLD_IMAGE' | 'NEW_AND_OLD_IMAGES';
    },
  ): Promise<{ tableName: string; streamEnabled: boolean; streamViewType?: string }> => {
    const credentials = buildDynamoCredentials(con);
    const options = {
      table_name: tableName,
      operation: 'UPDATE_STREAMS',
      payload: {
        enabled: config.enabled,
        stream_view_type: config.streamViewType,
      },
    };
    const { status, message, data } = await tauriClient.invokeDynamoApi(credentials, options);
    if (status >= 400) throw new CustomError(status, message);
    return data as { tableName: string; streamEnabled: boolean; streamViewType?: string };
  },

  listProfiles: async (): Promise<string[]> => {
    try {
      return await invoke<string[]>('aws_list_profiles');
    } catch {
      return [];
    }
  },

  // SSO device authorization — start the flow, get device code + URL
  ssoStartDeviceAuth: async (
    startUrl: string,
    ssoRegion: string,
  ): Promise<{
    verificationUri: string;
    userCode: string;
    deviceCode: string;
    clientId: string;
    clientSecret: string;
    interval: number;
  }> => {
    return await invoke<{
      verificationUri: string;
      userCode: string;
      deviceCode: string;
      clientId: string;
      clientSecret: string;
      interval: number;
    }>('aws_sso_start_device_auth', {
      startUrl,
      ssoRegion,
    });
  },

  // SSO poll for token after user authenticates in browser
  ssoPollToken: async (
    ssoRegion: string,
    clientId: string,
    clientSecret: string,
    deviceCode: string,
  ): Promise<{
    accessToken: string | null;
    expiresAt: number | null;
    status: 'pending' | 'success' | 'error';
    errorMessage: string | null;
  }> => {
    const result = await invoke<{
      accessToken: string | null;
      expiresAt: number | null;
      status: string;
      errorMessage: string | null;
    }>('aws_sso_poll_token', {
      ssoRegion,
      clientId,
      clientSecret,
      deviceCode,
    });
    return {
      ...result,
      status: result.status as 'pending' | 'success' | 'error',
    };
  },

  // SSO get role credentials after token is obtained
  ssoGetRoleCredentials: async (
    ssoRegion: string,
    accessToken: string,
    accountId: string,
    roleName: string,
  ): Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expirationTimestamp: number;
  }> => {
    return await invoke<{
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken: string;
      expirationTimestamp: number;
    }>('aws_sso_get_role_credentials', {
      ssoRegion,
      accessToken,
      accountId,
      roleName,
    });
  },

  assumeRole: async (
    sourceProfileName: string,
    roleArn: string,
    externalId?: string,
    mfaSerial?: string,
    mfaToken?: string,
  ): Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expirationTimestamp: number;
  }> => {
    return await invoke<{
      accessKeyId: string;
      secretAccessKey: string;
      sessionToken: string;
      expirationTimestamp: number;
    }>('aws_assume_role', {
      sourceProfileName,
      roleArn,
      externalId: externalId ?? null,
      mfaSerial: mfaSerial ?? null,
      mfaToken: mfaToken ?? null,
    });
  },

  ssoListAccounts: async (
    ssoRegion: string,
    accessToken: string,
  ): Promise<{ accountId: string; accountName: string; emailAddress: string | null }[]> => {
    return await invoke('aws_sso_list_accounts', { ssoRegion, accessToken });
  },

  ssoListRoles: async (
    ssoRegion: string,
    accessToken: string,
    accountId: string,
  ): Promise<{ roleName: string; accountId: string }[]> => {
    return await invoke('aws_sso_list_roles', { ssoRegion, accessToken, accountId });
  },

  listProfilesWithRoles: async (): Promise<
    {
      profileName: string;
      roleArn: string | null;
      sourceProfile: string | null;
      region: string | null;
    }[]
  > => {
    return await invoke('aws_list_profiles_with_roles');
  },
};

export { dynamoApi };
