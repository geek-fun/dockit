const strToBytes = (base64: string) => {
  const binString = atob(base64);
  // @ts-ignore
  return Uint8Array.from(binString, m => m.codePointAt(0));
};

function bytesToBase64(bytes: Uint8Array) {
  const binString = Array.from(bytes, byte => String.fromCodePoint(byte)).join('');
  return btoa(binString);
}

const base64Encode = (str: string) => bytesToBase64(new TextEncoder().encode(str));
const base64Decode = (base64: string) => new TextDecoder().decode(strToBytes(base64));

export { strToBytes, base64Encode, base64Decode };
