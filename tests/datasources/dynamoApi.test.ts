import { dynamoApi } from '../../src/datasources/dynamoApi.ts';
import { invokeCapability } from '../../src/datasources/capabilityInvoker.ts';

jest.mock('../../src/lang/index.ts', () => ({
  lang: {
    globalInjection: true,
    locale: 'enUS',
    legacy: false,
    messages: {},
  },
  useLang: jest.fn(),
}));

jest.mock('../../src/datasources/ApiClients.ts', () => ({
  tauriClient: {
    invokeDynamoApi: jest.fn(),
  },
}));

jest.mock('../../src/datasources/capabilityInvoker.ts', () => ({
  invokeCapability: jest.fn(),
  parseDynamoCapabilityResponse: <T>(raw: string): T => JSON.parse(raw) as T,
}));

const mockedInvokeCapability = invokeCapability as jest.MockedFunction<typeof invokeCapability>;

const mockConnection = {
  id: '1',
  type: 'DYNAMODB',
  name: 'test-connection',
  region: 'us-east-1',
  endpointUrl: null,
  auth: {
    kind: 'accessKey',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
  },
};

const mockProfileConnection = {
  id: '2',
  type: 'DYNAMODB',
  name: 'test-profile-connection',
  region: 'us-west-2',
  endpointUrl: null,
  auth: {
    kind: 'profile',
    profileName: 'default',
  },
};

const mockSsoConnection = {
  id: '3',
  type: 'DYNAMODB',
  name: 'test-sso-connection',
  region: 'us-east-1',
  endpointUrl: null,
  auth: {
    kind: 'sso',
    accessKeyId: 'sso-key',
    secretAccessKey: 'sso-secret',
    sessionToken: 'sso-session',
    region: 'us-east-1',
  },
};

const mockAssumeRoleConnection = {
  id: '4',
  type: 'DYNAMODB',
  name: 'test-assume-role-connection',
  region: 'us-east-1',
  endpointUrl: null,
  auth: {
    kind: 'assumeRole',
    accessKeyId: 'assumed-key',
    secretAccessKey: 'assumed-secret',
    sessionToken: 'assumed-session',
    region: 'us-east-1',
  },
};

