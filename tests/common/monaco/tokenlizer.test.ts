import { buildSearchToken, getAction, getActionMarksDecorations, formatQDSL, transformQDSL, transformToCurl, searchTokens, executionGutterClass } from '../../../src/common/monaco';

jest.mock('monaco-editor', () => ({
  self: { MonacoEnvironment: {} },
  editor: {
    IModel: {},
    ITextModel: {},
    getLineCount: () => 1,
    getLineContent: () => '',
    setModelMarkers: jest.fn(),
  },
  Range: class MockRange {
    constructor(
      public _startLineNumber: number,
      public _startColumn: number,
      public _endLineNumber: number,
      public _endColumn: number,
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
    registerDocumentFormattingEditProvider: jest.fn(),
    registerHoverProvider: jest.fn(),
    CodeLens: {},
  },
}));

const createMockModel = (lines: string[]): jest.Mocked<any> => {
  return {
    getLineCount: () => lines.length,
    getLineContent: (n: number) => lines[n - 1],
    getValueInRange: ({
      startLineNumber,
      startColumn,
      endLineNumber,
      endColumn,
    }: {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    }) =>
      Object.values(lines)
        .slice(startLineNumber - 1, endLineNumber)
        .join('\n'),
    getLineLength: (n: number) => lines[n - 1]?.length || 0,
  };
};

describe('Unit test for transformQDSL', () => {
  it('should transform QDSL string to JSON when given qdsl is valid', () => {
    const input = {
      path: '/test',
      qdsl: '{ "query": { "match_all": {} } }',
    };
    const result = transformQDSL(input);
    expect(result).toBe(JSON.stringify(JSON.parse(input.qdsl), null, 2));
  });

  it('should handle _bulk path with multiple lines when a valid bulk qdsl provided', () => {
    const input = {
      path: '/_bulk',
      qdsl: '{ "index": {} }\n{ "field": "value" }',
    };
    const result = transformQDSL(input);
    const expected =
      JSON.stringify(JSON.parse('{ "index": {} }')) +
      '\n' +
      JSON.stringify(JSON.parse('{ "field": "value" }')) +
      '\n';
    expect(result).toBe(expected);
  });

  it('should remove comments and triple quotes', () => {
    const input = {
      path: '/test',
      qdsl: '{ "query": { "match_all": {} } } // comment',
    };
    const result = transformQDSL(input);
    expect(result).toBe(JSON.stringify({ query: { match_all: {} } }, null, 2));
  });

  it('should throw CustomError on invalid JSON', () => {
    const input = {
      path: '/test',
      qdsl: '{ invalid json }',
    };
    expect(() => transformQDSL(input)).toThrow();
  });

  it('should not remove // inside qoutes', () => {
    const input = {
      path: '/test',
      qdsl: '{ "query": { "match": { "field": "http://example.com//foo" } } } // comment',
    };
    const result = transformQDSL(input);
    // The comment should be removed, but the // inside the string should remain
    expect(result).toBe(
      JSON.stringify(
        {
          query: {
            match: {
              field: 'http://example.com//foo',
            },
          },
        },
        null,
        2,
      ),
    );
  });

  it('should handle URLs with // inside JSON and not treat them as comments', () => {
    const input = {
      path: '/detail/_search',
      qdsl: `{
              "from": 0,
              "size": 10,
              "query": {
                "bool": {
                  "must": [
                    {
                      "terms": {
                        "url": ["https://baidu.com/"]
                      }
                   }
                  ]
                }
              }
            }`,
    };
    const result = transformQDSL(input);
    expect(result).toBe(
      JSON.stringify(
        {
          from: 0,
          size: 10,
          query: { bool: { must: [{ terms: { url: ['https://baidu.com/'] } }] } },
        },
        null,
        2,
      ),
    );
  });

  it('should handle triple-quoted multi-line strings', () => {
    const input = {
      path: '/test',
      qdsl: '"""line 1\nline 2\nline 3"""',
    };
    const result = transformQDSL(input);
    const parsed = JSON.parse(result);
    expect(parsed).toBe('line 1\nline 2\nline 3');
  });

  it('should handle single-quote triple-quoted strings', () => {
    const input = {
      path: '/test',
      qdsl: "'''some value'''",
    };
    const result = transformQDSL(input);
    const parsed = JSON.parse(result);
    expect(parsed).toBe('some value');
  });
});

describe('buildSearchToken', () => {
  it('should parse a simple GET action line', () => {
    const model = createMockModel(['GET _search']);
    const result = buildSearchToken(model);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      method: 'GET',
      index: undefined,
      path: '_search',
      queryParams: undefined,
      position: { startLineNumber: 1, endLineNumber: 1 },
    });
  });

  it('should strip whitespace-delimited // comments from action lines', () => {
    const model = createMockModel(['GET _ilm/policy // this is a comment']);
    const result = buildSearchToken(model);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      method: 'GET',
      path: '_ilm/policy',
    });
  });

  it('should strip whitespace-delimited # comments from action lines', () => {
    const model = createMockModel(['GET _ilm/policy # hash comment']);
    const result = buildSearchToken(model);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      method: 'GET',
      path: '_ilm/policy',
    });
  });

  it('should NOT strip // when no whitespace precedes it (URL paths)', () => {
    const model = createMockModel(['GET _search?q=http://example.com']);
    const result = buildSearchToken(model);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      method: 'GET',
      path: '_search',
      queryParams: 'q=http://example.com',
    });
  });

  it('should NOT strip # when no whitespace precedes it (fragments)', () => {
    const model = createMockModel(['GET _search?q=tag#v1']);
    const result = buildSearchToken(model);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      method: 'GET',
      path: '_search',
      queryParams: 'q=tag#v1',
    });
  });

  it('should handle leading whitespace (trimmed) on action lines', () => {
    const model = createMockModel(['  GET _ilm/policy']);
    const result = buildSearchToken(model);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      method: 'GET',
      path: '_ilm/policy',
    });
  });

  it('should filter out comment-only lines', () => {
    const model = createMockModel([
      'GET _search',
      '// this is a comment',
      '# another comment',
    ]);
    const result = buildSearchToken(model);
    expect(result).toHaveLength(1);
    expect(result[0].method).toBe('GET');
  });

  it('should parse query parameters correctly', () => {
    const model = createMockModel(['GET _cat/indices?v=true&format=json']);
    const result = buildSearchToken(model);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      method: 'GET',
      path: '_cat/indices',
      queryParams: 'v=true&format=json',
    });
  });

  it('should parse index name when path starts with non-underscore', () => {
    const model = createMockModel(['GET my_index/_mapping']);
    const result = buildSearchToken(model);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      method: 'GET',
      index: 'my_index',
      path: '_mapping',
    });
  });

  it('should exclude index when path starts with underscore', () => {
    const model = createMockModel(['GET _cat/indices']);
    const result = buildSearchToken(model);
    expect(result).toHaveLength(1);
    expect(result[0].index).toBeUndefined();
    expect(result[0].path).toBe('_cat/indices');
  });

  it('should find endLineNumber for multi-line JSON body ending with }', () => {
    const model = createMockModel([
      'POST my_index/_search',
      '{',
      '  "query": { "match_all": {} }',
      '}',
    ]);
    const result = buildSearchToken(model);
    expect(result).toHaveLength(1);
    expect(result[0].position.startLineNumber).toBe(1);
    expect(result[0].position.endLineNumber).toBe(4);
  });

  it('should ignore comment lines when finding endLineNumber', () => {
    const model = createMockModel([
      'POST my_index/_bulk',
      '{ "index": {} }',
      '// comment',
      '{ "query": {} }',
    ]);
    const result = buildSearchToken(model);
    expect(result).toHaveLength(1);
    expect(result[0].position.endLineNumber).toBe(4);
  });

  it('should handle multiple action lines with body detection', () => {
    const model = createMockModel([
      'GET _cluster/health',
      'POST my_index/_search',
      '{ "query": {} }',
      'GET _cat/indices',
    ]);
    const result = buildSearchToken(model);
    expect(result).toHaveLength(3);
    expect(result[0].method).toBe('GET');
    expect(result[0].path).toBe('_cluster/health');
    expect(result[0].position.endLineNumber).toBe(1);
    expect(result[1].method).toBe('POST');
    expect(result[1].path).toBe('_search');
    expect(result[1].position.endLineNumber).toBe(3);
    expect(result[2].method).toBe('GET');
    expect(result[2].path).toBe('_cat/indices');
  });
});

