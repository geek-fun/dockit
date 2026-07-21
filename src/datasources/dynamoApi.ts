import { CustomError } from '../common';
import { DynamoDBConnection } from '../store';
import { invoke } from '@tauri-apps/api/core';
import {
  invokeCapability,
  parseCapabilityResponse,
  type ApiResponse,
} from './capabilityInvoker.ts';

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

const dynamoApi = {
  /** Test connection with inline config — does NOT require a saved connection ID. */
  testConnection: async (con: DynamoDBConnection): Promise<DynamoTestResult> => {
    try {
      const raw = await invoke<ApiResponse<{ tableNames?: string[] }>>('dynamo_test_connection', {
        config: con as unknown as Record<string, unknown>,
        sshTunnel: con.sshTunnel ?? null,
      });
      if (raw.status >= 400) {
        return { success: false, message: raw.message ?? 'Connection failed' };
      }
      return { success: true, message: 'Connection successful' };
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  },

  /** List tables via direct SSH-aware command (no saved connection ID needed). */
  listTablesViaSsh: async (con: DynamoDBConnection): Promise<string[]> => {
    try {
      const raw = await invoke<ApiResponse<{ tableNames?: string[] }>>('dynamo_test_connection', {
        config: con as unknown as Record<string, unknown>,
        sshTunnel: con.sshTunnel ?? null,
      });
      if (raw.status >= 400) throw new CustomError(500, raw.message ?? 'Connection failed');
      return raw.data?.tableNames ?? [];
    } catch (e) {
      throw new CustomError(500, e instanceof Error ? e.message : String(e));
    }
  },

  listTables: async (con: DynamoDBConnection): Promise<string[]> => {
    const raw = await invokeCapability('dynamo__list_tables', {}, String(con.id));
    const data = parseCapabilityResponse<{ tableNames?: string[] }>(raw);
    return data.tableNames ?? [];
  },

  describeTable: async (con: DynamoDBConnection, tableName: string): Promise<DynamoDBTableInfo> => {
    const raw = await invokeCapability(
      'dynamo__describe_table',
      { table_name: tableName },
      String(con.id),
    );
    const data = parseCapabilityResponse<RawDynamoDBTableInfo>(raw);
    const { keySchema, attributeDefinitions } = data;

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
    const raw = await invokeCapability(
      'dynamo__query_table',
      {
        table_name: queryParams.tableName,
        index_name:
          queryParams.indexName === queryParams.tableName ? undefined : queryParams.indexName,
        partition_key: queryParams.partitionKey,
        sort_key: queryParams.sortKey,
        filters: queryParams.filters,
        limit: queryParams.limit,
        exclusive_start_key: queryParams.exclusiveStartKey,
      },
      String(con.id),
    );
    return parseCapabilityResponse<QueryResult>(raw);
  },
  scanTable: async (con: DynamoDBConnection, queryParams: QueryParams) => {
    const raw = await invokeCapability(
      'dynamo__scan_table',
      {
        table_name: queryParams.tableName,
        index_name: queryParams.indexName,
        filters: queryParams.filters,
        limit: queryParams.limit,
        exclusive_start_key: queryParams.exclusiveStartKey,
      },
      String(con.id),
    );
    return parseCapabilityResponse<QueryResult>(raw);
  },
  createItem: async (
    con: DynamoDBConnection,
    tableName: string,
    attributes: DynamoAttributeItem[],
    options?: { skipExisting?: boolean; partitionKey?: string },
  ) => {
    const raw = await invokeCapability(
      'dynamo__create_item',
      {
        table_name: tableName,
        attributes,
        skip_existing: options?.skipExisting,
        partition_key: options?.partitionKey,
      },
      String(con.id),
    );
    return parseCapabilityResponse<{ message: string; data: QueryResult }>(raw);
  },

  batchWriteItems: async (
    con: DynamoDBConnection,
    tableName: string,
    items: Array<{ attributes: DynamoAttributeItem[] }>,
    options?: { skipExisting?: boolean; partitionKey?: string },
  ): Promise<BatchWriteResult> => {
    const raw = await invokeCapability(
      'dynamo__batch_write_items',
      {
        table_name: tableName,
        items,
        skip_existing: options?.skipExisting,
        partition_key: options?.partitionKey,
      },
      String(con.id),
    );
    return parseCapabilityResponse<BatchWriteResult>(raw);
  },

  executeStatement: async (
    con: DynamoDBConnection,
    params: PartiQLParams,
  ): Promise<PartiQLResult> => {
    // Route to the correct capability based on statement type
    // Strip SQL comments to avoid misrouting LLM-generated PartiQL with leading annotations
    const cleanStatement = params.statement
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--.*$/gm, '')
      .trim();
    const statement = cleanStatement.toUpperCase();
    const capabilityName = statement.startsWith('SELECT')
      ? 'dynamo__execute_query'
      : statement.startsWith('INSERT') || statement.startsWith('UPDATE')
        ? 'dynamo__execute_write'
        : statement.startsWith('DELETE')
          ? 'dynamo__execute_delete'
          : 'dynamo__execute_query'; // fallback

    const raw = await invokeCapability(
      capabilityName,
      {
        statement: params.statement,
        next_token: params.nextToken ?? null,
        limit: params.limit ?? null,
      },
      String(con.id),
    );
    return parseCapabilityResponse<PartiQLResult>(raw);
  },

  updateItem: async (
    con: DynamoDBConnection,
    tableName: string,
    keys: DynamoAttributeItem[],
    attributes: DynamoAttributeItem[],
  ) => {
    const raw = await invokeCapability(
      'dynamo__update_item',
      {
        table_name: tableName,
        keys,
        attributes,
      },
      String(con.id),
    );
    return parseCapabilityResponse(raw);
  },
  deleteItem: async (con: DynamoDBConnection, tableName: string, keys: DynamoAttributeItem[]) => {
    const raw = await invokeCapability(
      'dynamo__delete_item',
      {
        table_name: tableName,
        keys,
      },
      String(con.id),
    );
    return parseCapabilityResponse(raw);
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
    const raw = await invokeCapability(
      'dynamo__create_gsi',
      {
        table_name: tableName,
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
        warm_throughput:
          indexConfig.warmThroughput &&
          indexConfig.warmThroughput.readUnits > 0 &&
          indexConfig.warmThroughput.writeUnits > 0
            ? {
                read_units_per_second: indexConfig.warmThroughput.readUnits,
                write_units_per_second: indexConfig.warmThroughput.writeUnits,
              }
            : undefined,
      },
      String(con.id),
    );
    return parseCapabilityResponse(raw);
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
    const raw = await invokeCapability(
      'dynamo__update_gsi',
      {
        table_name: tableName,
        index_name: indexConfig.indexName,
        read_capacity_units: indexConfig.readCapacityUnits,
        write_capacity_units: indexConfig.writeCapacityUnits,
      },
      String(con.id),
    );
    return parseCapabilityResponse(raw);
  },

  deleteGlobalSecondaryIndex: async (
    con: DynamoDBConnection,
    tableName: string,
    indexName: string,
  ) => {
    const raw = await invokeCapability(
      'dynamo__delete_gsi',
      {
        table_name: tableName,
        index_name: indexName,
      },
      String(con.id),
    );
    return parseCapabilityResponse(raw);
  },

  // Get Point-in-Time Recovery status
  describeContinuousBackups: async (con: DynamoDBConnection, tableName: string) => {
    const raw = await invokeCapability(
      'dynamo__describe_continuous_backups',
      { table_name: tableName },
      String(con.id),
    );
    return parseCapabilityResponse<{ pitrEnabled: boolean }>(raw);
  },

  // Get Time To Live status
  describeTimeToLive: async (con: DynamoDBConnection, tableName: string) => {
    const raw = await invokeCapability(
      'dynamo__describe_ttl',
      { table_name: tableName },
      String(con.id),
    );
    return parseCapabilityResponse<{ ttlEnabled: boolean; attributeName?: string }>(raw);
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
    const raw = await invokeCapability(
      'dynamo__get_table_metrics',
      {
        table_name: tableName,
        period_hours: periodHours,
      },
      String(con.id),
    );
    return parseCapabilityResponse<{
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
    }>(raw);
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
    const raw = await invokeCapability(
      'dynamo__create_table',
      {
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
      String(con.id),
    );
    return parseCapabilityResponse<{ tableName: string }>(raw);
  },

  deleteTable: async (
    con: DynamoDBConnection,
    tableName: string,
  ): Promise<{ tableName: string }> => {
    const raw = await invokeCapability(
      'dynamo__delete_table',
      { table_name: tableName },
      String(con.id),
    );
    return parseCapabilityResponse<{ tableName: string }>(raw);
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
    const raw = await invokeCapability(
      'dynamo__truncate_table',
      { table_name: tableName },
      String(con.id),
    );
    return parseCapabilityResponse<{
      totalItems: number;
      totalScanned: number;
      deletedItems: number;
      unprocessedCount: number;
      errors: Array<{ error: string; message: string }>;
    }>(raw);
  },

  updateTableConfig: async (
    con: DynamoDBConnection,
    tableName: string,
    config: {
      billingMode?: 'PAY_PER_REQUEST' | 'PROVISIONED';
      readCapacity?: number;
      writeCapacity?: number;
      tableClass?: 'STANDARD' | 'STANDARD_INFREQUENT_ACCESS';
    },
  ): Promise<{ tableName: string }> => {
    const raw = await invokeCapability(
      'dynamo__update_table_config',
      {
        table_name: tableName,
        billing_mode: config.billingMode,
        read_capacity_units: config.readCapacity,
        write_capacity_units: config.writeCapacity,
        table_class: config.tableClass,
      },
      String(con.id),
    );
    return parseCapabilityResponse<{ tableName: string }>(raw);
  },

  updateTimeToLive: async (
    con: DynamoDBConnection,
    tableName: string,
    config: {
      enabled: boolean;
      attributeName?: string;
    },
  ): Promise<{ tableName: string; enabled: boolean; attributeName?: string }> => {
    const raw = await invokeCapability(
      'dynamo__update_ttl',
      {
        table_name: tableName,
        enabled: config.enabled,
        attribute_name: config.attributeName,
      },
      String(con.id),
    );
    return parseCapabilityResponse<{
      tableName: string;
      enabled: boolean;
      attributeName?: string;
    }>(raw);
  },

  updateContinuousBackups: async (
    con: DynamoDBConnection,
    tableName: string,
    enabled: boolean,
  ): Promise<{ tableName: string; enabled: boolean }> => {
    const raw = await invokeCapability(
      'dynamo__update_pitr',
      {
        table_name: tableName,
        enabled,
      },
      String(con.id),
    );
    return parseCapabilityResponse<{ tableName: string; enabled: boolean }>(raw);
  },

  updateStreams: async (
    con: DynamoDBConnection,
    tableName: string,
    config: {
      enabled: boolean;
      streamViewType?: 'KEYS_ONLY' | 'NEW_IMAGE' | 'OLD_IMAGE' | 'NEW_AND_OLD_IMAGES';
    },
  ): Promise<{ tableName: string; streamEnabled: boolean; streamViewType?: string }> => {
    const raw = await invokeCapability(
      'dynamo__update_streams',
      {
        table_name: tableName,
        enabled: config.enabled,
        stream_view_type: config.streamViewType,
      },
      String(con.id),
    );
    return parseCapabilityResponse<{
      tableName: string;
      streamEnabled: boolean;
      streamViewType?: string;
    }>(raw);
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

export type DynamoTestResult = {
  success: boolean;
  message: string;
};

export { dynamoApi };
