import { Store } from 'tauri-plugin-store-api';

const store = new Store('.store.dat');
const storeApi = {
  get: async <T>(key: string, defaultValue: T): Promise<T> => {
    // if (key === 'chats') {
    //   await store.set(key, null);
    //   await store.save();
    // }
    const val = (await store.get(key)) ?? defaultValue;
    return val as T;
  },

  set: async <T>(key: string, value: T) => {
    await store.set(key, value);
    await store.save();
  },
  getSecret: async <T>(key: string, defaultValue: T) => {
    const encryptedValue = (await store.get(key)) || defaultValue;
    return encryptedValue as T;
  },
  setSecret: async (key: string, value: unknown) => {
    await store.set(key, value);
    await store.save();
  },
};

export { storeApi };
