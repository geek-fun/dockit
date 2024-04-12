import Electron from 'electron';
import Store from 'electron-store';
import * as os from 'node:os';
import crypto from 'crypto';

export enum StoreApiMethods {
  GET = 'GET',
  SET = 'SET',
  GET_SECRET = 'GET_SECRET',
  SET_SECRET = 'SET_SECRET',
}
export type StoreApiInput = {
  method: StoreApiMethods;
  key: string;
  value: unknown;
};

const getMacAddress = (): string | undefined => {
  const networkInterfaces = os.networkInterfaces();

  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]!) {
      // Skip over non-ipv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.mac;
      }
    }
  }
};
const store = new Store();

const macAddress = getMacAddress();
const secretKey = crypto.createHash('sha256').update(macAddress).digest();
const iv = Buffer.from('dockitse'.repeat(2), 'utf8');
const encryptValue = (value: string) => {
  const cipher = crypto.createCipheriv('aes-256-cbc', secretKey, iv);
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};

const decryptValue = (encryptedValue: string) => {
  const decipher = crypto.createDecipheriv('aes-256-cbc', secretKey, iv);
  let decrypted = decipher.update(encryptedValue, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

const storeApi: { [key: string]: (key: string, val: unknown) => unknown } = {
  get: (key: string, defaultValue: unknown) => store.get(key, defaultValue),

  set: (key: string, value: unknown) => {
    store.set(key, value);
  },

  get_secret: (key: string) => {
    const encryptedValue = store.get(key, '');

    return encryptedValue ? JSON.parse(decryptValue(encryptedValue as string)) : undefined;
  },

  set_secret: (key: string, value: unknown) => {
    const encryptedValue = encryptValue(JSON.stringify(value));
    store.set(key, encryptedValue);
  },
};

export const registerStoreApiListener = (ipcMain: Electron.IpcMain) => {
  ipcMain.handle('storeAPI', (_, { method, key, value }: StoreApiInput) =>
    storeApi[method.toLowerCase()](key, value),
  );
};
