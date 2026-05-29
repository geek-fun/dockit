import { invoke } from '@tauri-apps/api/core';
import { jsonify } from '../common';
import type { SearchConnection, DynamoDBConnection, MongoDBConnection } from '../store';

// ============================================================================
// Shared invoke - calls Rust invoke_capability command
// ============================================================================

export const invokeCapability = async (
  name: string,
  args: Record<string, unknown>,
  connectionConfig?: Record<string, unknown> | null,
): Promise<string> => {
  return await invoke<string>('invoke_capability', {
    name,
    args,
    connectionConfig: connectionConfig ?? null,
  });
};

// ============================================================================
// ES config builder
// Rust reads: host(string), port(number), authType(string), username(string),
//             password(string), apiKey(string), sslCertVerification(bool)
// ============================================================================

export const buildEsCapabilityConfig = (con: SearchConnection): Record<string, unknown> => ({
  host: con.host,
  port: con.port,
  authType: con.authType ?? '',
  username: con.username ?? '',
  password: con.password ?? '',
  apiKey: con.apiKey ?? '',
  sslCertVerification: con.sslCertVerification ?? false,
});

// ES response parser: extracts data from { status, data } envelope
export const parseEsCapabilityResponse = <T>(raw: string): T => {
  const parsed = jsonify.parse(raw) as { status: number; data: T };
  return parsed.data;
};

// ============================================================================
// DynamoDB config builder
// Rust reads: region(string), endpointUrl(string?), authKind(string?),
//             accessKeyId, secretAccessKey, sessionToken, profileName
// ============================================================================

export const buildDynamoCapabilityConfig = (con: DynamoDBConnection): Record<string, unknown> => {
  const auth = con.auth;
  const base: Record<string, unknown> = {
    region: con.region,
    endpointUrl: con.endpointUrl || null,
  };

  if (!auth) return base;

  switch (auth.kind) {
    case 'accessKey':
      return {
        ...base,
        authKind: 'accessKey',
        accessKeyId: auth.accessKeyId,
        secretAccessKey: auth.secretAccessKey,
      };
    case 'sso':
      return {
        ...base,
        authKind: 'sso',
        accessKeyId: auth.accessKeyId,
        secretAccessKey: auth.secretAccessKey,
        sessionToken: auth.sessionToken,
      };
    case 'assumeRole':
      return {
        ...base,
        authKind: 'assumeRole',
        accessKeyId: auth.accessKeyId,
        secretAccessKey: auth.secretAccessKey,
        sessionToken: auth.sessionToken,
      };
    case 'profile':
      return {
        ...base,
        authKind: 'profile',
        profileName: auth.profileName,
      };
  }
};

// DynamoDB response is direct JSON string, parse it
export const parseDynamoCapabilityResponse = <T>(raw: string): T => {
  return jsonify.parse(raw) as T;
};

// ============================================================================
// MongoDB config builder
// Rust reads via build_mongo_uri: authKind(string), uri(string), host(string),
//             port(number), tls(bool), database(string), username(string),
//             password(string), authSource(string), authMechanism(string)
// ============================================================================

export const buildMongoCapabilityConfig = (con: MongoDBConnection): Record<string, unknown> => {
  const auth = con.auth;
  const base: Record<string, unknown> = {
    host: con.host,
    port: con.port,
    tls: con.tls ?? false,
    database: con.activeDatabase || con.database || '',
  };

  if (!auth) {
    return { ...base, authKind: 'none' };
  }

  switch (auth.kind) {
    case 'none':
      return { ...base, authKind: 'none' };
    case 'uri':
      return {
        ...base,
        authKind: 'uri',
        uri: auth.uri,
      };
    case 'scram':
      return {
        ...base,
        authKind: 'scram',
        username: auth.username,
        password: auth.password,
        authSource: auth.authSource ?? 'admin',
        authMechanism: auth.authMechanism ?? '',
      };
  }
};

// MongoDB response is direct JSON string
export const parseMongoCapabilityResponse = <T>(raw: string): T => {
  return jsonify.parse(raw) as T;
};
