import { jsonify } from '../../src/common';

describe('Unit test for jsonify', () => {
  it('should parse JSON5 string with bigInt to Object by jsonify.parse5 ', () => {
    const text = '{ uid: 1308537228663099396 }';
    const parsed = jsonify.parse5(text);

    expect(parsed).toEqual({ uid: BigInt('1308537228663099396') });
  });

  it('should stringify the Object with bigInt to correct JSON string by jsonify.string5', () => {
    const obj = { uid: BigInt('1308537228663099396') };
    const parsed = jsonify.string5(obj);

    expect(parsed).toEqual('{uid:1308537228663099396}');
  });

  it('should parse JSON string with bigInt to Object by jsonify.parse', () => {
    const text = '{ "uid": 1308537228663099396 }';
    const parsed = jsonify.parse(text);

    expect(parsed).toEqual({ uid: BigInt('1308537228663099396') });
  });

  it('should stringify the Object with bigInt to correct JSON string by jsonify.stringify', () => {
    const obj = { uid: BigInt('1308537228663099396') };
    const parsed = jsonify.stringify(obj);

    expect(parsed).toEqual('{"uid":1308537228663099396}');
  });

  it('should format the JSON5 object to string with expected indent', () => {
    const text = `{ uid: 1308537228663099396 }`;
    const parsed = jsonify.stringify(jsonify.parse5(text), null, 2);

    expect(parsed).toEqual('{\n  "uid": 1308537228663099396\n}');
  });

  it('should format the JSON5 string to expected format', () => {
    const text = `{
  // comments
  unquoted: 'and you can quote me on that',
  singleQuotes: 'I can use "double quotes" here',
  lineBreaks: "Look, Mom! \\
No \\\\n's!",
  hexadecimal: 0xdecaf,
  leadingDecimalPoint: .8675309, andTrailing: 8675309.,
  positiveSign: +1,
  trailingComma: 'in objects', andIn: ['arrays',],
  "backwardsCompatible": "with JSON",
   uid: 1308537228663099396
}`;
    const parsed = jsonify.string5(jsonify.parse5(text), null, 2);
    expect(parsed).toEqual(`{
  unquoted: 'and you can quote me on that',
  singleQuotes: 'I can use "double quotes" here',
  lineBreaks: "Look, Mom! No \\\\n's!",
  hexadecimal: 912559,
  leadingDecimalPoint: 0.8675309,
  andTrailing: 8675309,
  positiveSign: 1,
  trailingComma: 'in objects',
  andIn: [
    'arrays',
  ],
  backwardsCompatible: 'with JSON',
  uid: 1308537228663099396,
}`);
  });
});
