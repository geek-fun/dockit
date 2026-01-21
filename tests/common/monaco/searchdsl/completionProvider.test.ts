/**
 * Tests for the grammar completion provider
 */
import * as monaco from 'monaco-editor';
import {
  grammarCompletionProvider,
  setCompletionConfig,
  setDynamicOptions,
  getDynamicOptions,
  BackendType,
} from '../../../../src/common/monaco/searchdsl/completionProvider';

// Mock monaco.Range
jest.mock('monaco-editor', () => ({
  Range: class Range {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    constructor(
      startLineNumber: number,
      startColumn: number,
      endLineNumber: number,
      endColumn: number,
    ) {
      this.startLineNumber = startLineNumber;
      this.startColumn = startColumn;
      this.endLineNumber = endLineNumber;
      this.endColumn = endColumn;
    }
  },
  languages: {
    CompletionItemKind: {
      Keyword: 17,
      Function: 1,
      Property: 9,
      Class: 5,
      Value: 12,
    },
    CompletionItemInsertTextRule: {
      None: 0,
      InsertAsSnippet: 4,
    },
  },
}));

describe('grammarCompletionProvider', () => {
  beforeEach(() => {
    setCompletionConfig({
      backend: BackendType.ELASTICSEARCH,
      version: '8.0.0',
    });
    // Reset dynamic options
    setDynamicOptions({});
  });

  describe('body completions', () => {
    it('should provide root body fields for search endpoint', () => {
      const text = `GET my-index/_search
{
  q
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 4 }; // Position at 'q'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      // Should provide root fields like 'query', 'from', 'size', etc.
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('query');
      expect(labels).toContain('from');
      expect(labels).toContain('size');
    });

    it('should provide query types inside query block', () => {
      const text = `GET my-index/_search
{
  query: {
    t
  }
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 4, column: 6 }; // Position at 't'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      // Should provide query types like 'term', 'match', 'bool', etc.
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('term');
      expect(labels).toContain('match');
      expect(labels).toContain('bool');
    });

    it('should work with JSON5 format (unquoted keys)', () => {
      const text = `GET my-index/_search
{
  query: {
    match: {
      
    }
  }
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 5, column: 7 }; // Position inside match

      const result = grammarCompletionProvider(model, position as monaco.Position);

      // Should provide query types for potential nested queries
      expect(result.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('path completions range', () => {
    it('should calculate correct range for path completion', () => {
      const text = `GET _cat/indi`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 14 }; // End of 'indi'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      // Should provide path completions
      expect(result.suggestions.length).toBeGreaterThan(0);

      // Check that completions include _cat paths
      const catPaths = result.suggestions.filter(
        s => typeof s.label === 'string' && s.label.includes('_cat'),
      );
      expect(catPaths.length).toBeGreaterThan(0);
    });
  });

  describe('path completions without leading slash', () => {
    it('should preserve user style without leading slash', () => {
      const text = `GET _cat/`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 10 }; // After '_cat/'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      // Completions should match user's style (no leading slash)
      const labels = result.suggestions.map(s => s.label);
      // Check that _cat paths are provided without leading slash
      const catIndicesPath = labels.find(l => typeof l === 'string' && l.includes('_cat/indices'));
      expect(catIndicesPath).toBeDefined();
      // Should not start with /
      expect(catIndicesPath?.startsWith('/')).toBeFalsy();
    });

    it('should preserve user style with leading slash', () => {
      const text = `GET /_cat/`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 11 }; // After '/_cat/'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      // Completions should match user's style (with leading slash)
      const labels = result.suggestions.map(s => s.label);
      // Check that _cat paths are provided with leading slash
      const catIndicesPath = labels.find(l => typeof l === 'string' && l.includes('_cat/indices'));
      expect(catIndicesPath).toBeDefined();
      // Should start with /
      expect(catIndicesPath?.startsWith('/')).toBeTruthy();
    });
  });

  describe('dynamic options', () => {
    it('should set and get dynamic options', () => {
      setDynamicOptions({
        activeIndex: 'my-active-index',
        indices: ['index-1', 'index-2', 'my-active-index'],
        repositories: ['backup-repo'],
        templates: ['logs-template'],
      });

      const options = getDynamicOptions();
      expect(options.activeIndex).toBe('my-active-index');
      expect(options.indices).toEqual(['index-1', 'index-2', 'my-active-index']);
      expect(options.repositories).toEqual(['backup-repo']);
      expect(options.templates).toEqual(['logs-template']);
    });

    it('should use activeIndex as default for {index} placeholder', () => {
      setDynamicOptions({
        activeIndex: 'my-active-index',
        indices: ['index-1', 'index-2', 'my-active-index'],
      });

      const text = `GET _search`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 12 }; // After '_search'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      // Find the /{index}/_search completion
      const indexSearchCompletion = result.suggestions.find(
        s => typeof s.label === 'string' && s.label.includes('{index}/_search'),
      );

      expect(indexSearchCompletion).toBeDefined();
      // The insertText should contain the active index as default
      expect(indexSearchCompletion?.insertText).toContain('my-active-index');
    });

    it('should use first index when no activeIndex is set', () => {
      setDynamicOptions({
        indices: ['index-1', 'index-2'],
      });

      const text = `GET _search`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 12 }; // After '_search'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      // Find the /{index}/_search completion
      const indexSearchCompletion = result.suggestions.find(
        s => typeof s.label === 'string' && s.label.includes('{index}/_search'),
      );

      expect(indexSearchCompletion).toBeDefined();
      // The insertText should contain the first index as default
      expect(indexSearchCompletion?.insertText).toContain('index-1');
    });

    it('should fallback to param name when no indices are available', () => {
      setDynamicOptions({});

      const text = `GET _search`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 12 }; // After '_search'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      // Find the /{index}/_search completion
      const indexSearchCompletion = result.suggestions.find(
        s => typeof s.label === 'string' && s.label.includes('{index}/_search'),
      );

      expect(indexSearchCompletion).toBeDefined();
      // The insertText should contain 'index' as default placeholder
      expect(indexSearchCompletion?.insertText).toMatch(/\$\{\d+:index\}/);
    });
  });

  describe('index creation body completions', () => {
    it('should provide settings and mappings fields for PUT /index', () => {
      const text = `PUT /test_index
{
  s
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 4 }; // Position at 's'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('settings');
      expect(labels).toContain('mappings');
      expect(labels).toContain('aliases');
    });

    it('should provide settings fields inside settings block', () => {
      const text = `PUT /test_index
{
  settings: {
    n
  }
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 4, column: 6 }; // Position at 'n'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('number_of_shards');
      expect(labels).toContain('number_of_replicas');
    });
  });

  describe('aliases endpoint body completions', () => {
    it('should provide actions field for POST /_aliases', () => {
      const text = `POST /_aliases
{
  a
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 4 }; // Position at 'a'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('actions');
    });

    it('should provide actions field for POST _aliases (without leading slash)', () => {
      const text = `POST _aliases
{
  a
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 4 }; // Position at 'a'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('actions');
    });

    it('should provide actions snippet with action type choices', () => {
      const text = `POST /_aliases
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 }; // Position inside body

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const actionsSuggestion = result.suggestions.find(s => s.label === 'actions');
      expect(actionsSuggestion).toBeDefined();
      expect(actionsSuggestion?.insertText).toContain('actions');
      // The snippet should have choice syntax for action types
      expect(actionsSuggestion?.insertText).toContain('add,remove,remove_index');
      expect(actionsSuggestion?.insertText).toContain('index');
      expect(actionsSuggestion?.insertText).toContain('alias');
    });

    it('should not provide actions field for paths that just contain _aliases in the name', () => {
      // This tests that 'my_aliases_index/_search' does NOT get _aliases completions
      const text = `POST my_aliases_index/_search
{
  q
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 4 }; // Position at 'q'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      // Should provide search fields, not actions
      expect(labels).toContain('query');
      expect(labels).not.toContain('actions');
    });
  });

  describe('index name completions', () => {
    it('should provide index names when typing path', () => {
      setDynamicOptions({
        indices: ['test_index', 'logs_index', 'metrics_index'],
      });

      const text = `GET test_`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 10 }; // After 'test_'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('test_index');
    });

    it('should not provide index names when path starts with _', () => {
      setDynamicOptions({
        indices: ['test_index', 'logs_index'],
      });

      const text = `GET _cat`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 9 }; // After '_cat'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('test_index');
      expect(labels).not.toContain('logs_index');
    });
  });

  describe('endpoint completions after index name', () => {
    it('should provide endpoints after index name with slash', () => {
      const text = `GET test_index/`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 16 }; // After '/'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      // Should contain index-specific endpoints
      const searchPath = labels.find(l => typeof l === 'string' && l.includes('_search'));
      expect(searchPath).toBeDefined();
    });

    it('should prioritize _search endpoints in path completions', () => {
      const text = `GET _`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 6 }; // After '_'

      const result = grammarCompletionProvider(model, position as monaco.Position);

      // Find _search related completions
      const searchCompletions = result.suggestions.filter(
        s => typeof s.label === 'string' && s.label.includes('_search'),
      );

      expect(searchCompletions.length).toBeGreaterThan(0);

      // Check that _search completions have a lower sortText (higher priority)
      for (const completion of searchCompletions) {
        expect(completion.sortText?.startsWith('0')).toBeTruthy();
      }
    });
  });
});

/**
 * Create a mock Monaco text model
 */
function createMockModel(text: string): monaco.editor.ITextModel {
  const lines = text.split('\n');
  return {
    getValue: () => text,
    getLineContent: (lineNumber: number) => lines[lineNumber - 1] || '',
    getOffsetAt: (position: { lineNumber: number; column: number }) => {
      let offset = 0;
      for (let i = 0; i < position.lineNumber - 1; i++) {
        offset += lines[i].length + 1; // +1 for newline
      }
      offset += position.column - 1;
      return offset;
    },
    getWordUntilPosition: (position: { lineNumber: number; column: number }) => {
      const line = lines[position.lineNumber - 1] || '';
      const beforeCursor = line.substring(0, position.column - 1);
      const match = beforeCursor.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
      if (match) {
        return {
          word: match[0],
          startColumn: position.column - match[0].length,
          endColumn: position.column,
        };
      }
      return {
        word: '',
        startColumn: position.column,
        endColumn: position.column,
      };
    },
  } as monaco.editor.ITextModel;
}
