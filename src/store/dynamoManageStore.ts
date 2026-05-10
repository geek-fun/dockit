import { defineStore } from 'pinia';
import { dynamoApi, DynamoDBTableInfo } from '../datasources';
import { DynamoDBConnection, DatabaseType } from './connectionStore.ts';
import { debug } from '../common';

export type CreateTableConfig = {
  tableName: string;
  partitionKey: { name: string; type: 'S' | 'N' | 'B' };
  sortKey?: { name: string; type: 'S' | 'N' | 'B' };
  billingMode: 'PAY_PER_REQUEST' | 'PROVISIONED';
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
};

export type TruncateResult = {
  totalItems: number;
  totalScanned: number;
  deletedItems: number;
  unprocessedCount: number;
  errors: Array<{ error: string; message: string }>;
};

export const useDynamoManageStore = defineStore('dynamoManageStore', {
  state: (): {
    tableInfo: DynamoDBTableInfo | undefined;
    loading: boolean;
    lastUpdatedTime: number | undefined;
    manageActiveTable: string;
  } => ({
    tableInfo: undefined,
    loading: false,
    lastUpdatedTime: undefined,
    manageActiveTable: '',
  }),
  actions: {
    setManageActiveTable(tableName: string) {
      this.manageActiveTable = tableName;
    },
    async fetchTableInfo(connection: DynamoDBConnection, tableName: string) {
      if (connection.type !== DatabaseType.DYNAMODB) {
        throw new Error('Connection must be DynamoDB type');
      }

      this.loading = true;
      try {
        const tableInfo = await dynamoApi.describeTable(connection, tableName);
        this.tableInfo = tableInfo;
        this.lastUpdatedTime = Date.now();
      } catch (err) {
        debug(`Error fetching DynamoDB table info: ${err}`);
        throw err;
      } finally {
        this.loading = false;
      }
    },
    clearTableInfo() {
      this.tableInfo = undefined;
      this.lastUpdatedTime = undefined;
      this.manageActiveTable = '';
    },
    async createTable(connection: DynamoDBConnection, config: CreateTableConfig) {
      if (connection.type !== DatabaseType.DYNAMODB) {
        throw new Error('Connection must be DynamoDB type');
      }

      this.loading = true;
      try {
        const result = await dynamoApi.createTable(connection, config);
        return result;
      } catch (err) {
        debug(`Error creating DynamoDB table: ${err}`);
        throw err;
      } finally {
        this.loading = false;
      }
    },
    async deleteTable(connection: DynamoDBConnection, tableName: string) {
      if (connection.type !== DatabaseType.DYNAMODB) {
        throw new Error('Connection must be DynamoDB type');
      }

      this.loading = true;
      try {
        const result = await dynamoApi.deleteTable(connection, tableName);
        this.clearTableInfo();
        return result;
      } catch (err) {
        debug(`Error deleting DynamoDB table: ${err}`);
        throw err;
      } finally {
        this.loading = false;
      }
    },
    async truncateTable(
      connection: DynamoDBConnection,
      tableName: string,
    ): Promise<TruncateResult> {
      if (connection.type !== DatabaseType.DYNAMODB) {
        throw new Error('Connection must be DynamoDB type');
      }

      this.loading = true;
      try {
        const result = await dynamoApi.truncateTable(connection, tableName);
        return result;
      } catch (err) {
        debug(`Error truncating DynamoDB table: ${err}`);
        throw err;
      } finally {
        this.loading = false;
      }
    },
  },
});
