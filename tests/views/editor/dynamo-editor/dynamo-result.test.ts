import { buildDynamoKeys } from '../../../../src/views/editor/dynamo-editor/utils';

jest.mock('@tauri-apps/plugin-dialog', () => ({ open: jest.fn() }));
jest.mock('@tauri-apps/plugin-fs', () => ({ readFile: jest.fn() }));

describe('buildDynamoKeys', () => {
  it('serializes numeric keys as exact strings so IPC can carry them', () => {
    expect(buildDynamoKeys({ id: 9223372036854775808n, sk: 1 }, 'id', 'N', 'sk', 'N')).toEqual([
      { key: 'id', value: '9223372036854775808', type: 'N' },
      { key: 'sk', value: '1', type: 'N' },
    ]);
  });

  it('keeps text and binary keys unchanged', () => {
    expect(buildDynamoKeys({ pk: 'a', sk: 'YQ==' }, 'pk', 'S', 'sk', 'B')).toEqual([
      { key: 'pk', value: 'a', type: 'S' },
      { key: 'sk', value: 'YQ==', type: 'B' },
    ]);
  });

  it('omits missing keys and defaults the partition key type to text', () => {
    expect(buildDynamoKeys({ pk: 'a' }, 'pk', '', 'sk', 'S')).toEqual([
      { key: 'pk', value: 'a', type: 'S' },
    ]);
    expect(buildDynamoKeys({}, 'pk', 'S', 'sk', 'S')).toEqual([]);
  });
});
