import Electron from 'electron';
import fetch from 'node-fetch';
import { CustomError, debug } from '../common';
import { HttpsProxyAgent } from 'https-proxy-agent';

type FetchApiOptions = {
  method: string;
  headers: {
    [key: string]: string | number;
  };
  agent: { ssl: boolean } | undefined;
  payload: string | undefined;
};

export type FetchApiInput = {
  method: string;
  url: string;
  options: FetchApiOptions;
};

const fetchApi: { [key: string]: (key: string, val: unknown) => unknown } = {
  fetch: async (
    url: string,
    { method, headers: inputHeaders, payload, agent: agentSslConf }: FetchApiOptions,
  ) => {
    const sslConfig = url.startsWith('https')
      ? { rejectUnauthorized: agentSslConf?.ssl }
      : undefined;
    const agent = process.env.https_proxy
      ? new HttpsProxyAgent(process.env.https_proxy, { ...sslConfig })
      : undefined;

    const headers = JSON.parse(
      JSON.stringify({ 'Content-Type': 'application/json', ...inputHeaders }),
    );
    try {
      const result = await fetch(url, { method, headers, body: payload, agent });
      if (result.ok) {
        return { status: result.status, data: await result.json() };
      }
      throw new CustomError(result.status, await result.text());
    } catch (e) {
      debug('error encountered while node-fetch fetch target:', e);
      return { status: e.status || 500, details: e.details || e.message };
    }
  },
};
export const registerFetchApiListener = (ipcMain: Electron.IpcMain) => {
  ipcMain.handle('fetchApi', (_, { method, url, options }: FetchApiInput) =>
    fetchApi[method.toLowerCase()](url, options),
  );
};
