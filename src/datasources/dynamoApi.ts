import { DynamoDBConnection } from '../store';
import { tauriClient } from './ApiClients.ts';
import { CustomError } from '../common';

export type KeySchema = {
  attributeName: string;
  keyType: string; // Values like "HASH" or "RANGE"
};

export type AttributeDefinition = {
  attributeName: string;
  attributeType: string; // Values like "S", "N", "B", etc.
};

export enum DynamoIndexType {
  GSI = 'GSI',
  LSI = 'LSI',
}

export type DynamoIndex = {
  type: DynamoIndexType.GSI;
  name: string;
  status?: string;
  keySchema: KeySchema[];
  provisionedThroughput?: {
    readCapacityUnits?: number;
    writeCapacityUnits?: number;
  };
};

// Main table info type
export type DynamoDBTableInfo = {
  id: string;
  name: string;
  status: string;
  itemCount: number;
  sizeBytes: number;
  keySchema: KeySchema[]; // Based on connection store usage
  attributeDefinitions?: AttributeDefinition[];
  indices?: DynamoIndex[];
  creationDateTime?: string;
};

export type QueryParams = {
  tableName: string;
  indexName: string;
  partitionKey: {
    name: string;
    value: string;
  };
  sortKey?: {
    name: string;
    value: string;
  };
  filters: Array<{
    key: string;
    operator: string;
    value: string;
  }>;
};

export type QueryResult = {
  items: Record<string, any>[]; // Dynamic items from DynamoDB
  count: number; // Number of items returned
  scanned_count: number; // Number of items scanned
  last_evaluated_key: Record<string, any> | null; // Pagination token
};

const dynamoApi = {
  describeTable: async ({
    region,
    accessKeyId,
    secretAccessKey,
    tableName,
  }: DynamoDBConnection): Promise<DynamoDBTableInfo> => {
    const credentials = { region, access_key_id: accessKeyId, secret_access_key: secretAccessKey };
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
    return data as DynamoDBTableInfo;
  },
  queryTable: async (con: DynamoDBConnection, queryParams: QueryParams): Promise<QueryResult> => {
    const credentials = {
      region: con.region,
      access_key_id: con.accessKeyId,
      secret_access_key: con.secretAccessKey,
    };

    const options = {
      table_name: queryParams.tableName,
      operation: 'QUERY_TABLE',
      payload: {
        index_name:
          queryParams.indexName === queryParams.tableName ? undefined : queryParams.indexName,
        partition_key: queryParams.partitionKey,
        sort_key: queryParams.sortKey,
        filters: queryParams.filters,
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
    const credentials = {
      region: con.region,
      access_key_id: con.accessKeyId,
      secret_access_key: con.secretAccessKey,
    };

    const options = {
      table_name: queryParams.tableName,
      operation: 'SCAN_TABLE',
      payload: { filters: queryParams.filters },
    };

    const result = await tauriClient.invokeDynamoApi(credentials, options);
    const { status, message, data } = result;

    if (status !== 200) {
      throw new CustomError(status, message);
    }

    return data as QueryResult;
  },
};

export { dynamoApi };
