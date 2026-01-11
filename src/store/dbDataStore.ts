import { defineStore } from 'pinia';
import { cloneDeep, omit } from 'lodash';
import { DynamoDBConnection, useConnectionStore } from './connectionStore.ts';
import { DynamoIndexOrTableOption } from './tabStore.ts';

const resetPagination = {
  page: 1,
  pageSize: 10,
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

type DynamoColumn = {
  title: string;
  key: string;
  children?: Array<{ title: string; key: string }>;
};

export const useDbDataStore = defineStore('dbDataStore', {
  state: (): {
    dynamoData: {
      connection: DynamoDBConnection;
      columns: Array<DynamoColumn>;
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
    partiqlData: {
      showResultPanel: boolean;
      errorMessage: string | null;
      queryResult: {
        items: Array<Record<string, unknown>>;
        count: number;
        next_token: string | null;
      } | null;
      currentNextToken: string | null;
      lastExecutedStatement: string | null;
    };
  } => ({
    dynamoData: {
      connection: {} as DynamoDBConnection,
      columns: [],
      data: undefined,
      pagination: cloneDeep(resetPagination),
      queryInput: undefined,
      queryBody: '',
      lastEvaluatedKeys: [],
    },
    partiqlData: {
      showResultPanel: false,
      errorMessage: null,
      queryResult: null,
      currentNextToken: null,
      lastExecutedStatement: null,
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

        const queryParams = {
          tableName,
          indexName: label.startsWith('Table - ') ? null : (value ?? null),
          partitionKey: { name: partitionKeyName, value: partitionKey },
          sortKey: sortKeyName && sortKey ? { name: sortKeyName, value: sortKey } : undefined,
          filters: queryInput.filters,
        };

        const queryStr = JSON.stringify(omit(queryParams, ['limit', 'exclusiveStartKey']));

        if (this.dynamoData.queryBody !== queryStr) {
          this.dynamoData = {
            ...this.dynamoData,
            columns: [],
            data: undefined,
            pagination: { ...cloneDeep(resetPagination) },
            queryBody: queryStr,
            lastEvaluatedKeys: [],
          };
        }

        const limit = this.dynamoData.pagination.pageSize;
        const exclusiveStartKey =
          this.dynamoData.lastEvaluatedKeys[this.dynamoData.pagination.page - 1];

        const data = await queryTable(connection, { ...queryParams, limit, exclusiveStartKey });

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

        const primaryColumn = {
          title: 'Primary Key',
          key: 'primaryKey',
          children: [
            { title: `${partitionKeyName}(PK)`, key: `${partitionKeyName}` },
            sortKeyName ? { title: `${sortKeyName}(SK)`, key: `${sortKeyName}` } : undefined,
          ].filter(Boolean) as Array<{ title: string; key: string }>,
        };
        const columns: Array<DynamoColumn> = Array.from(columnsSet)
          .filter(column => column !== partitionKeyName && column !== sortKeyName)
          .map(column => ({ title: column, key: column }));
        columns.unshift(primaryColumn);

        this.dynamoData.columns = columns;
        this.dynamoData.data = columnsData;

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
        pagination: cloneDeep(resetPagination),
        queryInput: undefined,
        queryBody: '',
        lastEvaluatedKeys: [],
      };
    },

    async refreshDynamoData() {
      if (this.dynamoData.queryInput && this.dynamoData.connection) {
        await this.getDynamoData(this.dynamoData.connection, this.dynamoData.queryInput);
      }
    },

    setPartiqlResult(
      result: {
        items: Array<Record<string, unknown>>;
        count: number;
        next_token: string | null;
      } | null,
    ) {
      this.partiqlData.queryResult = result;
      this.partiqlData.currentNextToken = result?.next_token || null;
    },

    setPartiqlError(error: string | null) {
      this.partiqlData.errorMessage = error;
    },

    setPartiqlShowResultPanel(show: boolean) {
      this.partiqlData.showResultPanel = show;
    },

    setPartiqlLastExecutedStatement(statement: string | null) {
      this.partiqlData.lastExecutedStatement = statement;
    },

    appendPartiqlResults(result: {
      items: Array<Record<string, unknown>>;
      count: number;
      next_token: string | null;
    }) {
      if (this.partiqlData.queryResult) {
        this.partiqlData.queryResult = {
          items: [...this.partiqlData.queryResult.items, ...result.items],
          count: this.partiqlData.queryResult.count + result.count,
          next_token: result.next_token,
        };
      } else {
        this.partiqlData.queryResult = result;
      }
      this.partiqlData.currentNextToken = result.next_token;
    },

    resetPartiqlData() {
      this.partiqlData = {
        showResultPanel: false,
        errorMessage: null,
        queryResult: null,
        currentNextToken: null,
        lastExecutedStatement: null,
      };
    },
  },
});
