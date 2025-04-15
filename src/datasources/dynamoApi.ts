import { DynamoDBConnection } from '../store';
import { tauriClient } from './ApiClients.ts';

const dynamoApi = {
  describeTable: async ({
    region,
    accessKeyId,
    secretAccessKey,
    tableName,
  }: DynamoDBConnection) => {
    const credentials = { region, access_key_id: accessKeyId, secret_access_key: secretAccessKey };
    const options = {
      table_name: tableName,
      operation: 'DESCRIBE_TABLE',
      payload: {},
    };
    const result = await tauriClient.invokeDynamoApi(credentials, options);
    const { status, message, data } = result;
    console.log('describeTable response:', result);
    if (status !== 200) {
      throw new Error(`Error: ${message}`);
    }
    return data;
  },
};

export { dynamoApi };
