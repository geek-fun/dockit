import JSON5 from 'json5';
import JSONBig from 'json-bigint';
import { get } from 'lodash';

type Replacer = null | Array<number | string> | ((this: any, key: string, value: any) => any);

const jsonBig = JSONBig({
  useNativeBigInt: true,
});

const bigIntReplacer = (originalReplacer: unknown, key: string, value: unknown) => {
  if (Array.isArray(originalReplacer) && !originalReplacer.includes(key)) {
    return;
  }

  let newVal = value;

  if (typeof originalReplacer === 'function') {
    newVal = originalReplacer(key, value);
  }

  if (typeof newVal === 'bigint') {
    newVal = `${newVal}n`;
  }

  return newVal;
};

const bigIntReviver = (originalReviver: unknown, key: string, value: unknown) => {
  if (Array.isArray(originalReviver) && !originalReviver.includes(key)) {
    return;
  }
  let newVal = value;
  if (typeof originalReviver === 'function') {
    newVal = originalReviver(key, value);
  }

  const bigIntVal = get(/^([-+]?\d+)n$/.exec(String(value)), '[1]', undefined);
  if (bigIntVal) {
    newVal = BigInt(bigIntVal);
  }

  return newVal;
};
const bigIntStringify = (text: string) =>
  text.replace(/([-+]?\d+)\b/g, match => {
    return Number.isSafeInteger(Number(match)) ? match : `"${match}n"`;
  });

const bigIntParse = (text: string) => {
  return text.replace(/(?<=([:,\[]\s*))["']([-+]?\d+)n["']/g, '$2');
};

export const string5 = (value: any, replacer?: Replacer, space?: string | number): string =>
  bigIntParse(JSON5.stringify(value, (key, value) => bigIntReplacer(replacer, key, value), space));

export const parse5 = (text: string, reviver?: (this: any, key: string, value: any) => any) =>
  JSON5.parse(bigIntStringify(text), (key, value: string) => bigIntReviver(reviver, key, value));

//
// const stringify = (value: any, replacer?: Replacer, space?: string | number) =>
//   JSON.stringify(value, (key, value) => bigIntReplacer(replacer, key, value), space);
//
// const parse = (text: string, reviver?: (this: any, key: string, value: any) => any) =>
//   JSON.parse(text, (key, value) => bigIntReviver(reviver, key, value));

export const jsonify = { stringify: jsonBig.stringify, parse: jsonBig.parse, parse5, string5 };