describe('dynamoApi - Table Lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTable', () => {
    it('should call CREATE_TABLE operation with basic config', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ tableName: 'test-table' }));

      const result = await dynamoApi.createTable(mockConnection as any, {
        tableName: 'test-table',
        partitionKey: { name: 'id', type: 'S' },
        billingMode: 'PAY_PER_REQUEST',
      });

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__create_table',
        expect.objectContaining({
          table_name: 'test-table',
          partition_key: 'id',
          billing_mode: 'PAY_PER_REQUEST',
        }),
        expect.any(String),
      );

      expect(result).toEqual({ tableName: 'test-table' });
    });

    it('should call CREATE_TABLE operation with provisioned capacity', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ tableName: 'test-table' }));

      await dynamoApi.createTable(mockConnection as any, {
        tableName: 'test-table',
        partitionKey: { name: 'id', type: 'S' },
        sortKey: { name: 'timestamp', type: 'N' },
        billingMode: 'PROVISIONED',
        readCapacity: 10,
        writeCapacity: 5,
      });

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__create_table',
        expect.objectContaining({
          billing_mode: 'PROVISIONED',
          read_capacity_units: 10,
          write_capacity_units: 5,
          sort_key: 'timestamp',
          sort_key_type: 'N',
        }),
        expect.any(String),
      );
    });

    it('should throw error on failed create', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Table already exists'));

      await expect(
        dynamoApi.createTable(mockConnection as any, {
          tableName: 'existing-table',
          partitionKey: { name: 'id', type: 'S' },
          billingMode: 'PAY_PER_REQUEST',
        }),
      ).rejects.toThrow();
    });
  });

  describe('deleteTable', () => {
    it('should call DELETE_TABLE operation', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ tableName: 'test-table' }));

      const result = await dynamoApi.deleteTable(mockConnection as any, 'test-table');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__delete_table',
        { table_name: 'test-table' },
        expect.any(String),
      );

      expect(result).toEqual({ tableName: 'test-table' });
    });

    it('should throw error on failed delete', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Table not found'));

      await expect(dynamoApi.deleteTable(mockConnection as any, 'non-existent')).rejects.toThrow();
    });
  });

  describe('truncateTable', () => {
    it('should call TRUNCATE_TABLE operation', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({
          totalItems: 100,
          totalScanned: 100,
          deletedItems: 100,
          unprocessedCount: 0,
          errors: [],
        }),
      );

      const result = await dynamoApi.truncateTable(mockConnection as any, 'test-table');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__truncate_table',
        { table_name: 'test-table' },
        expect.any(String),
      );

      expect(result).toEqual({
        totalItems: 100,
        totalScanned: 100,
        deletedItems: 100,
        unprocessedCount: 0,
        errors: [],
      });
    });

    describe('dynamoApi - Query Operations', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      describe('queryTable', () => {
        it('should call QUERY_TABLE operation with basic params', async () => {
          const mockResult = {
            items: [{ id: '1', name: 'test' }],
            count: 1,
            scanned_count: 1,
            last_evaluated_key: null,
          };
          mockedInvokeCapability.mockResolvedValue(JSON.stringify(mockResult));

          const result = await dynamoApi.queryTable(mockConnection as any, {
            tableName: 'test-table',
            indexName: null,
            partitionKey: { name: 'id', value: '1' },
          });

          expect(mockedInvokeCapability).toHaveBeenCalledWith(
            'dynamo__query_table',
            expect.objectContaining({
              table_name: 'test-table',
              partition_key: { name: 'id', value: '1' },
            }),
            expect.any(String),
          );
          expect(result).toEqual(mockResult);
        });

        it('should call QUERY_TABLE with sort key and filters', async () => {
          mockedInvokeCapability.mockResolvedValue(
            JSON.stringify({ items: [], count: 0, scanned_count: 0, last_evaluated_key: null }),
          );

          await dynamoApi.queryTable(mockConnection as any, {
            tableName: 'test-table',
            indexName: null,
            partitionKey: { name: 'id', value: '1' },
            sortKey: { name: 'timestamp', value: '2024-01-01' },
            filters: [{ key: 'status', operator: 'EQ', value: 'active' }],
            limit: 10,
            exclusiveStartKey: null,
          });

          expect(mockedInvokeCapability).toHaveBeenCalledWith(
            'dynamo__query_table',
            expect.objectContaining({
              sort_key: { name: 'timestamp', value: '2024-01-01' },
              filters: [{ key: 'status', operator: 'EQ', value: 'active' }],
              limit: 10,
              exclusive_start_key: null,
            }),
            expect.any(String),
          );
        });

        it('should throw error on failed query', async () => {
          mockedInvokeCapability.mockRejectedValue(new Error('Table not found'));

          await expect(
            dynamoApi.queryTable(mockConnection as any, {
              tableName: 'non-existent',
              indexName: null,
              partitionKey: { name: 'id', value: '1' },
            }),
          ).rejects.toThrow();
        });
      });

      describe('scanTable', () => {
        it('should call SCAN_TABLE operation with basic params', async () => {
          const mockResult = {
            items: [{ id: '1', name: 'test' }],
            count: 1,
            scanned_count: 100,
            last_evaluated_key: null,
          };
          mockedInvokeCapability.mockResolvedValue(JSON.stringify(mockResult));

          const result = await dynamoApi.scanTable(mockConnection as any, {
            tableName: 'test-table',
            indexName: null,
            partitionKey: { name: 'id', value: '1' },
          });

          expect(mockedInvokeCapability).toHaveBeenCalledWith(
            'dynamo__scan_table',
            expect.objectContaining({
              table_name: 'test-table',
            }),
            expect.any(String),
          );
          expect(result).toEqual(mockResult);
        });

        it('should throw error on failed scan', async () => {
          mockedInvokeCapability.mockRejectedValue(new Error('Scan failed'));

          await expect(
            dynamoApi.scanTable(mockConnection as any, {
              tableName: 'non-existent',
              indexName: null,
              partitionKey: { name: 'id', value: '1' },
            }),
          ).rejects.toThrow();
        });
      });
    });

    describe('dynamoApi - Item Operations', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      describe('createItem', () => {
        it('should call CREATE_ITEM operation', async () => {
          mockedInvokeCapability.mockResolvedValue(
            JSON.stringify({
              message: 'Item created',
              data: { items: [], count: 0, scanned_count: 0, last_evaluated_key: null },
            }),
          );

          const result = await dynamoApi.createItem(mockConnection as any, 'test-table', [
            { key: 'id', value: '1', type: 'S' },
            { key: 'name', value: 'test', type: 'S' },
          ]);

          expect(mockedInvokeCapability).toHaveBeenCalledWith(
            'dynamo__create_item',
            expect.objectContaining({
              table_name: 'test-table',
            }),
            expect.any(String),
          );
          expect(result.message).toBe('Item created');
        });

        it('should call CREATE_ITEM with skipExisting option', async () => {
          mockedInvokeCapability.mockResolvedValue(
            JSON.stringify({
              message: 'Item skipped',
              data: { items: [], count: 0, scanned_count: 0, last_evaluated_key: null },
            }),
          );

          await dynamoApi.createItem(mockConnection as any, 'test-table', [], {
            skipExisting: true,
            partitionKey: 'id',
          });

          expect(mockedInvokeCapability).toHaveBeenCalledWith(
            'dynamo__create_item',
            expect.objectContaining({
              skip_existing: true,
              partition_key: 'id',
            }),
            expect.any(String),
          );
        });

        it('should throw error on failed create', async () => {
          mockedInvokeCapability.mockRejectedValue(new Error('Item already exists'));

          await expect(
            dynamoApi.createItem(mockConnection as any, 'test-table', [
              { key: 'id', value: '1', type: 'S' },
            ]),
          ).rejects.toThrow();
        });
      });

      describe('batchWriteItems', () => {
        it('should call BATCH_WRITE_ITEMS operation', async () => {
          const mockResult = {
            inserted: 2,
            skipped: 0,
            errorCount: 0,
            errors: [],
            unprocessedItems: [],
            unprocessedCount: 0,
          };
          mockedInvokeCapability.mockResolvedValue(JSON.stringify(mockResult));

          const result = await dynamoApi.batchWriteItems(mockConnection as any, 'test-table', [
            { attributes: [{ key: 'id', value: '1', type: 'S' }] },
          ]);

          expect(mockedInvokeCapability).toHaveBeenCalledWith(
            'dynamo__batch_write_items',
            expect.objectContaining({
              table_name: 'test-table',
            }),
            expect.any(String),
          );
          expect(result.inserted).toBe(2);
        });

        it('should throw error on failed batch write', async () => {
          mockedInvokeCapability.mockRejectedValue(new Error('Write failed'));

          await expect(
            dynamoApi.batchWriteItems(mockConnection as any, 'test-table', []),
          ).rejects.toThrow();
        });
      });

      describe('updateItem', () => {
        it('should call UPDATE_ITEM operation', async () => {
          mockedInvokeCapability.mockResolvedValue(JSON.stringify({ message: 'Item updated' }));

          const result = await dynamoApi.updateItem(
            mockConnection as any,
            'test-table',
            [{ key: 'id', value: '1', type: 'S' }],
            [{ key: 'name', value: 'updated', type: 'S' }],
          );

          expect(mockedInvokeCapability).toHaveBeenCalledWith(
            'dynamo__update_item',
            expect.objectContaining({
              table_name: 'test-table',
            }),
            expect.any(String),
          );
          expect(result).toEqual({ message: 'Item updated' });
        });

        it('should throw error on failed update', async () => {
          mockedInvokeCapability.mockRejectedValue(new Error('Item not found'));

          await expect(
            dynamoApi.updateItem(
              mockConnection as any,
              'test-table',
              [{ key: 'id', value: '1', type: 'S' }],
              [{ key: 'name', value: 'updated', type: 'S' }],
            ),
          ).rejects.toThrow();
        });
      });

      describe('deleteItem', () => {
        it('should call DELETE_ITEM operation', async () => {
          mockedInvokeCapability.mockResolvedValue(JSON.stringify({ message: 'Item deleted' }));

          const result = await dynamoApi.deleteItem(mockConnection as any, 'test-table', [
            { key: 'id', value: '1', type: 'S' },
          ]);

          expect(mockedInvokeCapability).toHaveBeenCalledWith(
            'dynamo__delete_item',
            expect.objectContaining({
              table_name: 'test-table',
            }),
            expect.any(String),
          );
          expect(result).toEqual({ message: 'Item deleted' });
        });

        it('should throw error on failed delete', async () => {
          mockedInvokeCapability.mockRejectedValue(new Error('Item not found'));

          await expect(
            dynamoApi.deleteItem(mockConnection as any, 'test-table', [
              { key: 'id', value: '1', type: 'S' },
            ]),
          ).rejects.toThrow();
        });
      });
    });

    describe('dynamoApi - Index Management', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      describe('createGlobalSecondaryIndex', () => {
        it('should call CREATE_GSI operation with basic config', async () => {
          mockedInvokeCapability.mockResolvedValue(
            JSON.stringify({ tableName: 'test-table', indexName: 'test-index' }),
          );

          const result = await dynamoApi.createGlobalSecondaryIndex(
            mockConnection as any,
            'test-table',
            {
              indexName: 'test-index',
              keySchema: [{ attributeName: 'email', keyType: 'HASH', attributeType: 'S' }],
              projectionType: 'ALL',
              readCapacityUnits: 5,
              writeCapacityUnits: 5,
            },
          );

          expect(mockedInvokeCapability).toHaveBeenCalledWith(
            'dynamo__create_gsi',
            expect.objectContaining({
              table_name: 'test-table',
              index_name: 'test-index',
              projection_type: 'ALL',
              read_capacity_units: 5,
              write_capacity_units: 5,
            }),
            expect.any(String),
          );
          expect(result).toEqual({ tableName: 'test-table', indexName: 'test-index' });
        });

        it('should include warm_throughput when values are positive', async () => {
          mockedInvokeCapability.mockResolvedValue(
            JSON.stringify({ tableName: 'test-table', indexName: 'test-index' }),
          );

          await dynamoApi.createGlobalSecondaryIndex(mockConnection as any, 'test-table', {
            indexName: 'test-index',
            keySchema: [{ attributeName: 'email', keyType: 'HASH', attributeType: 'S' }],
            projectionType: 'ALL',
            readCapacityUnits: 5,
            writeCapacityUnits: 5,
            warmThroughput: { readUnits: 10, writeUnits: 20 },
          });

          expect(mockedInvokeCapability).toHaveBeenCalledWith(
            'dynamo__create_gsi',
            expect.objectContaining({
              warm_throughput: {
                read_units_per_second: 10,
                write_units_per_second: 20,
              },
            }),
            expect.any(String),
          );
        });

        it('should omit warm_throughput when values are 0', async () => {
          mockedInvokeCapability.mockResolvedValue(
            JSON.stringify({ tableName: 'test-table', indexName: 'test-index' }),
          );

          await dynamoApi.createGlobalSecondaryIndex(mockConnection as any, 'test-table', {
            indexName: 'test-index',
            keySchema: [{ attributeName: 'email', keyType: 'HASH', attributeType: 'S' }],
            projectionType: 'KEYS_ONLY',
            readCapacityUnits: 0,
            writeCapacityUnits: 0,
            warmThroughput: { readUnits: 0, writeUnits: 0 },
          });

          const calls = mockedInvokeCapability.mock.calls;
          const args = calls[0][1] as Record<string, unknown>;
          expect(args.warm_throughput).toBeUndefined();
        });

        it('should throw error on failed create', async () => {
          mockedInvokeCapability.mockRejectedValue(new Error('Index already exists'));

          await expect(
            dynamoApi.createGlobalSecondaryIndex(mockConnection as any, 'test-table', {
              indexName: 'existing-index',
              keySchema: [{ attributeName: 'email', keyType: 'HASH', attributeType: 'S' }],
              projectionType: 'ALL',
            }),
          ).rejects.toThrow();
        });
      });

      describe('updateGlobalSecondaryIndex', () => {
        it('should call UPDATE_GSI operation', async () => {
          mockedInvokeCapability.mockResolvedValue(
            JSON.stringify({ tableName: 'test-table', indexName: 'test-index' }),
          );

          const result = await dynamoApi.updateGlobalSecondaryIndex(
            mockConnection as any,
            'test-table',
            { indexName: 'test-index', readCapacityUnits: 10, writeCapacityUnits: 20 },
          );

          expect(mockedInvokeCapability).toHaveBeenCalledWith(
            'dynamo__update_gsi',
            expect.objectContaining({
              table_name: 'test-table',
              index_name: 'test-index',
              read_capacity_units: 10,
              write_capacity_units: 20,
            }),
            expect.any(String),
          );
          expect(result).toEqual({ tableName: 'test-table', indexName: 'test-index' });
        });

        it('should throw error on failed update', async () => {
          mockedInvokeCapability.mockRejectedValue(new Error('Index not found'));

          await expect(
            dynamoApi.updateGlobalSecondaryIndex(mockConnection as any, 'test-table', {
              indexName: 'non-existent',
              readCapacityUnits: 10,
              writeCapacityUnits: 10,
            }),
          ).rejects.toThrow();
        });
      });

      describe('deleteGlobalSecondaryIndex', () => {
        it('should call DELETE_GSI operation', async () => {
          mockedInvokeCapability.mockResolvedValue(
            JSON.stringify({ tableName: 'test-table', indexName: 'test-index' }),
          );

          const result = await dynamoApi.deleteGlobalSecondaryIndex(
            mockConnection as any,
            'test-table',
            'test-index',
          );

          expect(mockedInvokeCapability).toHaveBeenCalledWith(
            'dynamo__delete_gsi',
            expect.objectContaining({
              table_name: 'test-table',
              index_name: 'test-index',
            }),
            expect.any(String),
          );
          expect(result).toEqual({ tableName: 'test-table', indexName: 'test-index' });
        });

        it('should throw error on failed delete', async () => {
          mockedInvokeCapability.mockRejectedValue(new Error('Index not found'));

          await expect(
            dynamoApi.deleteGlobalSecondaryIndex(
              mockConnection as any,
              'test-table',
              'non-existent',
            ),
          ).rejects.toThrow();
        });
      });
    });

    it('should return errors when truncation has partial failures', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({
          totalItems: 100,
          totalScanned: 100,
          deletedItems: 95,
          unprocessedCount: 5,
          errors: [{ error: 'MaxRetriesExceeded', message: 'Failed after 8 retries' }],
        }),
      );

      const result = await dynamoApi.truncateTable(mockConnection as any, 'test-table');

      expect(result.deletedItems).toBe(95);
      expect(result.errors.length).toBe(1);
    });

    it('should throw error on failed truncate', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to describe table'));

      await expect(dynamoApi.truncateTable(mockConnection as any, 'test-table')).rejects.toThrow();
    });
  });
});

