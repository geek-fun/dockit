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
      queryData: {
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
    };
  } => ({
    dynamoData: {
      connection: {} as DynamoDBConnection,
      queryData: {
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

        if (this.dynamoData.queryData.queryBody !== queryStr) {
          this.dynamoData.queryData = {
            columns: [],
            data: undefined,
            pagination: { ...cloneDeep(resetPagination) },
            queryInput: undefined,
            queryBody: queryStr,
            lastEvaluatedKeys: [],
          };
        }

        const limit = this.dynamoData.queryData.pagination.pageSize;
        const exclusiveStartKey =
          this.dynamoData.queryData.lastEvaluatedKeys[this.dynamoData.queryData.pagination.page - 1];

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

        this.dynamoData.queryData.columns = columns;
        this.dynamoData.queryData.data = columnsData;

        if (data.last_evaluated_key) {
          this.dynamoData.queryData.lastEvaluatedKeys[this.dynamoData.queryData.pagination.page] =
            data.last_evaluated_key;
          this.dynamoData.queryData.pagination.pageCount = this.dynamoData.queryData.lastEvaluatedKeys.length;
        }
        this.dynamoData.queryData.queryInput = queryInput;
      } catch (error) {
        throw error;
      }
    },

    async changePage(page: number) {
      if (this.dynamoData.queryData.pagination.page !== page) {
        this.dynamoData.queryData.pagination.page = page;
        await this.getDynamoData(
          this.dynamoData.connection,
          this.dynamoData.queryData.queryInput as DynamoInput,
        );
      }
    },

    async changePageSize(pageSize: number) {
      if (this.dynamoData.queryData.pagination.pageSize !== pageSize) {
        this.dynamoData.queryData.pagination.pageSize = pageSize;
        this.dynamoData.queryData.pagination.page = 1;
        this.dynamoData.queryData.pagination.pageCount = 1;
        this.dynamoData.queryData.lastEvaluatedKeys = [];
        await this.getDynamoData(
          this.dynamoData.connection,
          this.dynamoData.queryData.queryInput as DynamoInput,
        );
      }
    },

    resetDynamoData() {
      this.dynamoData = {
        connection: {} as DynamoDBConnection,
        queryData: {
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
      };
    },

    async refreshDynamoData() {
      if (this.dynamoData.queryData.queryInput && this.dynamoData.connection) {
        await this.getDynamoData(this.dynamoData.connection, this.dynamoData.queryData.queryInput);
      }
    },

    setPartiqlResult(
      result: {
        items: Array<Record<string, unknown>>;
        count: number;
        next_token: string | null;
      } | null,
    ) {
      this.dynamoData.partiqlData.queryResult = result;
      this.dynamoData.partiqlData.currentNextToken = result?.next_token || null;
    },

    setPartiqlError(error: string | null) {
      this.dynamoData.partiqlData.errorMessage = error;
    },

    setPartiqlShowResultPanel(show: boolean) {
      this.dynamoData.partiqlData.showResultPanel = show;
    },

    setPartiqlLastExecutedStatement(statement: string | null) {
      this.dynamoData.partiqlData.lastExecutedStatement = statement;
    },

    appendPartiqlResults(result: {
      items: Array<Record<string, unknown>>;
      count: number;
      next_token: string | null;
    }) {
      if (this.dynamoData.partiqlData.queryResult) {
        this.dynamoData.partiqlData.queryResult = {
          items: [...this.dynamoData.partiqlData.queryResult.items, ...result.items],
          count: this.dynamoData.partiqlData.queryResult.count + result.count,
          next_token: result.next_token,
        };
      } else {
        this.dynamoData.partiqlData.queryResult = result;
      }
      this.dynamoData.partiqlData.currentNextToken = result.next_token;
    },

    resetPartiqlData() {
      this.dynamoData.partiqlData = {
        showResultPanel: false,
        errorMessage: null,
        queryResult: null,
        currentNextToken: null,
        lastExecutedStatement: null,
      };
    },
  },
});