describe('getAction', () => {
  beforeEach(() => {
    const model = createMockModel(['GET _search']);
    buildSearchToken(model);
  });

  it('should return undefined for null position', () => {
    expect(getAction(null)).toBeUndefined();
  });

  it('should return undefined for undefined position', () => {
    expect(getAction(undefined)).toBeUndefined();
  });

  it('should return action when cursor is within its range', () => {
    const action = getAction({ lineNumber: 1 } as any);
    expect(action).toBeDefined();
    expect(action?.method).toBe('GET');
    expect(action?.path).toBe('_search');
  });

  it('should return undefined when cursor is outside action range', () => {
    const action = getAction({ lineNumber: 50 } as any);
    expect(action).toBeUndefined();
  });

  it('should return action when cursor is within range (Range object)', () => {
    const action = getAction({ startLineNumber: 1, endLineNumber: 1 } as any);
    expect(action).toBeDefined();
  });

  it('should return action when cursor is partially overlapping range', () => {
    const model = createMockModel([
      'POST _bulk',
      '{ "index": {} }',
      '{ "data": {} }',
      'GET _search',
    ]);
    buildSearchToken(model);

    const action = getAction({ startLineNumber: 2, endLineNumber: 3 } as any);
    expect(action).toBeDefined();
    expect(action?.method).toBe('POST');
  });
});

