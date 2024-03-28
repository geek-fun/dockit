import Electron from 'electron';
import fetch from 'node-fetch';
import { CustomError, debug } from '../common';
import * as https from 'https';

type FetchApiOptions = {
  method: string;
  authorization: string;
  payload: string | undefined;
  ssl: boolean;
};

export type FetchApiInput = {
  method: string;
  url: string;
  options: FetchApiOptions;
};

const fetchApi: { [key: string]: (key: string, val: unknown) => unknown } = {
  fetch: async (url: string, { method, authorization, payload, ssl }: FetchApiOptions) => {
    const agent = url.startsWith('https')
      ? new https.Agent({
          rejectUnauthorized: ssl,
        })
      : undefined;
    try {
      const result = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', authorization } as unknown as Headers,
        body: payload,
        agent,
      });
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
