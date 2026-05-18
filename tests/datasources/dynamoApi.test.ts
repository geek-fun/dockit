import { dynamoApi } from '../../src/datasources/dynamoApi.ts';
import { tauriClient } from '../../src/datasources/ApiClients.ts';

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