describe('dynamoApi - Auth Types', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call invokeCapability for profile auth', async () => {
    mockedInvokeCapability.mockResolvedValue(JSON.stringify({ tableNames: ['table1'] }));

    await dynamoApi.listTables(mockProfileConnection as any);

    expect(mockedInvokeCapability).toHaveBeenCalledWith(
      'dynamo__list_tables',
      {},
      expect.any(String),
    );
  });

  it('should call invokeCapability for sso auth', async () => {
    mockedInvokeCapability.mockResolvedValue(JSON.stringify({ tableNames: ['table1'] }));

    await dynamoApi.listTables(mockSsoConnection as any);

    expect(mockedInvokeCapability).toHaveBeenCalledWith(
      'dynamo__list_tables',
      {},
      expect.any(String),
    );
  });

  it('should call invokeCapability for assumeRole auth', async () => {
    mockedInvokeCapability.mockResolvedValue(JSON.stringify({ tableNames: ['table1'] }));

    await dynamoApi.listTables(mockAssumeRoleConnection as any);

    expect(mockedInvokeCapability).toHaveBeenCalledWith(
      'dynamo__list_tables',
      {},
      expect.any(String),
    );
  });
});

describe('dynamoApi - Basic Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listTables', () => {
    it('should return list of table names', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ tableNames: ['table1', 'table2', 'table3'] }),
      );

      const result = await dynamoApi.listTables(mockConnection as any);

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__list_tables',
        {},
        expect.any(String),
      );
      expect(result).toEqual(['table1', 'table2', 'table3']);
    });

    it('should return empty array when no tables', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({}));

      const result = await dynamoApi.listTables(mockConnection as any);

      expect(result).toEqual([]);
    });

    it('should throw error on failed list', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to list tables'));

      await expect(dynamoApi.listTables(mockConnection as any)).rejects.toThrow();
    });
  });

  describe('describeTable', () => {
    it('should return table info', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({
          id: 'test-id',
          name: 'test-table',
          status: 'ACTIVE',
          creationDateTime: '2024-01-01T00:00:00Z',
          itemCount: 100,
          sizeBytes: 1024,
          billingMode: 'PAY_PER_REQUEST',
          keySchema: [
            { attributeName: 'id', keyType: 'HASH' },
            { attributeName: 'timestamp', keyType: 'RANGE' },
          ],
          attributeDefinitions: [
            { attributeName: 'id', attributeType: 'S' },
            { attributeName: 'timestamp', attributeType: 'N' },
          ],
          indices: [],
        }),
      );

      const result = await dynamoApi.describeTable(mockConnection as any, 'test-table');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__describe_table',
        { table_name: 'test-table' },
        expect.any(String),
      );

      expect(result.name).toBe('test-table');
      expect(result.status).toBe('ACTIVE');
    });

    it('should throw error on failed describe', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Table not found'));

      await expect(
        dynamoApi.describeTable(mockConnection as any, 'non-existent'),
      ).rejects.toThrow();
    });
  });

  describe('getTableMetrics', () => {
    it('should return metrics data', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({
          available: true,
          metrics: {
            consumedRead: [1, 2, 3],
            consumedWrite: [1, 2, 3],
            timestamps: ['t1', 't2', 't3'],
            provisionedReadCapacity: 100,
            provisionedWriteCapacity: 100,
            rcuUtilization: 50,
            wcuUtilization: 50,
            throttledReadRequests: 0,
            throttledWriteRequests: 0,
            totalThrottledEvents: 0,
          },
        }),
      );

      const result = await dynamoApi.getTableMetrics(mockConnection as any, 'test-table', 24);

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__get_table_metrics',
        { table_name: 'test-table', period_hours: 24 },
        expect.any(String),
      );

      expect(result.available).toBe(true);
      expect(result.metrics?.consumedRead).toEqual([1, 2, 3]);
    });

    it('should return not available when metrics unavailable', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({
          available: false,
          message: 'CloudWatch not available',
        }),
      );

      const result = await dynamoApi.getTableMetrics(mockConnection as any, 'test-table', 24);

      expect(result.available).toBe(false);
    });
  });

  describe('describeContinuousBackups', () => {
    it('should return PITR status', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({
          pitrEnabled: true,
          pitrStatus: 'ENABLED',
        }),
      );

      const result = await dynamoApi.describeContinuousBackups(mockConnection as any, 'test-table');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__describe_continuous_backups',
        { table_name: 'test-table' },
        expect.any(String),
      );

      expect(result.pitrEnabled).toBe(true);
    });
  });

  describe('describeTimeToLive', () => {
    it('should return TTL status', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({
          ttlEnabled: true,
          attributeName: 'expiresAt',
          ttlStatus: 'ENABLED',
        }),
      );

      const result = await dynamoApi.describeTimeToLive(mockConnection as any, 'test-table');

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__describe_ttl',
        { table_name: 'test-table' },
        expect.any(String),
      );

      expect(result.ttlEnabled).toBe(true);
      expect(result.attributeName).toBe('expiresAt');
    });
  });
});

