import { Store } from 'tauri-plugin-store-api';
import { BaseDirectory, exists, readTextFile } from '@tauri-apps/api/fs';

const store = new Store('.store.dat');

const migrateElectronStore = async () => {
  const isExists = await exists('config.json', { dir: BaseDirectory.AppData });
  const isMigrated = await store.get('migrated');
  if (!isExists || isMigrated) {
    console.log('no need to migrate', { isExists, isMigrated });
    return;
  }
  //read file
  const { chats, connections } = JSON.parse(
    await readTextFile('config.json', { dir: BaseDirectory.AppData }),
  );
  await store.set('chats', chats);
  await store.set('connections', connections);
  await store.set('migrated', true);
  await store.save();
};

migrateElectronStore()
  .then(() => console.log('migrated'))
  .catch(err => console.error('migrate error', err));

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
