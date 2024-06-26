import { networks } from 'tauri-plugin-system-info-api';
import { strToBytes } from './base64.ts';

const macAddress = (await networks()).find(
  ({ interface_name }) => interface_name === 'en0',
)?.mac_address_str;
const encoder = new TextEncoder();
const baseKey = await window.crypto.subtle.importKey(
  'raw',
  encoder.encode(macAddress),
  'PBKDF2',
  false,
  ['deriveKey'],
);
const iv = window.crypto.getRandomValues(new Uint8Array(16));
const cryptoKey = await window.crypto.subtle.deriveKey(
  {
    name: 'PBKDF2',
    salt: iv,
    iterations: 1000,
    hash: 'SHA-256',
  },
  baseKey,
  { name: 'AES-CBC', length: 256 },
  false,
  ['encrypt', 'decrypt'],
);
console.log('cryptoKey', {
  baseKey,
  cryptoKey,
  iv: Array.from(iv, byte => String.fromCodePoint(byte)).join(''),
});
const encryptValue = async (value: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);

  const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-CBC', iv }, cryptoKey, data);

  return Array.from(new Uint8Array(encrypted))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

const decryptValue = async (encryptedValue: string) => {
  const decoder = new TextDecoder();
  // const data = encryptedValue.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16));
  console.log('bytes', strToBytes(encryptedValue));
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    cryptoKey,
    strToBytes(encryptedValue),
  );

  return decoder.decode(decrypted);
};

export { encryptValue, decryptValue };
