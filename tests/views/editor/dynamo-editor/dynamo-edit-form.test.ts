import {
  buildDynamoEditForm,
  changedDynamoAttributes,
  removedDynamoAttributes,
  formatDynamoCell,
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

it('infers legacy row types when the response has no attribute metadata', () => {
  expect(
    buildDynamoEditForm(
      {
        id: 'a',
        text: '',
        integer: 42,
        large: 9223372036854775808n,
        enabled: false,
        nil: null,
        list: [1, false],
        map: { nested: null },
        absent: undefined,
      },
      {},
      [{ name: 'id', type: 'S' }],
    ),
  ).toEqual({
    keys: [{ key: 'id', type: 'S', value: 'a' }],
    attributes: [
      { key: 'text', type: 'S', value: '' },
      { key: 'integer', type: 'N', value: '42' },
      { key: 'large', type: 'N', value: '9223372036854775808' },
      { key: 'enabled', type: 'BOOL', value: false },
      { key: 'nil', type: 'NULL', value: null },
      { key: 'list', type: 'L', value: '[1,false]' },
      { key: 'map', type: 'M', value: '{"nested":null}' },
    ],
  });
});

it('prioritizes table key types and response metadata over inferred types', () => {
  expect(
    buildDynamoEditForm(
      { id: 42, tags: ['a'], legacy: null },
      { id: 'S', tags: 'SS', legacy: 'S' },
      [{ name: 'id', type: 'N' }],
    ),
  ).toEqual({
    keys: [{ key: 'id', type: 'N', value: '42' }],
    attributes: [
      { key: 'tags', type: 'SS', value: '["a"]' },
      { key: 'legacy', type: 'S', value: '' },
    ],
  });
});

it('includes new and retyped attributes while preserving the original draft', () => {
  const original = [{ key: 'value', type: 'S', value: '42' }];
  const retyped = { key: 'value', type: 'N', value: '42' };
  const added = { key: 'extra', type: 'BOOL', value: false };
  expect(changedDynamoAttributes([retyped, added], original)).toEqual([retyped, added]);
  expect(original).toEqual([{ key: 'value', type: 'S', value: '42' }]);
});

it('renders structured readback containing large integers without rounding or throwing', () => {
  expect(formatDynamoCell({ numbers: [1, 9223372036854775808n], nested: { enabled: false } })).toBe(
    '{"numbers":[1,9223372036854775808],"nested":{"enabled":false}}',
  );
});

it('reports dropped and renamed attributes for the update payload', () => {
  const original = [
    { key: 'keep', type: 'S', value: 'a' },
    { key: 'drop', type: 'S', value: 'b' },
    { key: 'rename', type: 'S', value: 'c' },
  ];
  const current = [
    { key: 'keep', type: 'S', value: 'a' },
    { key: 'renamed', type: 'S', value: 'c' },
  ];
  expect(removedDynamoAttributes(current, original)).toEqual(['drop', 'rename']);
  expect(changedDynamoAttributes(current, original)).toEqual([
    { key: 'renamed', type: 'S', value: 'c' },
  ]);
});

it('reports no removals for an unchanged or empty form', () => {
  const original = [{ key: 'value', type: 'S', value: 'a' }];
  expect(
    removedDynamoAttributes(
      original.map(attr => ({ ...attr })),
      original,
    ),
  ).toEqual([]);
  expect(removedDynamoAttributes([], [])).toEqual([]);
});
