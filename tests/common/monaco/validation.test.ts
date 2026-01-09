import {
  validatePartiql,
  createDebouncedValidator,
  PARTIQL_VALIDATION_OWNER_CONST,
} from '../../../src/common/monaco/partiql/validation';

import {
  validateEs,
  ES_VALIDATION_OWNER_CONST,
} from '../../../src/common/monaco/searchdsl/validation';

// Mock monaco-editor
jest.mock('monaco-editor', () => ({
  self: { MonacoEnvironment: {} },
  editor: {
    IModel: {},
    ITextModel: {},
    setModelMarkers: jest.fn(),
  },
  Range: class MockRange {
    constructor(
      public startLineNumber: number,
      public startColumn: number,
      public endLineNumber: number,
      public endColumn: number
    ) {}
  },
  Position: {},
  MarkerSeverity: {
    Error: 8,
    Warning: 4,
    Info: 2,
    Hint: 1,
  },
  typescript: {
    typescriptDefaults: {
      setEagerModelSync: jest.fn(),
    },
  },
  languages: {
    register: jest.fn(),
    setMonarchTokensProvider: jest.fn(),
    setLanguageConfiguration: jest.fn(),
    registerCompletionItemProvider: jest.fn(),
    registerHoverProvider: jest.fn(),
    CodeLens: {},
  },
}));

