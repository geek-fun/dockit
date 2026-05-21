import {
  DatabaseType,
  type Connection,
  type ElasticsearchConnection,
  type DynamoDBConnection,
  type MongoDBConnection,
} from '@/store/connectionStore';

const buildSearchConnectionConfig = (
  connection: ElasticsearchConnection,
): Record<string, unknown> => ({
  host: connection.host,
  port: connection.port,
  sslCertVerification: connection.sslCertVerification ?? false,
  authType: connection.authType ?? 'basic',
  username: connection.username ?? '',
  password: connection.password ?? '',
  apiKey: connection.apiKey ?? '',
});

const buildDynamoConnectionConfig = (connection: DynamoDBConnection): Record<string, unknown> => {
  const config: Record<string, unknown> = {
    region: connection.region,
    authKind: connection.auth.kind,
  };

  if (connection.auth.kind === 'accessKey') {
    config.accessKeyId = connection.auth.accessKeyId;
    config.secretAccessKey = connection.auth.secretAccessKey;
  } else if (connection.auth.kind === 'sso' || connection.auth.kind === 'assumeRole') {
    config.accessKeyId = connection.auth.accessKeyId;
    config.secretAccessKey = connection.auth.secretAccessKey;
    config.sessionToken = connection.auth.sessionToken;
  } else if (connection.auth.kind === 'profile') {
    config.profileName = connection.auth.profileName;
  }

  if (connection.endpointUrl) {
    config.endpointUrl = connection.endpointUrl;
  }

  return config;
};

const buildMongoConnectionConfig = (connection: MongoDBConnection): Record<string, unknown> => {
  const config: Record<string, unknown> = {
    host: connection.host,
    port: connection.port,
    tls: connection.tls ?? false,
    database: connection.database ?? '',
    authKind: connection.auth.kind,
  };

  if (connection.auth.kind === 'scram') {
    config.username = connection.auth.username;
    config.password = connection.auth.password;
    config.authSource = connection.auth.authSource ?? 'admin';
    config.authMechanism = connection.auth.authMechanism ?? '';
  }

  if (connection.auth.kind === 'uri') {
    config.uri = connection.auth.uri;
  }

  return config;
};

export const buildConnectionConfig = (connection: Connection): Record<string, unknown> => {
  if (
    connection.type === DatabaseType.ELASTICSEARCH ||
    connection.type === DatabaseType.OPENSEARCH ||
    connection.type === DatabaseType.EASYSEARCH
  ) {
    return buildSearchConnectionConfig(connection as ElasticsearchConnection);
  }

  if (connection.type === DatabaseType.DYNAMODB) {
    return buildDynamoConnectionConfig(connection as DynamoDBConnection);
  }

  return buildMongoConnectionConfig(connection as MongoDBConnection);
};
