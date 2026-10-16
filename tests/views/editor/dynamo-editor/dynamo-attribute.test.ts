import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import {
  isStructuredType,
  pickBinaryFileAsBase64,
  typeValueTemplate,
  validateStructuredValue,
} from '../../../../src/views/editor/dynamo-editor/utils/dynamo-attribute';

jest.mock('@tauri-apps/plugin-dialog', () => ({
  open: jest.fn(),
}));

jest.mock('@tauri-apps/plugin-fs', () => ({
  readFile: jest.fn(),
}));

const openMock = open as jest.Mock;
const readFileMock = readFile as jest.Mock;

describe('dynamo attribute helpers', () => {
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
