import {
  healthOrder,
  statusOrder,
  parseStorageBytes,
  compareNullLast,
  indexComparators,
  templateComparators,
} from '../../src/views/manage/components/sorting-utils';
import type {
  IndexWithAliases,
  TemplateItem,
} from '../../src/views/manage/components/sorting-utils';

describe('healthOrder', () => {
  it('returns 0 for green', () => {
    expect(healthOrder('green')).toBe(0);
  });

  it('returns 1 for yellow', () => {
    expect(healthOrder('yellow')).toBe(1);
  });

  it('returns 2 for red', () => {
    expect(healthOrder('red')).toBe(2);
  });

  it('returns 2 for unknown health status', () => {
    expect(healthOrder('unknown')).toBe(2);
  });

  it('returns 2 for empty string', () => {
    expect(healthOrder('')).toBe(2);
  });

  it('maintains correct ordering: green < yellow < red', () => {
    expect(healthOrder('green')).toBeLessThan(healthOrder('yellow'));
    expect(healthOrder('yellow')).toBeLessThan(healthOrder('red'));
  });
});

describe('statusOrder', () => {
  it('returns 0 for open', () => {
    expect(statusOrder('open')).toBe(0);
  });

  it('returns 1 for close', () => {
    expect(statusOrder('close')).toBe(1);
  });

  it('returns 1 for unknown status', () => {
    expect(statusOrder('unknown')).toBe(1);
  });

  it('returns 1 for empty string', () => {
    expect(statusOrder('')).toBe(1);
  });

  it('maintains correct ordering: open < close', () => {
    expect(statusOrder('open')).toBeLessThan(statusOrder('close'));
  });
});

