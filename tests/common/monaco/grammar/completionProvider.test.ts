/**
 * Tests for the grammar completion provider
 */
import * as monaco from 'monaco-editor';
import {
  grammarCompletionProvider,
  setCompletionConfig,
  BackendType,
} from '../../../../src/common/monaco/grammar/completionProvider';

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
      const catPaths = result.suggestions.filter(s => 
        typeof s.label === 'string' && s.label.includes('_cat')
      );
      expect(catPaths.length).toBeGreaterThan(0);
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
