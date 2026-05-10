import { invoke } from '@tauri-apps/api/core';
import type { MongoDBConnection } from '../store';

type MongoTestResult = {
  success: boolean;
  message: string;
  collections?: string[];
};

const buildConfig = (con: MongoDBConnection) => ({
  host: con.host,
  port: con.port,
  auth: con.auth,
  database: con.database,
  tls: con.tls,
});

export const mongoApi = {
  testConnection: async (con: MongoDBConnection): Promise<MongoTestResult> => {
    const config = buildConfig(con);
    try {
      return await invoke<MongoTestResult>('mongo_test_connection', { config });
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