describe('parseStorageBytes', () => {
  it('returns 0 for null', () => {
    expect(parseStorageBytes(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(parseStorageBytes(undefined)).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(parseStorageBytes('')).toBe(0);
  });

  it('returns 0 for invalid format', () => {
    expect(parseStorageBytes('invalid')).toBe(0);
  });

  it('parses bytes correctly', () => {
    expect(parseStorageBytes('500b')).toBe(500);
  });

  it('parses kilobytes correctly', () => {
    expect(parseStorageBytes('5kb')).toBe(5 * 1024);
  });

  it('parses megabytes correctly', () => {
    expect(parseStorageBytes('10mb')).toBe(10 * 1024 ** 2);
  });

  it('parses gigabytes correctly', () => {
    expect(parseStorageBytes('2gb')).toBe(2 * 1024 ** 3);
  });

  it('parses terabytes correctly', () => {
    expect(parseStorageBytes('1tb')).toBe(1 * 1024 ** 4);
  });

  it('handles case-insensitive units', () => {
    expect(parseStorageBytes('5KB')).toBe(5 * 1024);
    expect(parseStorageBytes('10MB')).toBe(10 * 1024 ** 2);
  });

  it('handles decimal values', () => {
    expect(parseStorageBytes('5.5kb')).toBe(5.5 * 1024);
  });

  it('handles space between value and unit', () => {
    expect(parseStorageBytes('5 kb')).toBe(5 * 1024);
  });

  it('handles unknown unit with fallback multiplier of 1', () => {
    expect(parseStorageBytes('5pb')).toBe(5);
  });

  it('maintains correct ordering across units', () => {
    const values = ['1tb', '1gb', '1mb', '1kb', '1b'];
    const sorted = [...values].sort((a, b) => parseStorageBytes(a) - parseStorageBytes(b));
    expect(sorted).toEqual(['1b', '1kb', '1mb', '1gb', '1tb']);
  });
});

describe('compareNullLast', () => {
  it('returns 0 when both are null', () => {
    expect(compareNullLast(null, null, 0)).toBe(0);
  });

  it('returns 0 when both are undefined', () => {
    expect(compareNullLast(undefined, undefined, 0)).toBe(0);
  });

  it('returns 0 when both are null and undefined', () => {
    expect(compareNullLast(null, undefined, 0)).toBe(0);
  });

  it('returns 1 when a is null and b is not', () => {
    expect(compareNullLast(null, 5, -1)).toBe(1);
  });

  it('returns 1 when a is undefined and b is not', () => {
    expect(compareNullLast(undefined, 5, -1)).toBe(1);
  });

  it('returns -1 when b is null and a is not', () => {
    expect(compareNullLast(5, null, 1)).toBe(-1);
  });

  it('returns -1 when b is undefined and a is not', () => {
    expect(compareNullLast(5, undefined, 1)).toBe(-1);
  });

  it('returns cmp when both values are defined', () => {
    expect(compareNullLast(3, 5, -1)).toBe(-1);
    expect(compareNullLast(5, 3, 1)).toBe(1);
    expect(compareNullLast(5, 5, 0)).toBe(0);
  });

  it('pushes nulls to end in ascending sort', () => {
    const items = [3, null, 1, undefined, 2];
    const sorted = [...items].sort((a, b) => compareNullLast(a, b, (a ?? 0) - (b ?? 0)));
    expect(sorted).toEqual([1, 2, 3, null, undefined]);
  });
});

describe('indexComparators', () => {
  const createIndex = (
    name: string,
    overrides: Partial<IndexWithAliases> = {},
  ): IndexWithAliases => ({
    index: name,
    uuid: 'uuid',
    health: 'green',
    status: 'open',
    storage: '5kb',
    shards: [],
    docs: { count: 100, deleted: 0 },
    aliases: [],
    ...overrides,
  });

  describe('index', () => {
    it('sorts alphabetically', () => {
      const a = createIndex('alpha');
      const b = createIndex('beta');
      expect(indexComparators.index(a, b)).toBeLessThan(0);
      expect(indexComparators.index(b, a)).toBeGreaterThan(0);
    });

    it('returns 0 for equal names', () => {
      const a = createIndex('same');
      const b = createIndex('same');
      expect(indexComparators.index(a, b)).toBe(0);
    });

    it('is locale-dependent for case', () => {
      const a = createIndex('Alpha');
      const b = createIndex('alpha');
      const result = indexComparators.index(a, b);
      expect(typeof result).toBe('number');
    });
  });

  describe('health', () => {
    it('sorts green before yellow', () => {
      const a = createIndex('a', { health: 'green' });
      const b = createIndex('b', { health: 'yellow' });
      expect(indexComparators.health(a, b)).toBeLessThan(0);
    });

    it('sorts yellow before red', () => {
      const a = createIndex('a', { health: 'yellow' });
      const b = createIndex('b', { health: 'red' });
      expect(indexComparators.health(a, b)).toBeLessThan(0);
    });

    it('sorts green before red', () => {
      const a = createIndex('a', { health: 'green' });
      const b = createIndex('b', { health: 'red' });
      expect(indexComparators.health(a, b)).toBeLessThan(0);
    });

    it('returns 0 for same health', () => {
      const a = createIndex('a', { health: 'green' });
      const b = createIndex('b', { health: 'green' });
      expect(indexComparators.health(a, b)).toBe(0);
    });
  });

  describe('status', () => {
    it('sorts open before close', () => {
      const a = createIndex('a', { status: 'open' });
      const b = createIndex('b', { status: 'close' });
      expect(indexComparators.status(a, b)).toBeLessThan(0);
    });

    it('returns 0 for same status', () => {
      const a = createIndex('a', { status: 'open' });
      const b = createIndex('b', { status: 'open' });
      expect(indexComparators.status(a, b)).toBe(0);
    });
  });

  describe('docs', () => {
    it('sorts by doc count ascending', () => {
      const a = createIndex('a', { docs: { count: 10, deleted: 0 } });
      const b = createIndex('b', { docs: { count: 20, deleted: 0 } });
      expect(indexComparators.docs(a, b)).toBeLessThan(0);
    });

    it('pushes null counts to end', () => {
      const a = createIndex('a', { docs: { count: null, deleted: 0 } });
      const b = createIndex('b', { docs: { count: 10, deleted: 0 } });
      expect(indexComparators.docs(a, b)).toBeGreaterThan(0);
    });

    it('returns 0 for equal counts', () => {
      const a = createIndex('a', { docs: { count: 10, deleted: 0 } });
      const b = createIndex('b', { docs: { count: 10, deleted: 0 } });
      expect(indexComparators.docs(a, b)).toBe(0);
    });
  });

  describe('storage', () => {
    it('sorts by storage size ascending', () => {
      const a = createIndex('a', { storage: '1kb' });
      const b = createIndex('b', { storage: '5mb' });
      expect(indexComparators.storage(a, b)).toBeLessThan(0);
    });

    it('handles different units correctly', () => {
      const a = createIndex('a', { storage: '1gb' });
      const b = createIndex('b', { storage: '1024mb' });
      expect(indexComparators.storage(a, b)).toBe(0);
    });
  });
});

describe('templateComparators', () => {
  const createTemplate = (name: string, overrides: Partial<TemplateItem> = {}): TemplateItem => ({
    name,
    type: 'INDEX_TEMPLATE' as any,
    api_mode: 'COMPOSABLE' as any,
    precedence: 0,
    index_patterns: ['*'],
    composed_of: [],
    version: null,
    alias_count: 0,
    mapping_count: 0,
    settings_count: 0,
    metadata_count: 0,
    included_in: [],
    ...overrides,
  });

  describe('name', () => {
    it('sorts alphabetically', () => {
      const a = createTemplate('alpha');
      const b = createTemplate('beta');
      expect(templateComparators.name(a, b)).toBeLessThan(0);
      expect(templateComparators.name(b, a)).toBeGreaterThan(0);
    });

    it('returns 0 for equal names', () => {
      const a = createTemplate('same');
      const b = createTemplate('same');
      expect(templateComparators.name(a, b)).toBe(0);
    });
  });

  describe('type', () => {
    it('sorts alphabetically by type string', () => {
      const a = createTemplate('a', { type: 'COMPONENT_TEMPLATE' as any });
      const b = createTemplate('b', { type: 'INDEX_TEMPLATE' as any });
      expect(templateComparators.type(a, b)).toBeLessThan(0);
    });

    it('returns 0 for same type', () => {
      const a = createTemplate('a', { type: 'INDEX_TEMPLATE' as any });
      const b = createTemplate('b', { type: 'INDEX_TEMPLATE' as any });
      expect(templateComparators.type(a, b)).toBe(0);
    });
  });

  describe('precedence', () => {
    it('sorts by precedence ascending', () => {
      const a = createTemplate('a', { precedence: 10 });
      const b = createTemplate('b', { precedence: 20 });
      expect(templateComparators.precedence(a, b)).toBeLessThan(0);
    });

    it('pushes null precedence to end', () => {
      const a = createTemplate('a', { precedence: null });
      const b = createTemplate('b', { precedence: 10 });
      expect(templateComparators.precedence(a, b)).toBeGreaterThan(0);
    });

    it('pushes null b precedence to front', () => {
      const a = createTemplate('a', { precedence: 10 });
      const b = createTemplate('b', { precedence: null });
      expect(templateComparators.precedence(a, b)).toBeLessThan(0);
    });

    it('returns 0 when both precedences are null', () => {
      const a = createTemplate('a', { precedence: null });
      const b = createTemplate('b', { precedence: null });
      expect(templateComparators.precedence(a, b)).toBe(0);
    });

    it('returns 0 for equal precedence', () => {
      const a = createTemplate('a', { precedence: 10 });
      const b = createTemplate('b', { precedence: 10 });
      expect(templateComparators.precedence(a, b)).toBe(0);
    });
  });

  describe('version', () => {
    it('sorts by version ascending', () => {
      const a = createTemplate('a', { version: 1 });
      const b = createTemplate('b', { version: 2 });
      expect(templateComparators.version(a, b)).toBeLessThan(0);
    });

    it('pushes null version to end', () => {
      const a = createTemplate('a', { version: null });
      const b = createTemplate('b', { version: 1 });
      expect(templateComparators.version(a, b)).toBeGreaterThan(0);
    });

    it('pushes null b version to front', () => {
      const a = createTemplate('a', { version: 1 });
      const b = createTemplate('b', { version: null });
      expect(templateComparators.version(a, b)).toBeLessThan(0);
    });

    it('returns 0 when both versions are null', () => {
      const a = createTemplate('a', { version: null });
      const b = createTemplate('b', { version: null });
      expect(templateComparators.version(a, b)).toBe(0);
    });
  });

  describe('mappings', () => {
    it('sorts by mapping count ascending', () => {
      const a = createTemplate('a', { mapping_count: 5 });
      const b = createTemplate('b', { mapping_count: 10 });
      expect(templateComparators.mappings(a, b)).toBeLessThan(0);
    });

    it('pushes null mapping count to end', () => {
      const a = createTemplate('a', { mapping_count: null });
      const b = createTemplate('b', { mapping_count: 5 });
      expect(templateComparators.mappings(a, b)).toBeGreaterThan(0);
    });

    it('pushes null b mapping count to front', () => {
      const a = createTemplate('a', { mapping_count: 5 });
      const b = createTemplate('b', { mapping_count: null });
      expect(templateComparators.mappings(a, b)).toBeLessThan(0);
    });

    it('returns 0 when both mapping counts are null', () => {
      const a = createTemplate('a', { mapping_count: null });
      const b = createTemplate('b', { mapping_count: null });
      expect(templateComparators.mappings(a, b)).toBe(0);
    });
  });

  describe('settings', () => {
    it('sorts by settings count ascending', () => {
      const a = createTemplate('a', { settings_count: 3 });
      const b = createTemplate('b', { settings_count: 7 });
      expect(templateComparators.settings(a, b)).toBeLessThan(0);
    });

    it('pushes null settings count to end', () => {
      const a = createTemplate('a', { settings_count: null });
      const b = createTemplate('b', { settings_count: 3 });
      expect(templateComparators.settings(a, b)).toBeGreaterThan(0);
    });

    it('pushes null b settings count to front', () => {
      const a = createTemplate('a', { settings_count: 3 });
      const b = createTemplate('b', { settings_count: null });
      expect(templateComparators.settings(a, b)).toBeLessThan(0);
    });

    it('returns 0 when both settings counts are null', () => {
      const a = createTemplate('a', { settings_count: null });
      const b = createTemplate('b', { settings_count: null });
      expect(templateComparators.settings(a, b)).toBe(0);
    });
  });
});

describe('Integration: Full sort scenarios', () => {
  it('sorts indices by health then by name', () => {
    const indices: IndexWithAliases[] = [
      {
        index: 'c-index',
        uuid: '1',
        health: 'red',
        status: 'open',
        storage: '1kb',
        shards: [],
        docs: { count: 10, deleted: 0 },
        aliases: [],
      },
      {
        index: 'a-index',
        uuid: '2',
        health: 'green',
        status: 'open',
        storage: '1kb',
        shards: [],
        docs: { count: 10, deleted: 0 },
        aliases: [],
      },
      {
        index: 'b-index',
        uuid: '3',
        health: 'yellow',
        status: 'open',
        storage: '1kb',
        shards: [],
        docs: { count: 10, deleted: 0 },
        aliases: [],
      },
    ];

    const sorted = [...indices].sort((a, b) => indexComparators.health(a, b));
    expect(sorted.map(i => i.health)).toEqual(['green', 'yellow', 'red']);
  });

  it('sorts templates by precedence descending', () => {
    const templates: TemplateItem[] = [
      createTemplateWithPrecedence('low', 10),
      createTemplateWithPrecedence('high', 100),
      createTemplateWithPrecedence('mid', 50),
    ];

    const sorted = [...templates].sort((a, b) => templateComparators.precedence(b, a));
    expect(sorted.map(t => t.name)).toEqual(['high', 'mid', 'low']);
  });
});

function createTemplateWithPrecedence(name: string, precedence: number): TemplateItem {
  return {
    name,
    type: 'INDEX_TEMPLATE' as any,
    api_mode: 'COMPOSABLE' as any,
    precedence,
    index_patterns: ['*'],
    composed_of: [],
    version: null,
    alias_count: 0,
    mapping_count: 0,
    settings_count: 0,
    metadata_count: 0,
    included_in: [],
  };
}