describe('PartiQL Validation', () => {
  describe('validatePartiql', () => {
    it('should return no errors for valid SELECT statement', () => {
      const content = 'SELECT * FROM "users"';
      const result = validatePartiql(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should return no errors for valid SELECT statement with semicolon', () => {
      const content = 'SELECT * FROM "users";';
      const result = validatePartiql(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for SELECT without FROM', () => {
      const content = 'SELECT *';
      const result = validatePartiql(content);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('FROM');
    });

    it('should return no errors for valid INSERT statement', () => {
      const content = 'INSERT INTO "users" VALUE {\'pk\': \'user1\', \'name\': \'John\'}';
      const result = validatePartiql(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for INSERT without INTO', () => {
      const content = 'INSERT "users" VALUE {}';
      const result = validatePartiql(content);
      expect(result.errors.some(e => e.message.includes('INTO'))).toBe(true);
    });

    it('should return error for INSERT without VALUE', () => {
      const content = 'INSERT INTO "users"';
      const result = validatePartiql(content);
      expect(result.errors.some(e => e.message.includes('VALUE'))).toBe(true);
    });

    it('should return no errors for valid UPDATE statement', () => {
      const content = 'UPDATE "users" SET name = \'Jane\' WHERE pk = \'user1\'';
      const result = validatePartiql(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for UPDATE without SET', () => {
      const content = 'UPDATE "users" WHERE pk = \'user1\'';
      const result = validatePartiql(content);
      expect(result.errors.some(e => e.message.includes('SET'))).toBe(true);
    });

    it('should return no errors for valid DELETE statement', () => {
      const content = 'DELETE FROM "users" WHERE pk = \'user1\'';
      const result = validatePartiql(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for DELETE without FROM', () => {
      const content = 'DELETE "users" WHERE pk = \'user1\'';
      const result = validatePartiql(content);
      expect(result.errors.some(e => e.message.includes('FROM'))).toBe(true);
    });

    it('should return error for unclosed single quote', () => {
      const content = 'SELECT * FROM "users" WHERE pk = \'value';
      const result = validatePartiql(content);
      expect(result.errors.some(e => e.message.includes('single quote'))).toBe(true);
    });

    it('should return error for unclosed double quote', () => {
      const content = 'SELECT * FROM "users WHERE pk = \'value\'';
      const result = validatePartiql(content);
      expect(result.errors.some(e => e.message.includes('double quote'))).toBe(true);
    });

    it('should return error for mismatched parentheses', () => {
      const content = 'SELECT * FROM "users" WHERE (pk = \'value\'';
      const result = validatePartiql(content);
      expect(result.errors.some(e => e.message.includes('parentheses'))).toBe(true);
    });

    it('should return error for mismatched braces', () => {
      const content = 'INSERT INTO "users" VALUE {\'pk\': \'value\'';
      const result = validatePartiql(content);
      expect(result.errors.some(e => e.message.includes('braces'))).toBe(true);
    });

    it('should return error for mismatched brackets', () => {
      const content = 'SELECT * FROM "users" WHERE pk IN [\'val1\', \'val2\'';
      const result = validatePartiql(content);
      expect(result.errors.some(e => e.message.includes('brackets'))).toBe(true);
    });

    it('should handle multiple statements', () => {
      const content = `SELECT * FROM "users";
SELECT * FROM "orders";`;
      const result = validatePartiql(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip comments', () => {
      const content = `-- This is a comment
SELECT * FROM "users"`;
      const result = validatePartiql(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip slash comments', () => {
      const content = `// This is a comment
SELECT * FROM "users"`;
      const result = validatePartiql(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty content', () => {
      const result = validatePartiql('');
      expect(result.errors).toHaveLength(0);
    });
  });
});

describe('ES/OpenSearch Validation', () => {
  describe('validateEs', () => {
    it('should return no errors for valid GET request', () => {
      const content = 'GET /_search';
      const result = validateEs(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should return no errors for valid GET request with body', () => {
      const content = `GET /_search
{
  "query": {
    "match_all": {}
  }
}`;
      const result = validateEs(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should return no errors for valid POST request', () => {
      const content = `POST /my_index/_doc
{
  "field": "value"
}`;
      const result = validateEs(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should return no errors for valid PUT request', () => {
      const content = 'PUT /my_index';
      const result = validateEs(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should return no errors for valid DELETE request', () => {
      const content = 'DELETE /my_index';
      const result = validateEs(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should ignore lines with unknown methods (not matching HTTP method pattern)', () => {
      // Unknown methods are ignored by the parser since they don't match the action pattern
      const content = 'INVALID /_search';
      const result = validateEs(content);
      // No errors since 'INVALID' is not recognized as a method
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for JSON syntax error - missing closing brace', () => {
      const content = `GET /_search
{
  "query": {
    "match_all": {}
`;
      const result = validateEs(content);
      expect(result.errors.some(e => e.message.toLowerCase().includes('brace'))).toBe(true);
    });

    it('should return error for JSON syntax error - missing closing bracket', () => {
      const content = `GET /_search
{
  "query": {
    "terms": {
      "field": ["value1", "value2"
    }
  }
}`;
      const result = validateEs(content);
      expect(result.errors.some(e => 
        e.message.toLowerCase().includes('bracket') || 
        e.message.toLowerCase().includes('json')
      )).toBe(true);
    });

    it('should handle multiple requests', () => {
      const content = `GET /_search
{
  "query": { "match_all": {} }
}

POST /my_index/_doc
{
  "field": "value"
}`;
      const result = validateEs(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip comments', () => {
      const content = `// This is a comment
GET /_search`;
      const result = validateEs(content);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty content', () => {
      const result = validateEs('');
      expect(result.errors).toHaveLength(0);
    });

    it('should handle underscore paths', () => {
      const content = 'GET _cat/indices';
      const result = validateEs(content);
      expect(result.errors).toHaveLength(0);
    });
  });
});

describe('Debounced Validator', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should debounce function calls', () => {
    const mockFn = jest.fn();
    const debounced = createDebouncedValidator(mockFn, 100);

    debounced('arg1');
    debounced('arg2');
    debounced('arg3');

    expect(mockFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('arg3');
  });

  it('should call function after delay', () => {
    const mockFn = jest.fn();
    const debounced = createDebouncedValidator(mockFn, 300);

    debounced('arg');

    jest.advanceTimersByTime(299);
    expect(mockFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should use default delay of 300ms', () => {
    const mockFn = jest.fn();
    const debounced = createDebouncedValidator(mockFn);

    debounced('arg');

    jest.advanceTimersByTime(299);
    expect(mockFn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});

describe('Validation Constants', () => {
  it('should export validation owners', () => {
    expect(PARTIQL_VALIDATION_OWNER_CONST).toBe('partiql-validation');
    expect(ES_VALIDATION_OWNER_CONST).toBe('es-validation');
  });
});
