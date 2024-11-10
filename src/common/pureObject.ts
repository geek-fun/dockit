export const pureObject = (obj: unknown) => JSON.parse(JSON.stringify(obj));
export const inputProps = {
  autocapitalize: 'off',
  autocomplete: 'off',
  // @ts-ignore
  spellCheck: false,
  autocorrect: 'off',
};
