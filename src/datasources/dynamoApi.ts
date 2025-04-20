import { DynamoDBConnection } from '../store';
import { tauriClient } from './ApiClients.ts';

export type KeySchema = {
  attributeName: string;
  keyType: string; // Values like "HASH" or "RANGE"
};

export type AttributeDefinition = {
  attributeName: string;
  attributeType: string; // Values like "S", "N", "B", etc.
};

export enum DynamoIndexType {
  GSI = 'GSI',
  LSI = 'LSI',
}

export type DynamoIndex = {
  type: DynamoIndexType.GSI;
  name: string;
  status?: string;
  keySchema: KeySchema[];
  provisionedThroughput?: {
    readCapacityUnits?: number;
    writeCapacityUnits?: number;
  };
};

// Main table info type
export type DynamoDBTableInfo = {
  id: string;
  name: string;
  status: string;
  itemCount: number;
  sizeBytes: number;
  keySchema: KeySchema[]; // Based on connection store usage
  attributeDefinitions?: AttributeDefinition[];
  indices?: DynamoIndex[];
  creationDateTime?: string;
};

const dynamoApi = {
  describeTable: async ({
    region,
    accessKeyId,
    secretAccessKey,
    tableName,
  }: DynamoDBConnection): Promise<DynamoDBTableInfo> => {
    const credentials = { region, access_key_id: accessKeyId, secret_access_key: secretAccessKey };
    const options = {
      table_name: tableName,
      operation: 'DESCRIBE_TABLE',
      payload: {},
    };
    const result = await tauriClient.invokeDynamoApi(credentials, options);
    const { status, message, data } = result;
    if (status !== 200) {
      throw new Error(`Error: ${message}`);
    }
    return data as DynamoDBTableInfo;
  },
};

export { dynamoApi };
