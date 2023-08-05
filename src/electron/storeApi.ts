import Electron from 'electron';
import Store from 'electron-store';

export enum StoreApiMethods {
  GET = 'GET',
  SET = 'SET',
}
export type StoreApiInput = {
  method: StoreApiMethods;
  key: string;
  value: unknown;
};
const store = new Store();

const storeApi: { [key: string]: (key: string, val: unknown) => unknown } = {
  get: (key: string, defaultValue: unknown) => store.get(key, defaultValue),

  set: (key: string, value: unknown) => {
    store.set(key, value);
  },
};
export const registerStoreApiListener = (ipcMain: Electron.IpcMain) => {
  ipcMain.handle('storeAPI', (_, { method, key, value }: StoreApiInput) =>
    storeApi[method.toLowerCase()](key, value),
  );
};
