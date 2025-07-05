import { defineStore } from 'pinia';
import { omit, cloneDeep } from 'lodash';
import { DynamoDBConnection, useConnectionStore } from './connectionStore.ts';
import { DynamoIndexOrTableOption } from './tabStore.ts';

const restetedPagination = {
  page: 1,
  pageSize: 5,
  pageCount: 1,
  showSizePicker: true,
  pageSizes: [10, 25, 50, 100, 200, 300],
};

type DynamoInput = {
  index?: string;
  partitionKey?: string;
  sortKey?: string;
  filters?: Array<{ key: string; value: string; operator: string }>;
};

export const useDbDataStore = defineStore('dbDataStore', {
  state: (): {
    dynamoData: {
      connection: DynamoDBConnection;
      columns: Array<{ title: string; key: string }>;
      data: Array<Record<string, unknown>> | undefined;
      pagination: {
        page: number;
        pageSize: number;
        pageCount: number;
        showSizePicker: boolean;
        pageSizes: Array<number>;
      };
      queryInput?: DynamoInput;
      queryBody: string;
      lastEvaluatedKeys: Array<Record<string, any>>;
    };
  } => ({
    dynamoData: {
      connection: {} as DynamoDBConnection,
      columns: [],
      data: undefined,
      pagination: cloneDeep(restetedPagination),
      queryInput: undefined,
      queryBody: '',
      lastEvaluatedKeys: [],
    },
  }),
  persist: true,

  actions: {
    async getDynamoData(connection: DynamoDBConnection, queryInput: DynamoInput): Promise<void> {
      this.dynamoData.connection = connection;

      try {
        const { getDynamoIndexOrTableOption, queryTable } = useConnectionStore();

        const { tableName } = connection;
        const { partitionKey, sortKey } = queryInput;
        const indices = getDynamoIndexOrTableOption(connection);
        const { partitionKeyName, sortKeyName, label, value } = indices.find(
          item => item.label === queryInput.index,
        ) as DynamoIndexOrTableOption;

        const exclusiveStartKey =
          this.dynamoData.lastEvaluatedKeys[this.dynamoData.pagination.page - 1];

        const queryParams = {
          tableName,
          indexName: label.startsWith('Table - ') ? null : (value ?? null),
          partitionKey: { name: partitionKeyName, value: partitionKey },
          sortKey: sortKeyName && sortKey ? { name: sortKeyName, value: sortKey } : undefined,
          filters: queryInput.filters,
          limit: this.dynamoData.pagination.pageSize,
          exclusiveStartKey,
        };

        console.log(`exclusiveStartKey  for index:`, {
          exclusiveStartKey,
          array: this.dynamoData.lastEvaluatedKeys,
          page: this.dynamoData.pagination.page,
          isArr: Array.isArray(this.dynamoData.lastEvaluatedKeys),
        });

        const queryStr = JSON.stringify(omit(queryParams, ['limit', 'exclusiveStartKey']));
        if (this.dynamoData.queryBody !== queryStr) {
          this.dynamoData = {
            ...this.dynamoData,
            columns: [],
            data: undefined,
            pagination: { ...restetedPagination },
            queryBody: queryStr,
            lastEvaluatedKeys: [],
          };
        }

        const data = await queryTable(connection, queryParams);

        const columnsSet = new Set<string>();
        data.items.forEach(item => {
          Object.keys(item).forEach(key => {
            columnsSet.add(key);
          });
        });
        const columnsData = data.items.map(item => {
          const row: Record<string, unknown> = {};
          columnsSet.forEach(key => {
            row[key] = item[key];
          });
          return row;
        });

        this.dynamoData.data = columnsData;
        this.dynamoData.columns = Array.from(columnsSet).map(key => ({ title: key, key }));

        if (data.last_evaluated_key) {
          this.dynamoData.lastEvaluatedKeys[this.dynamoData.pagination.page] =
            data.last_evaluated_key;
          this.dynamoData.pagination.pageCount = this.dynamoData.lastEvaluatedKeys.length;
        }
        this.dynamoData.queryInput = queryInput;
      } catch (error) {
        throw error;
      }
    },

    async changePage(page: number) {
      if (this.dynamoData.pagination.page !== page) {
        this.dynamoData.pagination.page = page;
        await this.getDynamoData(
          this.dynamoData.connection,
          this.dynamoData.queryInput as DynamoInput,
        );
      }
    },

    async changePageSize(pageSize: number) {
      if (this.dynamoData.pagination.pageSize !== pageSize) {
        this.dynamoData.pagination.pageSize = pageSize;
        this.dynamoData.pagination.page = 1;
        this.dynamoData.pagination.pageCount = 1;
        this.dynamoData.lastEvaluatedKeys = [];
        await this.getDynamoData(
          this.dynamoData.connection,
          this.dynamoData.queryInput as DynamoInput,
        );
      }
    },

    resetDynamoData() {
      this.dynamoData = {
        connection: {} as DynamoDBConnection,
        columns: [],
        data: undefined,
        pagination: cloneDeep(restetedPagination),
        queryInput: undefined,
        queryBody: '',
        lastEvaluatedKeys: [],
      };
    },
  },
});
