import { defineStore } from 'pinia';
import { cloneDeep, omit } from 'lodash';
import { DynamoDBConnection, useConnectionStore } from './connectionStore.ts';
import { DynamoIndexOrTableOption } from './tabStore.ts';
import { dynamoApi } from '../datasources';

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

type UiQueryFormState = {
  index: string | null;
  partitionKey: string | null;
  sortKey: string | null;
  formFilterItems: Array<{ key: string; value: string; operator: string }>;
  selectedIndexOrTable?: DynamoIndexOrTableOption;
};

const defaultUiQueryForm: UiQueryFormState = {
  index: null,
  partitionKey: null,
  sortKey: null,
  formFilterItems: [],
  selectedIndexOrTable: undefined,
};

export const useDbDataStore = defineStore('dbDataStore', {
  state: (): {
    dynamoData: {
      connection: DynamoDBConnection;
      uiQueryForm: UiQueryFormState;
      queryData: {
        showResultPanel: boolean;
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
        columns: Array<DynamoColumn>;
        data: Array<Record<string, unknown>>;
        count: number;
        nextToken: string | null;
        lastExecutedStatement: string | null;
      };
    };
  } => ({
    dynamoData: {
      connection: {} as DynamoDBConnection,
      uiQueryForm: cloneDeep(defaultUiQueryForm),
      queryData: {
        showResultPanel: false,
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
        columns: [],
        data: [],
        count: 0,
        nextToken: null,
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
            showResultPanel: false,
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
          this.dynamoData.queryData.lastEvaluatedKeys[
            this.dynamoData.queryData.pagination.page - 1
          ];

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
            {
              title: `${partitionKeyName}(PK)`,
              key: `${partitionKeyName}`,
              ellipsis: { tooltip: false },
            },
            sortKeyName
              ? { title: `${sortKeyName}(SK)`, key: `${sortKeyName}`, ellipsis: { tooltip: false } }
              : undefined,
          ].filter(Boolean) as Array<{
            title: string;
            key: string;
            ellipsis?: { tooltip: boolean };
          }>,
        };
        const columns: Array<DynamoColumn> = Array.from(columnsSet)
          .filter(column => column !== partitionKeyName && column !== sortKeyName)
          .map(column => ({ title: column, key: column, ellipsis: { tooltip: true } }));
        columns.unshift(primaryColumn);

        this.dynamoData.queryData.columns = columns;
        this.dynamoData.queryData.data = columnsData;

        if (data.last_evaluated_key) {
          this.dynamoData.queryData.lastEvaluatedKeys[this.dynamoData.queryData.pagination.page] =
            data.last_evaluated_key;
          this.dynamoData.queryData.pagination.pageCount =
            this.dynamoData.queryData.lastEvaluatedKeys.length;
        }
        this.dynamoData.queryData.queryInput = queryInput;
        this.dynamoData.queryData.showResultPanel = true;
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
        uiQueryForm: cloneDeep(defaultUiQueryForm),
        queryData: {
          showResultPanel: false,
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
          columns: [],
          data: [],
          count: 0,
          nextToken: null,
          lastExecutedStatement: null,
        },
      };
    },

    resetUiQueryForm() {
      this.dynamoData.uiQueryForm = cloneDeep(defaultUiQueryForm);
    },

    async refreshDynamoData() {
      if (this.dynamoData.queryData.queryInput && this.dynamoData.connection) {
        await this.getDynamoData(this.dynamoData.connection, this.dynamoData.queryData.queryInput);
      }
    },

    // Execute PartiQL statement and handle result/error states automatically
    async executePartiqlStatement(
      connection: DynamoDBConnection,
      statement: string,
      options?: { nextToken?: string | null },
    ): Promise<void> {
      const isLoadingMore = !!options?.nextToken;

      // Reset state for new execution (not for pagination)
      if (!isLoadingMore) {
        this.dynamoData.partiqlData.errorMessage = null;
        this.dynamoData.partiqlData.columns = [];
        this.dynamoData.partiqlData.data = [];
        this.dynamoData.partiqlData.count = 0;
        this.dynamoData.partiqlData.nextToken = null;
        this.dynamoData.partiqlData.lastExecutedStatement = statement;
        this.dynamoData.partiqlData.showResultPanel = true;
      }

      try {
        const result = await dynamoApi.executeStatement(connection, {
          statement,
          nextToken: options?.nextToken,
        });

        // Build columns structure with partition key and sort key info
        const columnsSet = new Set<string>();
        result.items.forEach(item => {
          Object.keys(item).forEach(key => {
            columnsSet.add(key);
          });
        });

        const partitionKeyName = connection.partitionKey?.name;
        const sortKeyName = connection.sortKey?.name;

        // Build primary key column if partition key exists
        const columns: Array<DynamoColumn> = [];
        if (partitionKeyName) {
          const primaryColumn = {
            title: 'Primary Key',
            key: 'primaryKey',
            children: [
              {
                title: `${partitionKeyName}(PK)`,
                key: `${partitionKeyName}`,
                ellipsis: { tooltip: false },
              },
              sortKeyName
                ? {
                    title: `${sortKeyName}(SK)`,
                    key: `${sortKeyName}`,
                    ellipsis: { tooltip: false },
                  }
                : undefined,
            ].filter(Boolean) as Array<{
              title: string;
              key: string;
              ellipsis?: { tooltip: boolean };
            }>,
          };
          columns.push(primaryColumn);
        }

        // Add remaining columns
        const otherColumns = Array.from(columnsSet)
          .filter(column => column !== partitionKeyName && column !== sortKeyName)
          .map(column => ({ title: column, key: column, ellipsis: { tooltip: true } }));
        columns.push(...otherColumns);

        // Prepare data rows
        const columnsData = result.items.map(item => {
          const row: Record<string, unknown> = {};
          columnsSet.forEach(key => {
            row[key] = item[key];
          });
          return row;
        });

        if (isLoadingMore) {
          // Append results for pagination
          // Merge new columns if there are any new fields
          const existingColumnKeys = new Set(
            this.dynamoData.partiqlData.columns.filter(col => !col.children).map(col => col.key),
          );
          const existingChildKeys = new Set(
            this.dynamoData.partiqlData.columns
              .filter(col => col.children)
              .flatMap(col => col.children?.map(child => child.key) || []),
          );
          const allExistingKeys = new Set([...existingColumnKeys, ...existingChildKeys]);

          const newColumns = columns.filter(col => {
            if (col.children) {
              return false; // Primary key column already exists
            }
            return !allExistingKeys.has(col.key);
          });

          if (newColumns.length > 0) {
            this.dynamoData.partiqlData.columns = [
              ...this.dynamoData.partiqlData.columns,
              ...newColumns,
            ];
          }

          this.dynamoData.partiqlData.data = [...this.dynamoData.partiqlData.data, ...columnsData];
          this.dynamoData.partiqlData.count = this.dynamoData.partiqlData.count + result.count;
          this.dynamoData.partiqlData.nextToken = result.next_token;
        } else {
          // Set new results
          this.dynamoData.partiqlData.columns = columns;
          this.dynamoData.partiqlData.data = columnsData;
          this.dynamoData.partiqlData.count = result.count;
          this.dynamoData.partiqlData.nextToken = result.next_token;
        }

        // Clear any previous error on success
        this.dynamoData.partiqlData.errorMessage = null;
      } catch (error: any) {
        // Set error state automatically
        const errorMsg = error.details || error.message || String(error);
        this.dynamoData.partiqlData.errorMessage = errorMsg;
        throw error; // Re-throw for UI error handling
      }
    },

    resetPartiqlData() {
      this.dynamoData.partiqlData = {
        showResultPanel: false,
        errorMessage: null,
        columns: [],
        data: [],
        count: 0,
        nextToken: null,
        lastExecutedStatement: null,
      };
    },
  },
});
