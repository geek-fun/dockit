import JSONBig from 'json-bigint';

const jsonBig = JSONBig({
  useNativeBigInt: true,
});

export const jsonify = { stringify: jsonBig.stringify, parse: jsonBig.parse };