describe('dynamoApi - Table Modification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateTableConfig', () => {
    it('should update billing mode to provisioned', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ tableName: 'test-table' }));

      await dynamoApi.updateTableConfig(mockConnection as any, 'test-table', {
        billingMode: 'PROVISIONED',
        readCapacity: 100,
        writeCapacity: 50,
      });

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__update_table_config',
        expect.objectContaining({
          table_name: 'test-table',
          billing_mode: 'PROVISIONED',
          read_capacity_units: 100,
          write_capacity_units: 50,
        }),
        expect.any(String),
      );
    });

    it('should update billing mode to on-demand', async () => {
      mockedInvokeCapability.mockResolvedValue(JSON.stringify({ tableName: 'test-table' }));

      await dynamoApi.updateTableConfig(mockConnection as any, 'test-table', {
        billingMode: 'PAY_PER_REQUEST',
      });

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__update_table_config',
        expect.objectContaining({
          billing_mode: 'PAY_PER_REQUEST',
        }),
        expect.any(String),
      );
    });

    it('should throw error on failed update', async () => {
      mockedInvokeCapability.mockRejectedValue(new Error('Failed to update table'));

      await expect(
        dynamoApi.updateTableConfig(mockConnection as any, 'test-table', {
          billingMode: 'PROVISIONED',
          readCapacity: 100,
          writeCapacity: 50,
        }),
      ).rejects.toThrow();
    });
  });

  describe('updateTimeToLive', () => {
    it('should enable TTL', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ tableName: 'test-table', enabled: true, attributeName: 'expiresAt' }),
      );

      await dynamoApi.updateTimeToLive(mockConnection as any, 'test-table', {
        enabled: true,
        attributeName: 'expiresAt',
      });

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__update_ttl',
        expect.objectContaining({
          table_name: 'test-table',
          enabled: true,
          attribute_name: 'expiresAt',
        }),
        expect.any(String),
      );
    });

    it('should disable TTL', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ tableName: 'test-table', enabled: false }),
      );

      await dynamoApi.updateTimeToLive(mockConnection as any, 'test-table', {
        enabled: false,
      });

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__update_ttl',
        expect.objectContaining({
          table_name: 'test-table',
          enabled: false,
        }),
        expect.any(String),
      );
    });
  });

  describe('updateContinuousBackups', () => {
    it('should enable PITR', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ tableName: 'test-table', enabled: true }),
      );

      await dynamoApi.updateContinuousBackups(mockConnection as any, 'test-table', true);

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__update_pitr',
        { table_name: 'test-table', enabled: true },
        expect.any(String),
      );
    });

    it('should disable PITR', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ tableName: 'test-table', enabled: false }),
      );

      await dynamoApi.updateContinuousBackups(mockConnection as any, 'test-table', false);

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__update_pitr',
        { table_name: 'test-table', enabled: false },
        expect.any(String),
      );
    });
  });

  describe('updateStreams', () => {
    it('should enable streams', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({
          tableName: 'test-table',
          streamEnabled: true,
          streamViewType: 'NEW_AND_OLD_IMAGES',
        }),
      );

      await dynamoApi.updateStreams(mockConnection as any, 'test-table', {
        enabled: true,
        streamViewType: 'NEW_AND_OLD_IMAGES',
      });

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__update_streams',
        expect.objectContaining({
          table_name: 'test-table',
          enabled: true,
          stream_view_type: 'NEW_AND_OLD_IMAGES',
        }),
        expect.any(String),
      );
    });

    it('should disable streams', async () => {
      mockedInvokeCapability.mockResolvedValue(
        JSON.stringify({ tableName: 'test-table', streamEnabled: false }),
      );

      await dynamoApi.updateStreams(mockConnection as any, 'test-table', {
        enabled: false,
      });

      expect(mockedInvokeCapability).toHaveBeenCalledWith(
        'dynamo__update_streams',
        expect.objectContaining({
          table_name: 'test-table',
          enabled: false,
        }),
        expect.any(String),
      );
    });
  });
});
