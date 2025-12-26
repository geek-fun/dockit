import { transformQDSL } from '../../../src/common/monaco';

jest.mock('monaco-editor', () => ({
  self: { MonacoEnvironment: {} },
  editor: {
    IModel: {},
    ITextModel: {},
    getLineCount: () => 1,
    getLineContent: () => '',
  },
  Range: {},
  Position: {},
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
    CodeLens: {},
  },
}));

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
});
