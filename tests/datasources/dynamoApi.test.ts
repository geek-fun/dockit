import { dynamoApi } from '../../src/datasources/dynamoApi.ts';
import { tauriClient } from '../../src/datasources/ApiClients.ts';
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
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'Table created successfully',
        data: { tableName: 'test-table' },
      });

      const result = await dynamoApi.createTable(mockConnection as any, {
        tableName: 'test-table',
        partitionKey: { name: 'id', type: 'S' },
        billingMode: 'PAY_PER_REQUEST',
      });

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.any(Object),
        }),
        expect.objectContaining({
          table_name: 'test-table',
          operation: 'CREATE_TABLE',
          payload: expect.objectContaining({
            table_name: 'test-table',
            partition_key: 'id',
            billing_mode: 'PAY_PER_REQUEST',
          }),
        }),
      );

      expect(result).toEqual({ tableName: 'test-table' });
    });

    it('should call CREATE_TABLE operation with provisioned capacity', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'Table created successfully',
        data: { tableName: 'test-table' },
      });

      await dynamoApi.createTable(mockConnection as any, {
        tableName: 'test-table',
        partitionKey: { name: 'id', type: 'S' },
        sortKey: { name: 'timestamp', type: 'N' },
        billingMode: 'PROVISIONED',
        readCapacity: 10,
        writeCapacity: 5,
      });

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          payload: expect.objectContaining({
            billing_mode: 'PROVISIONED',
            read_capacity_units: 10,
            write_capacity_units: 5,
            sort_key: 'timestamp',
            sort_key_type: 'N',
          }),
        }),
      );
    });

    it('should throw error on failed create', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 500,
        message: 'Table already exists',
        data: null,
      });

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
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'Table deleted successfully',
        data: { tableName: 'test-table' },
      });

      const result = await dynamoApi.deleteTable(mockConnection as any, 'test-table');

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          table_name: 'test-table',
          operation: 'DELETE_TABLE',
        }),
      );

      expect(result).toEqual({ tableName: 'test-table' });
    });

    it('should throw error on failed delete', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 404,
        message: 'Table not found',
        data: null,
      });

      await expect(dynamoApi.deleteTable(mockConnection as any, 'non-existent')).rejects.toThrow();
    });
  });

  describe('truncateTable', () => {
    it('should call TRUNCATE_TABLE operation', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'Table truncated successfully',
        data: {
          totalItems: 100,
          totalScanned: 100,
          deletedItems: 100,
          unprocessedCount: 0,
          errors: [],
        },
      });

      const result = await dynamoApi.truncateTable(mockConnection as any, 'test-table');

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          table_name: 'test-table',
          operation: 'TRUNCATE_TABLE',
        }),
      );

      expect(result).toEqual({
        totalItems: 100,
        totalScanned: 100,
        deletedItems: 100,
        unprocessedCount: 0,
        errors: [],
      });
    });

    it('should return errors when truncation has partial failures', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'Table truncated with some errors',
        data: {
          totalItems: 100,
          totalScanned: 100,
          deletedItems: 95,
          unprocessedCount: 5,
          errors: [{ error: 'MaxRetriesExceeded', message: 'Failed after 8 retries' }],
        },
      });

      const result = await dynamoApi.truncateTable(mockConnection as any, 'test-table');

      expect(result.deletedItems).toBe(95);
      expect(result.errors.length).toBe(1);
    });

    it('should throw error on failed truncate', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 500,
        message: 'Failed to describe table',
        data: null,
      });

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
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'Success',
        data: {
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
        },
      });

      const result = await dynamoApi.getTableMetrics(mockConnection as any, 'test-table', 24);

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          table_name: 'test-table',
          operation: 'GET_TABLE_METRICS',
        }),
      );

      expect(result.available).toBe(true);
      expect(result.metrics?.consumedRead).toEqual([1, 2, 3]);
    });

    it('should return not available when metrics unavailable', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'Success',
        data: {
          available: false,
          message: 'CloudWatch not available',
        },
      });

      const result = await dynamoApi.getTableMetrics(mockConnection as any, 'test-table', 24);

      expect(result.available).toBe(false);
    });
  });

  describe('describeContinuousBackups', () => {
    it('should return PITR status', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'Success',
        data: {
          pitrEnabled: true,
          pitrStatus: 'ENABLED',
        },
      });

      const result = await dynamoApi.describeContinuousBackups(mockConnection as any, 'test-table');

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          table_name: 'test-table',
          operation: 'DESCRIBE_CONTINUOUS_BACKUPS',
        }),
      );

      expect(result.pitrEnabled).toBe(true);
    });
  });

  describe('describeTimeToLive', () => {
    it('should return TTL status', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'Success',
        data: {
          ttlEnabled: true,
          attributeName: 'expiresAt',
          ttlStatus: 'ENABLED',
        },
      });

      const result = await dynamoApi.describeTimeToLive(mockConnection as any, 'test-table');

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          table_name: 'test-table',
          operation: 'DESCRIBE_TIME_TO_LIVE',
        }),
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
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'Table updated successfully',
        data: { tableName: 'test-table' },
      });

      await dynamoApi.updateTableConfig(mockConnection as any, 'test-table', {
        billingMode: 'PROVISIONED',
        readCapacity: 100,
        writeCapacity: 50,
      });

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          table_name: 'test-table',
          operation: 'UPDATE_TABLE_CONFIG',
          payload: expect.objectContaining({
            billing_mode: 'PROVISIONED',
            read_capacity_units: 100,
            write_capacity_units: 50,
          }),
        }),
      );
    });

    it('should update billing mode to on-demand', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'Table updated successfully',
        data: { tableName: 'test-table' },
      });

      await dynamoApi.updateTableConfig(mockConnection as any, 'test-table', {
        billingMode: 'PAY_PER_REQUEST',
      });

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          payload: expect.objectContaining({
            billing_mode: 'PAY_PER_REQUEST',
          }),
        }),
      );
    });

    it('should throw error on failed update', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 500,
        message: 'Failed to update table',
        data: null,
      });

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
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'TTL updated successfully',
        data: { tableName: 'test-table', enabled: true, attributeName: 'expiresAt' },
      });

      await dynamoApi.updateTimeToLive(mockConnection as any, 'test-table', {
        enabled: true,
        attributeName: 'expiresAt',
      });

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          table_name: 'test-table',
          operation: 'UPDATE_TTL',
          payload: expect.objectContaining({
            enabled: true,
            attribute_name: 'expiresAt',
          }),
        }),
      );
    });

    it('should disable TTL', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'TTL updated successfully',
        data: { tableName: 'test-table', enabled: false },
      });

      await dynamoApi.updateTimeToLive(mockConnection as any, 'test-table', {
        enabled: false,
      });

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          payload: expect.objectContaining({
            enabled: false,
          }),
        }),
      );
    });
  });

  describe('updateContinuousBackups', () => {
    it('should enable PITR', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'PITR updated successfully',
        data: { tableName: 'test-table', enabled: true },
      });

      await dynamoApi.updateContinuousBackups(mockConnection as any, 'test-table', true);

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          table_name: 'test-table',
          operation: 'UPDATE_PITR',
          payload: expect.objectContaining({
            enabled: true,
          }),
        }),
      );
    });

    it('should disable PITR', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'PITR updated successfully',
        data: { tableName: 'test-table', enabled: false },
      });

      await dynamoApi.updateContinuousBackups(mockConnection as any, 'test-table', false);

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          payload: expect.objectContaining({
            enabled: false,
          }),
        }),
      );
    });
  });

  describe('updateStreams', () => {
    it('should enable streams', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'Streams updated successfully',
        data: {
          tableName: 'test-table',
          streamEnabled: true,
          streamViewType: 'NEW_AND_OLD_IMAGES',
        },
      });

      await dynamoApi.updateStreams(mockConnection as any, 'test-table', {
        enabled: true,
        streamViewType: 'NEW_AND_OLD_IMAGES',
      });

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          table_name: 'test-table',
          operation: 'UPDATE_STREAMS',
          payload: expect.objectContaining({
            enabled: true,
            stream_view_type: 'NEW_AND_OLD_IMAGES',
          }),
        }),
      );
    });

    it('should disable streams', async () => {
      (tauriClient.invokeDynamoApi as jest.Mock).mockResolvedValue({
        status: 200,
        message: 'Streams updated successfully',
        data: { tableName: 'test-table', streamEnabled: false },
      });

      await dynamoApi.updateStreams(mockConnection as any, 'test-table', {
        enabled: false,
      });

      expect(tauriClient.invokeDynamoApi).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          payload: expect.objectContaining({
            enabled: false,
          }),
        }),
      );
    });
  });
});
