import { invoke, InvokeArgs } from '@tauri-apps/api/core';
import { jsonify } from '../common';

export type ApiClientError = {
  status: number;
  message: string;
  details?: string;
};

export const createApiClientError = (
  status: number,
  message: string,
  details?: string,
): ApiClientError => ({
  status,
  message,
  details,
});

type ApiClientResponse = {
  status: number;
  message: string;
  data: { [key: string]: unknown };
};
export type AwsCredentials = {
  access_key_id: string;
  secret_access_key: string;
  region: string;
};
export type DynamoApiOptions = {
  table_name: string;
  operation: string;
  payload: unknown;
};

export const tauriClient = {
  invoke: async (command: string, payload: unknown): Promise<ApiClientResponse> => {
    try {
      const result = await invoke<string>(command, payload as InvokeArgs);
      const { status, message, data } = jsonify.parse(result) as ApiClientResponse;
      return { status, message, data };
    } catch (err) {
      const { status, message, data } = jsonify.parse(err as string) as ApiClientResponse;
      throw createApiClientError(status, message, jsonify.stringify(data));
    }
  },

  invokeDynamoApi: async (
    credentials: AwsCredentials,
    options: DynamoApiOptions,
  ): Promise<ApiClientResponse> => {
    try {
      const result = await invoke<string>('dynamo_api', { credentials, options });
      const { status, message, data } = jsonify.parse(result) as ApiClientResponse;
      return { status, message, data };
    } catch (err) {
      const { status, message, data } = jsonify.parse(err as string) as ApiClientResponse;
      throw createApiClientError(status, message, jsonify.stringify(data));
    }
  },
};
