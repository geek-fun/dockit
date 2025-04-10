import { jsonify } from './jsonify.ts';

export const pureObject = (obj: unknown) => jsonify.parse(jsonify.stringify(obj));

export const inputProps = {
  autocapitalize: 'off',
  autocomplete: 'off',
  // @ts-ignore
  spellCheck: false,
  autocorrect: 'off',
};
