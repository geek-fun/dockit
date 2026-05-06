import {
  applyTableFilter,
  findTable,
  upsertTable,
  extractFieldsFromMapping,
} from '../src/store/connectionStore';
import type {
  DynamoTableFilter,
  DynamoDBConnection,
  DynamoTableSummary,
} from '../src/store/connectionStore';

jest.mock('../src/lang', () => ({ lang: { t: (k: string) => k } }));
jest.mock('pinia', () => ({ defineStore: () => () => ({}) }));
jest.mock('../src/datasources', () => ({}));
jest.mock('../src/store/tabStore.ts', () => ({}));
jest.mock('../src/common', () => ({
  buildAuthHeader: jest.fn(),
  buildURL: jest.fn(),
  CustomError: class CustomError extends Error {},
  pureObject: jest.fn(),
}));
jest.mock('../src/common/monaco', () => ({
  SearchAction: {},
  transformToCurl: jest.fn(),
  configureDynamicOptions: jest.fn(),
}));

const ALL_TABLES = ['alpha', 'beta', 'gamma', 'prod-orders', 'prod-users', 'dev-cache'];

describe('applyTableFilter', () => {
  describe('kind: all (or undefined)', () => {
    it('returns all tables when filter is undefined', () => {
      expect(applyTableFilter(ALL_TABLES, undefined)).toEqual(ALL_TABLES);
    });

    it('returns all tables when kind is all', () => {
      expect(applyTableFilter(ALL_TABLES, { kind: 'all' })).toEqual(ALL_TABLES);
    });

    it('returns a new array (not the same reference)', () => {
      const result = applyTableFilter(ALL_TABLES, { kind: 'all' });
      expect(result).not.toBe(ALL_TABLES);
    });

    it('returns empty array for empty input', () => {
      expect(applyTableFilter([], { kind: 'all' })).toEqual([]);
    });
  });

  describe('kind: explicit', () => {
    it('returns only the listed table names', () => {
      const filter: DynamoTableFilter = { kind: 'explicit', tableNames: ['alpha', 'gamma'] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(['alpha', 'gamma']);
    });

    it('preserves original order from allTables', () => {
      const filter: DynamoTableFilter = { kind: 'explicit', tableNames: ['gamma', 'alpha'] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(['alpha', 'gamma']);
    });

    it('ignores names not present in allTables', () => {
      const filter: DynamoTableFilter = { kind: 'explicit', tableNames: ['alpha', 'nonexistent'] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(['alpha']);
    });

    it('returns empty array when no names match', () => {
      const filter: DynamoTableFilter = { kind: 'explicit', tableNames: ['no-match'] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual([]);
    });

    it('returns empty array when tableNames is empty', () => {
      const filter: DynamoTableFilter = { kind: 'explicit', tableNames: [] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual([]);
    });
  });

  describe('kind: exclude', () => {
    it('excludes the listed table names', () => {
      const filter: DynamoTableFilter = { kind: 'exclude', tableNames: ['alpha', 'gamma'] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual([
        'beta',
        'prod-orders',
        'prod-users',
        'dev-cache',
      ]);
    });

    it('returns all tables when tableNames is empty', () => {
      const filter: DynamoTableFilter = { kind: 'exclude', tableNames: [] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(ALL_TABLES);
    });

    it('returns empty array when all tables are excluded', () => {
      const filter: DynamoTableFilter = { kind: 'exclude', tableNames: [...ALL_TABLES] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual([]);
    });

    it('silently ignores names not present in allTables', () => {
      const filter: DynamoTableFilter = { kind: 'exclude', tableNames: ['nonexistent'] };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(ALL_TABLES);
    });
  });

  describe('kind: regex', () => {
    it('matches tables by regex pattern', () => {
      const filter: DynamoTableFilter = { kind: 'regex', pattern: '^prod-' };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(['prod-orders', 'prod-users']);
    });

    it('matches all tables with .*', () => {
      const filter: DynamoTableFilter = { kind: 'regex', pattern: '.*' };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(ALL_TABLES);
    });

    it('returns empty array when no tables match pattern', () => {
      const filter: DynamoTableFilter = { kind: 'regex', pattern: '^staging-' };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual([]);
    });

    it('returns empty array for invalid regex pattern', () => {
      const filter: DynamoTableFilter = { kind: 'regex', pattern: '[invalid(' };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual([]);
    });

    it('matches mid-string patterns', () => {
      const filter: DynamoTableFilter = { kind: 'regex', pattern: 'cache' };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual(['dev-cache']);
    });

    it('is case-sensitive', () => {
      const filter: DynamoTableFilter = { kind: 'regex', pattern: '^PROD-' };
      expect(applyTableFilter(ALL_TABLES, filter)).toEqual([]);
    });

    it('does not throw on unusual but syntactically valid patterns', () => {
      const filter: DynamoTableFilter = { kind: 'regex', pattern: '(a|b)+' };
      expect(() => applyTableFilter(ALL_TABLES, filter)).not.toThrow();
    });
  });
});

const filterSuggestions = (available: string[], selected: string[], query: string): string[] => {
  const q = query.trim().toLowerCase();
  const selectedSet = new Set(selected);
  return available.filter(name => !selectedSet.has(name) && (!q || name.toLowerCase().includes(q)));
};

describe('filterSuggestions', () => {
  const available = ['prod-orders', 'prod-users', 'dev-cache', 'staging-db'];

  it('returns all available when query is empty and none selected', () => {
    expect(filterSuggestions(available, [], '')).toEqual(available);
  });

  it('excludes already-selected names', () => {
    expect(filterSuggestions(available, ['prod-orders'], '')).toEqual([
      'prod-users',
      'dev-cache',
      'staging-db',
    ]);
  });

  it('filters by query substring case-insensitively', () => {
    expect(filterSuggestions(available, [], 'PROD')).toEqual(['prod-orders', 'prod-users']);
  });

  it('returns empty when query matches nothing', () => {
    expect(filterSuggestions(available, [], 'zzz')).toEqual([]);
  });

  it('combines selection exclusion and query filter', () => {
    expect(filterSuggestions(available, ['prod-orders'], 'prod')).toEqual(['prod-users']);
  });

  it('returns empty when all entries are selected', () => {
    expect(filterSuggestions(available, available, '')).toEqual([]);
  });
});

const PREVIEW_SAMPLE = 3;

const buildMatchPreview = (matched: string[]): string => {
  if (!matched.length) return 'No tables matched';
  const sample = matched.slice(0, PREVIEW_SAMPLE).join(', ');
  const suffix =
    matched.length > PREVIEW_SAMPLE ? `, +${matched.length - PREVIEW_SAMPLE} more` : '';
  return `${matched.length} tables matched: ${sample}${suffix}`;
};

describe('buildMatchPreview', () => {
  it('returns no-match message for empty array', () => {
    expect(buildMatchPreview([])).toBe('No tables matched');
  });

  it('shows all names when count is below the sample limit', () => {
    expect(buildMatchPreview(['a', 'b'])).toBe('2 tables matched: a, b');
  });

  it('shows exactly PREVIEW_SAMPLE names without truncation', () => {
    expect(buildMatchPreview(['a', 'b', 'c'])).toBe('3 tables matched: a, b, c');
  });

  it('truncates with +N more when count exceeds PREVIEW_SAMPLE', () => {
    expect(buildMatchPreview(['a', 'b', 'c', 'd', 'e'])).toBe('5 tables matched: a, b, c, +2 more');
  });

  it('handles a single match', () => {
    expect(buildMatchPreview(['only-one'])).toBe('1 tables matched: only-one');
  });
});

describe('findTable', () => {
  const tables: DynamoTableSummary[] = [{ name: 'orders' }, { name: 'users', status: 'ACTIVE' }];
  const conn = { tables } as unknown as DynamoDBConnection;

  it('returns matching table summary', () => {
    expect(findTable(conn, 'users')).toEqual({ name: 'users', status: 'ACTIVE' });
  });

  it('returns undefined for unknown name', () => {
    expect(findTable(conn, 'missing')).toBeUndefined();
  });

  it('returns undefined when tables list is empty', () => {
    const empty = { tables: [] } as unknown as DynamoDBConnection;
    expect(findTable(empty, 'orders')).toBeUndefined();
  });

  it('returns undefined when tables is absent', () => {
    const noTables = {} as unknown as DynamoDBConnection;
    expect(findTable(noTables, 'orders')).toBeUndefined();
  });
});

describe('upsertTable', () => {
  const existing: DynamoTableSummary[] = [
    { name: 'orders', status: 'ACTIVE' },
    { name: 'users', status: 'ACTIVE' },
  ];

  it('appends new table when name is not present', () => {
    const result = upsertTable(existing, { name: 'products' });
    expect(result).toHaveLength(3);
    expect(result.find(t => t.name === 'products')).toBeDefined();
  });

  it('merges updated fields for existing table', () => {
    const result = upsertTable(existing, { name: 'orders', status: 'UPDATING', itemCount: 42 });
    expect(result).toHaveLength(2);
    const updated = result.find(t => t.name === 'orders');
    expect(updated?.status).toBe('UPDATING');
    expect(updated?.itemCount).toBe(42);
  });

  it('does not mutate the original array', () => {
    const copy = [...existing];
    upsertTable(existing, { name: 'new-table' });
    expect(existing).toEqual(copy);
  });

  it('preserves other tables when upserting one', () => {
    const result = upsertTable(existing, { name: 'orders', status: 'DELETING' });
    const users = result.find(t => t.name === 'users');
    expect(users?.status).toBe('ACTIVE');
  });

  it('handles empty table list', () => {
    const result = upsertTable([], { name: 'first' });
    expect(result).toEqual([{ name: 'first' }]);
  });
});

describe('extractFieldsFromMapping', () => {
  it('extracts field names from a standard mapping', () => {
    const mapping = {
      'my-index': {
        mappings: {
          properties: {
            category: { type: 'keyword' },
            price: { type: 'float' },
            description: { type: 'text' },
          },
        },
      },
    };
    expect(extractFieldsFromMapping(mapping)).toEqual(['category', 'price', 'description']);
  });

  it('returns empty array for undefined mapping', () => {
    expect(extractFieldsFromMapping(undefined)).toEqual([]);
  });

  it('returns empty array for mapping with no properties', () => {
    const mapping = {
      'my-index': {
        mappings: {},
      },
    };
    expect(extractFieldsFromMapping(mapping)).toEqual([]);
  });

  it('returns empty array for empty mapping object', () => {
    expect(extractFieldsFromMapping({})).toEqual([]);
  });

  it('handles mapping with dynamic field but no properties', () => {
    const mapping = {
      'my-index': {
        mappings: {
          dynamic: true,
        },
      },
    };
    expect(extractFieldsFromMapping(mapping)).toEqual([]);
  });
});
