export enum DatabaseType {
  ELASTICSEARCH = 'elasticsearch',
  DYNAMODB = 'dynamodb'
}

export interface BaseConnection {
  id?: string;
  name: string;
  type: DatabaseType;
}

export interface ElasticsearchConnection extends BaseConnection {
  type: DatabaseType.ELASTICSEARCH;
  host: string;
  port: number;
  username: string;
  password: string;
  indexName?: string;
  queryParameters: string;
  sslCertVerification: boolean;
}

export interface DynamoDBConnection extends BaseConnection {
  type: DatabaseType.DYNAMODB;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export type Connection = ElasticsearchConnection | DynamoDBConnection; 