describe('getActionMarksDecorations', () => {
  it('should return decoration for each action', () => {
    const model = createMockModel([
      'GET _search',
      'POST _bulk',
    ]);
    buildSearchToken(model);
    const decorations = getActionMarksDecorations(searchTokens);
    expect(decorations).toHaveLength(2);
    expect(decorations[0].id).toBe(1);
    expect(decorations[1].id).toBe(2);
    expect(decorations[0].options.linesDecorationsClassName).toBe(executionGutterClass);
  });

  it('should sort decorations by line number', () => {
    const model = createMockModel([
      'GET _cat/indices',
      'GET _cluster/health',
    ]);
    buildSearchToken(model);
    const decorations = getActionMarksDecorations(searchTokens);
    expect(decorations.map(d => d.id)).toEqual([1, 2]);
  });

  it('should return empty array for no actions', () => {
    const model = createMockModel([
      'invalid line',
      '// comment',
    ]);
    buildSearchToken(model);
    const decorations = getActionMarksDecorations(searchTokens);
    expect(decorations).toEqual([]);
  });
});

describe('formatQDSL', () => {
  it('should format single-line JSON body', () => {
    const model = createMockModel([
      'GET _search',
      '{ "query": { "match_all": {} } }',
    ]);
    const tokens = buildSearchToken(model);
    const result = formatQDSL(tokens, model, { startLineNumber: 1, endLineNumber: 2 });
    expect(result).toHaveProperty('length');
    expect(result).toContain('query');
  });

  it('should format multi-line JSON body', () => {
    const model = createMockModel([
      'POST _search',
      '{',
      '  "query": {}',
      '}',
    ]);
    const tokens = buildSearchToken(model);
    const result = formatQDSL(tokens, model, { startLineNumber: 1, endLineNumber: 4 });
    expect(result).toBeDefined();
    expect(result?.length).toBeGreaterThan(0);
  });

  it('should format _bulk actions line-by-line', () => {
    const model = createMockModel([
      'POST _bulk',
      '{ "index": { "_index": "test" } }',
      '{ "field": "value" }',
    ]);
    const tokens = buildSearchToken(model);
    const result = formatQDSL(tokens, model, { startLineNumber: 1, endLineNumber: 3 });
    expect(result).toContain('index');
    expect(result).toContain('field');
  });
});

describe('transformToCurl', () => {
  it('should generate basic curl command', () => {
    const result = transformToCurl({
      url: 'http://localhost:9200/_search',
      method: 'GET',
      qdsl: '',
      headers: {},
      ssl: true,
    });
    expect(result).toBe("curl -X GET 'http://localhost:9200/_search'");
  });

  it('should add headers', () => {
    const result = transformToCurl({
      url: 'http://localhost:9200/_search',
      method: 'GET',
      qdsl: '',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic xyz' },
      ssl: true,
    });
    expect(result).toContain("-H 'Content-Type: application/json'");
    expect(result).toContain("-H 'Authorization: Basic xyz'");
  });

  it('should add body for POST with qdsl', () => {
    const result = transformToCurl({
      url: 'http://localhost:9200/my_index/_search',
      method: 'POST',
      qdsl: '{ "query": { "match_all": {} } }',
      headers: {},
      ssl: true,
    });
    expect(result).toContain("-d '{");
  });

  it('should add --insecure for HTTPS with ssl=false', () => {
    const result = transformToCurl({
      url: 'https://localhost:9200/_search',
      method: 'GET',
      qdsl: '',
      headers: {},
      ssl: false,
    });
    expect(result).toContain('--insecure');
  });

  it('should not add --insecure for HTTP', () => {
    const result = transformToCurl({
      url: 'http://localhost:9200/_search',
      method: 'GET',
      qdsl: '',
      headers: {},
      ssl: false,
    });
    expect(result).not.toContain('--insecure');
  });

  it('should add query parameters to URL', () => {
    const result = transformToCurl({
      url: 'http://localhost:9200/_cat/indices?v=true&format=json',
      method: 'GET',
      qdsl: '',
      headers: {},
      ssl: true,
    });
    expect(result).toContain('_cat/indices?v=true&format=json');
  });
});
