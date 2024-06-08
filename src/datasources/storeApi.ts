import { Store } from 'tauri-plugin-store-api';

const store = new Store('.store.dat');

const storeApi = {
  get: async (key: string, defaultValue: unknown) => {
    return store.get(key) || defaultValue;
  },

  set: async (key: string, value: unknown) => {
    return store.set(key, value);
  },
  getSecret: async (key: string, defaultValue: unknown) => {
    const encryptedValue = store.get(key) || defaultValue;

    return encryptedValue;
  },
  setSecret: async (key: string, value: unknown) => {
    const encryptedValue = value;
    store.set(key, encryptedValue);
  },
};

export { storeApi };
