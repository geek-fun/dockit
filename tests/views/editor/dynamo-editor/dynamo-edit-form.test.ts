import {
  buildDynamoEditForm,
  changedDynamoAttributes,
} from '../../../../src/views/editor/dynamo-editor/utils';

jest.mock('@tauri-apps/plugin-dialog', () => ({ open: jest.fn() }));
jest.mock('@tauri-apps/plugin-fs', () => ({ readFile: jest.fn() }));

const item = {
  pk: 'a',
  sk: 1,
  text: '',
  number: 9223372036854775808n,
  enabled: false,
  binary: 'aGVsbG8=',
  nil: null,
  strings: ['a', ''],
  numbers: [1, 9223372036854775808n],
  binaries: [''],
  list: [],
  map: { nested: true },
  absent: undefined,
};
const types = {
  text: 'S',
  number: 'N',
  enabled: 'BOOL',
  binary: 'B',
  nil: 'NULL',
  strings: 'SS',
  numbers: 'NS',
  binaries: 'BS',
  list: 'L',
  map: 'M',
};

it('preserves all DynamoDB types and large numbers in the shared edit form for both entry points', () => {
  const form = buildDynamoEditForm(item, types, [
    { name: 'pk', type: 'S' },
    { name: 'sk', type: 'N' },
  ]);
  expect(form.keys).toEqual([
    { key: 'pk', type: 'S', value: 'a' },
    { key: 'sk', type: 'N', value: '1' },
  ]);
  expect(Object.fromEntries(form.attributes.map(attr => [attr.key, attr.type]))).toEqual(types);
  expect(form.attributes.find(attr => attr.key === 'number')?.value).toBe('9223372036854775808');
  expect(form.attributes.find(attr => attr.key === 'numbers')?.value).toBe(
    '[1,9223372036854775808]',
  );
  expect(form.attributes.find(attr => attr.key === 'nil')?.value).toBeNull();
  expect(form.attributes.find(attr => attr.key === 'enabled')?.value).toBe(false);
  expect(form.attributes.find(attr => attr.key === 'absent')).toBeUndefined();
});

it('does not rewrite untouched attributes or issue empty updates for key-only items', () => {
  const original = [
    { key: 'document', type: 'M', value: '{"nested":"binary-or-set"}' },
    { key: 'flag', type: 'BOOL', value: false },
  ];
  expect(
    changedDynamoAttributes(
      original.map(attr => ({ ...attr })),
      original,
    ),
  ).toEqual([]);
  expect(changedDynamoAttributes([], [])).toEqual([]);
  const changed = { key: 'flag', type: 'BOOL', value: true };
  expect(changedDynamoAttributes([original[0], changed], original)).toEqual([changed]);
});
