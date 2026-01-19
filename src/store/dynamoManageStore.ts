import { defineStore } from 'pinia';
import { dynamoApi, DynamoDBTableInfo } from '../datasources';
import { DynamoDBConnection, DatabaseType } from './connectionStore.ts';
import { debug } from '../common';

export const useDynamoManageStore = defineStore('dynamoManageStore', {
  state: (): {
    tableInfo: DynamoDBTableInfo | undefined;
    loading: boolean;
    lastUpdatedTime: number | undefined;
  } => ({
    tableInfo: undefined,
    loading: false,
    lastUpdatedTime: undefined,
  }),
  actions: {
    async fetchTableInfo(connection: DynamoDBConnection) {
      if (connection.type !== DatabaseType.DYNAMODB) {
        throw new Error('Connection must be DynamoDB type');
      }

      this.loading = true;
      try {
        const tableInfo = await dynamoApi.describeTable(connection);
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
    },
  },
});
