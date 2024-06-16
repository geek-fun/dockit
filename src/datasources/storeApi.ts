import { Store } from 'tauri-plugin-store-api';

const store = new Store('.store.dat');

const storeApi = {
  get: async <T>(key: string, defaultValue: T): Promise<T> => {
    const val = (await store.get(key)) ?? defaultValue;
    console.log('storeApi.get', { key, defaultValue, val, vals: await store.get(key) });
    return val as T;
  },

  set: async <T>(key: string, value: T) => {
    console.log('storeApi.set', { key, value });
    await store.set(key, value);
    await store.save();
  },
  getSecret: async <T>(key: string, defaultValue: T) => {
    const encryptedValue = (await store.get(key)) || defaultValue;
    console.log('storeApi.getSecret', { key, encryptedValue });
    return encryptedValue as T;
  },
  setSecret: async (key: string, value: unknown) => {
    const encryptedValue = value;
    console.log('storeApi.setSecret', { key, encryptedValue });
    await store.set(key, encryptedValue);
    await store.save();
  },
};

export { storeApi };
