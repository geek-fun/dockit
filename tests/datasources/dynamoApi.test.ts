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
