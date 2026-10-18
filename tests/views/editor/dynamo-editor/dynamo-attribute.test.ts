import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import {
  isStructuredType,
  pickBinaryFileAsBase64,
  resolveTableKeyLabels,
  typeValueTemplate,
  validateStructuredValue,
  validateAttributeValue,
  defaultAttributeValue,
} from '../../../../src/views/editor/dynamo-editor/utils';

jest.mock('@tauri-apps/plugin-dialog', () => ({
  open: jest.fn(),
}));

jest.mock('@tauri-apps/plugin-fs', () => ({
  readFile: jest.fn(),
}));

const openMock = open as jest.Mock;
const readFileMock = readFile as jest.Mock;

describe('dynamo attribute helpers', () => {
  it.each(['S', 'B'])('initializes %s as an empty value', type => {
    expect(defaultAttributeValue(type)).toBe('');
  });

  it.each([
    ['N', 0, false, null],
    ['N', Infinity, false, { kind: 'shape' }],
    ['N', false, false, { kind: 'shape' }],
    ['S', 42, false, { kind: 'shape' }],
    ['BOOL', 'false', false, { kind: 'shape' }],
    ['B', false, false, { kind: 'shape' }],
    ['B', 'YQ==', true, null],
    ['B', ' ', true, { kind: 'shape' }],
    ['NULL', null, true, { kind: 'required' }],
    ['UNKNOWN', 'value', false, { kind: 'shape' }],
  ] as const)('validates %s value %p with key=%p', (type, value, isKey, expected) => {
    expect(validateAttributeValue(type, value, isKey)).toEqual(expected);
  });

  it('accepts exact large integers in numeric sets', () => {
    expect(validateStructuredValue('NS', '[9223372036854775808,1,"2.5"]')).toBeNull();
    expect(validateStructuredValue('NS', '[true]')).toEqual({ kind: 'shape' });
  });

  it('allows empty non-key values while requiring a numeric value', () => {
    expect(validateAttributeValue('S', '')).toBeNull();
    expect(validateAttributeValue('B', '')).toBeNull();
    expect(validateAttributeValue('NULL', null)).toBeNull();
    expect(validateAttributeValue('N', null)).toEqual({ kind: 'required' });
  });

  it('recognizes structured types and their templates', () => {
    expect(isStructuredType('SS')).toBe(true);
    expect(isStructuredType('N')).toBe(false);
    expect(typeValueTemplate('NS')).toBe('[1, 2, 3]');
    expect(typeValueTemplate('S')).toBe('');
  });

  describe('validateStructuredValue', () => {
    it('accepts a map and rejects non-objects', () => {
      expect(validateStructuredValue('M', '{"a": 1}')).toBeNull();
      expect(validateStructuredValue('M', '[1]')).toEqual({ kind: 'shape' });
      expect(validateStructuredValue('M', 'null')).toEqual({ kind: 'shape' });
    });

    it('accepts any list and rejects a non-array', () => {
      expect(validateStructuredValue('L', '[1, "a", true, {"k": 1}]')).toBeNull();
      expect(validateStructuredValue('L', '{"a": 1}')).toEqual({ kind: 'shape' });
    });

    it('rejects empty sets', () => {
      expect(validateStructuredValue('SS', '[]')).toEqual({ kind: 'emptySet' });
      expect(validateStructuredValue('NS', '[]')).toEqual({ kind: 'emptySet' });
      expect(validateStructuredValue('BS', '[]')).toEqual({ kind: 'emptySet' });
    });

    it('checks string, number, and base64 set items', () => {
      expect(validateStructuredValue('SS', '["a", "b"]')).toBeNull();
      expect(validateStructuredValue('SS', '["a", 1]')).toEqual({ kind: 'shape' });

      expect(validateStructuredValue('NS', '[1, "2.5"]')).toBeNull();
      expect(validateStructuredValue('NS', '[" "]')).toEqual({ kind: 'shape' });
      expect(validateStructuredValue('NS', '["nope"]')).toEqual({ kind: 'shape' });

      expect(validateStructuredValue('BS', '["aGVsbG8="]')).toBeNull();
      expect(validateStructuredValue('BS', '[" aGVsbG8= "]')).toBeNull();
      expect(validateStructuredValue('BS', '["!!!"]')).toEqual({ kind: 'shape' });
      expect(validateStructuredValue('BS', '[1]')).toEqual({ kind: 'shape' });
    });

    it('reports invalid JSON with the parser reason', () => {
      const issue = validateStructuredValue('L', '{');
      expect(issue?.kind).toBe('syntax');
      if (issue?.kind === 'syntax') expect(issue.reason.length).toBeGreaterThan(0);
    });

    // DynamoDB rejects empty sets but allows empty string/binary values inside a set
    // (verified against a local DynamoDB: SS ["a",""] and BS [""] are accepted).
    it('allows empty values inside a set but not an empty set', () => {
      expect(validateStructuredValue('SS', '["a", ""]')).toBeNull();
      expect(validateStructuredValue('BS', '[""]')).toBeNull();
      expect(validateStructuredValue('SS', '[]')).toEqual({ kind: 'emptySet' });
      expect(validateStructuredValue('BS', '[]')).toEqual({ kind: 'emptySet' });
    });

    it('rejects numbers JSON.parse turned into Infinity', () => {
      expect(validateStructuredValue('NS', '[1e400]')).toEqual({ kind: 'shape' });
      expect(validateStructuredValue('L', '[1e400]')).toEqual({ kind: 'shape' });
      expect(validateStructuredValue('M', '{"a": -1e400}')).toEqual({ kind: 'shape' });
    });

    // Samples cross-checked against the Rust `general_purpose::STANDARD` decoder used by
    // convert_json_to_attr_value: a value this validator accepts must not yield a 400 later.
    it.each([
      ['aGVsbG8=', true],
      ['abcd', true],
      ['abc=', true],
      ['YWJjZA==', true],
      [' aGVsbG8= ', true],
      ['aGVsbG8', false],
      ['abc', false],
      ['ab==', false],
      ['a==', false],
      ['aGVsbG9=', false],
      ['====', false],
      ['aGVsbG8=extra', false],
      ['!!!', false],
      ['', true],
    ])('base64 sample %p is accepted: %p', (sample, accepted) => {
      const text = JSON.stringify([sample]);
      expect(validateStructuredValue('BS', text)).toEqual(accepted ? null : { kind: 'shape' });
    });

    // Samples cross-checked against the Rust i64-then-f64 parse in json_number_to_string.
    it.each([
      ['42', true],
      ['42.5', true],
      [' 7 ', true],
      ['+5', true],
      ['.5', true],
      ['5.', true],
      ['1e2', true],
      ['0x10', false],
      ['1_000', false],
      ['Infinity', false],
      ['NaN', false],
      ['', false],
      [' ', false],
    ])('numeric string sample %p is accepted: %p', (sample, accepted) => {
      const text = JSON.stringify([sample]);
      expect(validateStructuredValue('NS', text)).toEqual(accepted ? null : { kind: 'shape' });
    });
  });

  describe('resolveTableKeyLabels', () => {
    it('derives both labels from the table key schema', () => {
      const labels = resolveTableKeyLabels({
        partitionKey: { name: 'pk' },
        sortKey: { name: 'sk' },
      });

      expect(labels).toEqual({
        partitionKeyName: 'pk',
        sortKeyName: 'sk',
        partitionKeyLabel: 'pk  (Partition Key):',
        sortKeyLabel: 'sk (Sort Key):',
      });
    });

    it('renders only the partition key when there is no sort key', () => {
      const labels = resolveTableKeyLabels({ partitionKey: { name: 'pk' } });

      expect(labels.partitionKeyName).toBe('pk');
      expect(labels.partitionKeyLabel).toBe('pk  (Partition Key):');
      expect(labels.sortKeyName).toBeUndefined();
      expect(labels.sortKeyLabel).toBeUndefined();
    });

    it('renders nothing when the table metadata is missing', () => {
      expect(resolveTableKeyLabels()).toEqual({
        partitionKeyName: undefined,
        sortKeyName: undefined,
        partitionKeyLabel: undefined,
        sortKeyLabel: undefined,
      });
      expect(resolveTableKeyLabels({})).toEqual(resolveTableKeyLabels());
    });

    it('ignores a key entry without a name', () => {
      const labels = resolveTableKeyLabels({ partitionKey: {}, sortKey: { name: 'sk' } });

      expect(labels.partitionKeyLabel).toBeUndefined();
      expect(labels.partitionKeyName).toBeUndefined();
      expect(labels.sortKeyName).toBe('sk');
    });
  });

  describe('pickBinaryFileAsBase64', () => {
    beforeEach(() => {
      openMock.mockReset();
      readFileMock.mockReset();
    });

    it('returns null when the dialog is cancelled or multi-select', async () => {
      openMock.mockResolvedValue(null);
      expect(await pickBinaryFileAsBase64()).toBeNull();

      openMock.mockResolvedValue(['a.txt']);
      expect(await pickBinaryFileAsBase64()).toBeNull();
      expect(readFileMock).not.toHaveBeenCalled();
    });

    it('base64-encodes the selected file, including chunks past 32kb', async () => {
      const bytes = new Uint8Array(0x8001);
      bytes[0] = 65;
      bytes[0x8000] = 66;
      openMock.mockResolvedValue('/tmp/blob.bin');
      readFileMock.mockResolvedValue(bytes);

      await expect(pickBinaryFileAsBase64()).resolves.toBe(Buffer.from(bytes).toString('base64'));
      expect(readFileMock).toHaveBeenCalledWith('/tmp/blob.bin');
    });
  });
});
