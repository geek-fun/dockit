import { invoke } from '@tauri-apps/api/core';
import { dynamoApi } from '../../src/datasources/dynamoApi';
import type { DynamoDBConnection } from '../../src/store';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }));
jest.mock('../../src/common', () => ({
  jsonify: { parse: JSON.parse },
  CustomError: class extends Error {
    constructor(
      public status: number,
      public details: string,
    ) {
      super(details);
      void status;
    }
  },
}));
const connection = { id: 1 } as DynamoDBConnection;
const keys = [{ key: 'id', type: 'N', value: '42' }];

it('uses the real response parser for create, update and delete success', async () => {
  (invoke as jest.Mock).mockResolvedValueOnce(
    JSON.stringify({ status: 200, data: { created: true, skipped: false } }),
  );
  expect(await dynamoApi.createItem(connection, 'qa', keys)).toEqual({
    created: true,
    skipped: false,
  });
  (invoke as jest.Mock).mockResolvedValueOnce(JSON.stringify({ status: 200, data: {} }));
  await expect(
    dynamoApi.updateItem(connection, 'qa', keys, [{ key: 'nil', type: 'NULL', value: null }]),
  ).resolves.toEqual({});
  (invoke as jest.Mock).mockResolvedValueOnce(JSON.stringify({ status: 200, data: {} }));
  await expect(dynamoApi.deleteItem(connection, 'qa', keys)).resolves.toEqual({});
});

it('exposes a skipped creation without reporting it as created', async () => {
  (invoke as jest.Mock).mockResolvedValueOnce(
    JSON.stringify({ status: 200, data: { created: false, skipped: true } }),
  );
  expect(
    await dynamoApi.createItem(connection, 'qa', keys, { skipExisting: true, partitionKey: 'id' }),
  ).toEqual({ created: false, skipped: true });
});

it('surfaces backend validation errors through the real response parser', async () => {
  (invoke as jest.Mock).mockResolvedValueOnce(
    JSON.stringify({ status: 400, message: "attribute 'id' has no 'type'", data: null }),
  );
  await expect(dynamoApi.createItem(connection, 'qa', keys)).rejects.toThrow(
    "attribute 'id' has no 'type'",
  );
});
