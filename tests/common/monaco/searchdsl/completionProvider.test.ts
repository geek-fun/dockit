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
      TypeParameter: 25,
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
        includeSystemIndices: true,
      });

      const options = getDynamicOptions();
      expect(options.activeIndex).toBe('my-active-index');
      expect(options.indices).toEqual(['index-1', 'index-2', 'my-active-index']);
      expect(options.repositories).toEqual(['backup-repo']);
      expect(options.templates).toEqual(['logs-template']);
      expect(options.includeSystemIndices).toBe(true);
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

  describe('PUT _mapping body completions', () => {
    it('should provide mapping fields for PUT /{index}/_mapping', () => {
      const text = `PUT /test_index/_mapping
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('properties');
      expect(labels).toContain('dynamic');
      expect(labels).not.toContain('settings');
      expect(labels).not.toContain('aliases');
    });

    it('should provide mapping fields for PUT index/_mapping without leading slash', () => {
      const text = `PUT test_index/_mapping
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('properties');
      expect(labels).not.toContain('settings');
    });

    it('should not match _mapping in index name (edge case)', () => {
      const text = `PUT my_mapping_index/_search
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('query');
      expect(labels).toContain('from');
      expect(labels).toContain('size');
      expect(labels).not.toContain('properties');
      expect(labels).not.toContain('dynamic');
    });
  });

  describe('PUT _settings body completions', () => {
    it('should provide settings fields for PUT /{index}/_settings', () => {
      const text = `PUT /test_index/_settings
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('number_of_shards');
      expect(labels).toContain('number_of_replicas');
      expect(labels).toContain('refresh_interval');
      expect(labels).not.toContain('mappings');
      expect(labels).not.toContain('aliases');
    });

    it('should provide settings fields for PUT index/_settings without leading slash', () => {
      const text = `PUT test_index/_settings
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('number_of_shards');
      expect(labels).not.toContain('mappings');
    });

    it('should not match _settings in index name (edge case)', () => {
      const text = `PUT my_settings_index/_search
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('query');
      expect(labels).toContain('from');
      expect(labels).toContain('size');
      expect(labels).not.toContain('number_of_shards');
      expect(labels).not.toContain('number_of_replicas');
    });
  });

  describe('PUT _index_template body completions', () => {
    it('should provide index template fields for PUT /_index_template/{name}', () => {
      const text = `PUT /_index_template/my-template
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('index_patterns');
      expect(labels).toContain('template');
      expect(labels).toContain('composed_of');
      expect(labels).toContain('priority');
      expect(labels).toContain('data_stream');
      expect(labels).toContain('version');
      expect(labels).toContain('_meta');
      expect(labels).toContain('allow_auto_create');
      expect(labels).toContain('deprecated');
    });

    it('should provide index template fields for PUT /_index_template without name', () => {
      const text = `PUT /_index_template
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('index_patterns');
      expect(labels).toContain('template');
      expect(labels).toContain('composed_of');
      expect(labels).toContain('priority');
    });

    it('should provide index template fields for PUT _index_template/{name} without leading slash', () => {
      const text = `PUT _index_template/my-template
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('index_patterns');
      expect(labels).toContain('template');
      expect(labels).toContain('composed_of');
      expect(labels).toContain('priority');
    });

    it('should not provide search fields for _index_template endpoint', () => {
      const text = `PUT /_index_template/my-template
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('query');
      expect(labels).not.toContain('size');
      expect(labels).not.toContain('from');
    });

    it('should not provide index creation fields for _index_template endpoint', () => {
      const text = `PUT /_index_template/my-template
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('settings');
      expect(labels).not.toContain('mappings');
      expect(labels).not.toContain('aliases');
    });

    it('should provide index_patterns snippet with wildcard example', () => {
      const text = `PUT /_index_template/my-template
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const indexPatterns = result.suggestions.find(s => s.label === 'index_patterns');
      expect(indexPatterns).toBeDefined();
      expect(indexPatterns?.insertText).toContain('logs-*');
    });

    it('should provide template snippet with settings and mappings structure', () => {
      const text = `PUT /_index_template/my-template
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const template = result.suggestions.find(s => s.label === 'template');
      expect(template).toBeDefined();
      expect(template?.insertText).toContain('settings');
      expect(template?.insertText).toContain('mappings');
    });
  });

  describe('PUT _component_template body completions', () => {
    it('should provide component template fields for PUT /_component_template/{name}', () => {
      const text = `PUT /_component_template/my-component
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('template');
      expect(labels).toContain('version');
      expect(labels).toContain('_meta');
      expect(labels).toContain('deprecated');
    });

    it('should provide component template fields for PUT /_component_template without name', () => {
      const text = `PUT /_component_template
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('template');
      expect(labels).toContain('version');
      expect(labels).toContain('_meta');
      expect(labels).toContain('deprecated');
    });

    it('should not provide index_patterns for component template', () => {
      const text = `PUT /_component_template/my-component
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('index_patterns');
      expect(labels).not.toContain('composed_of');
      expect(labels).not.toContain('priority');
      expect(labels).not.toContain('data_stream');
    });

    it('should provide component template fields for PUT _component_template/{name} without leading slash', () => {
      const text = `PUT _component_template/my-component
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('template');
      expect(labels).toContain('version');
      expect(labels).toContain('_meta');
      expect(labels).toContain('deprecated');
    });

    it('should not provide search fields for _component_template endpoint', () => {
      const text = `PUT /_component_template/my-component
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('query');
      expect(labels).not.toContain('size');
      expect(labels).not.toContain('from');
    });

    it('should provide template snippet with settings and mappings structure', () => {
      const text = `PUT /_component_template/my-component
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const template = result.suggestions.find(s => s.label === 'template');
      expect(template).toBeDefined();
      expect(template?.insertText).toContain('settings');
      expect(template?.insertText).toContain('mappings');
    });

    it('should not match _component_template in index name (edge case)', () => {
      const text = `PUT my_component_template_index/_search
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('query');
      expect(labels).toContain('from');
      expect(labels).toContain('size');
      expect(labels).not.toContain('template');
      expect(labels).not.toContain('version');
    });
  });

  describe('body completion after filled fields', () => {
    it('should provide body fields after a completed field in search body', () => {
      const text = `POST kibana_sample_data_flights/_search
{
    query: { match_all: {} },
    
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 4, column: 5 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('from');
      expect(labels).toContain('size');
      expect(labels).toContain('sort');
      expect(labels).toContain('aggs');
      expect(labels).not.toContain('GET');
      expect(labels).not.toContain('POST');
      expect(labels).not.toContain('PUT');
    });

    it('should provide body fields on empty line inside body', () => {
      const text = `POST my_index/_search
{
    query: { match_all: {} },
    size: 10,

}`;
      const model = createMockModel(text);
      const position = { lineNumber: 5, column: 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('from');
      expect(labels).toContain('sort');
      expect(labels).not.toContain('GET');
      expect(labels).not.toContain('POST');
    });
  });

  describe('index name completions', () => {
    it('should provide index names when typing path', () => {
      setDynamicOptions({
        indices: ['test_index', 'logs_index', 'metrics_index'],
      });

      const text = `GET test_`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 10 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('test_index');
    });

    it('should provide index names immediately after HTTP method', () => {
      setDynamicOptions({
        indices: ['test_index', 'logs_index', 'metrics_index'],
      });

      const text = `GET `;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 5 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('test_index');
      expect(labels).toContain('logs_index');
      expect(labels).toContain('metrics_index');
    });

    it('should not provide index names when path starts with _', () => {
      setDynamicOptions({
        indices: ['test_index', 'logs_index'],
      });

      const text = `GET _cat`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 9 };

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
      const position = { lineNumber: 1, column: 16 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      const searchPath = labels.find(l => typeof l === 'string' && l.includes('_search'));
      expect(searchPath).toBeDefined();
    });

    it('should NOT provide index sub-verbs after root verb like _cluster/', () => {
      const text = `GET _cluster/`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 14 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('_search');
      expect(labels).not.toContain('_mapping');
      expect(labels).not.toContain('_settings');
      expect(labels.some(l => typeof l === 'string' && l.includes('_cluster/'))).toBe(true);
    });

    it('should NOT provide index sub-verbs after root verb like _cat/', () => {
      const text = `GET _cat/`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 10 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('_search');
      expect(labels).not.toContain('_mapping');
      expect(labels.some(l => typeof l === 'string' && l.includes('_cat/'))).toBe(true);
    });

    it('should prioritize _search endpoints in path completions', () => {
      const text = `GET _`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 6 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const searchCompletions = result.suggestions.filter(
        s => typeof s.label === 'string' && s.label.includes('_search'),
      );

      expect(searchCompletions.length).toBeGreaterThan(0);

      const rootSearch = searchCompletions.find(
        s => s.label === '/_search' || s.label === '_search',
      );
      expect(rootSearch).toBeDefined();
      expect(rootSearch?.sortText?.startsWith('1')).toBeTruthy();

      const indexScopedSearch = searchCompletions.find(
        s => typeof s.label === 'string' && s.label.includes('{index}/_search'),
      );
      expect(indexScopedSearch).toBeDefined();
      expect(indexScopedSearch?.sortText?.startsWith('4')).toBeTruthy();
    });
  });

  describe('PUT _update body completions', () => {
    it('should provide update fields for POST /{index}/_update/{id}', () => {
      const text = `POST /test_index/_update/123
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('doc');
      expect(labels).toContain('script');
      expect(labels).toContain('upsert');
      expect(labels).toContain('doc_as_upsert');
      expect(labels).not.toContain('query');
    });

    it('should provide update fields for POST index/_update/id without leading slash', () => {
      const text = `POST test_index/_update/abc
{
  d
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 4 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('doc');
      expect(labels).toContain('detect_noop');
    });

    it('should not match _update in index name (edge case)', () => {
      const text = `PUT my_update_index/_search
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('query');
      expect(labels).not.toContain('doc');
      expect(labels).not.toContain('script');
    });
  });

  describe('POST _reindex body completions', () => {
    it('should provide reindex fields for POST _reindex', () => {
      const text = `POST _reindex
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('source');
      expect(labels).toContain('dest');
      expect(labels).toContain('script');
      expect(labels).toContain('max_docs');
      expect(labels).toContain('conflicts');
    });

    it('should provide reindex fields for POST /_reindex', () => {
      const text = `POST /_reindex
{
  s
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 4 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('source');
      expect(labels).toContain('script');
    });

    it('should not match _reindex in index name (edge case)', () => {
      const text = `PUT my_reindex_backup/_mapping
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('properties');
      expect(labels).not.toContain('source');
      expect(labels).not.toContain('dest');
    });
  });

  describe('nested properties in mappings', () => {
    it('should NOT provide field types at KEY position inside properties block', () => {
      const text = `PUT test_index/_mapping
{
  properties: {
    
  }
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 4, column: 5 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('text');
      expect(labels).not.toContain('keyword');
    });

    it('should provide field types at VALUE position inside properties block', () => {
      const text = `PUT test_index/_mapping
{
  properties: {
    "f1": 
  }
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 4, column: 10 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('text');
      expect(labels).toContain('keyword');
      expect(labels).toContain('object');
      expect(labels).toContain('nested');
    });

    it('should NOT provide field type snippets inside field definition object', () => {
      const text = `PUT test_index/_mapping
{
  properties: {
    title: {
      t
    }
  }
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 5, column: 7 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('text');
      expect(labels).not.toContain('keyword');
    });

    it('should NOT provide field type snippets inside deeply nested field definition', () => {
      const text = `PUT test_index/_mapping
{
  properties: {
    title: {
      type: "text",
      fields: {
        keyword: {
          t
        }
      }
    }
  }
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 8, column: 11 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('text');
      expect(labels).not.toContain('keyword');
    });

    it('should NOT provide field types at KEY position inside nested object properties', () => {
      const text = `PUT test_index/_mapping
{
  properties: {
    author: {
      type: "object",
      properties: {
        
      }
    }
  }
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 7, column: 7 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('text');
      expect(labels).not.toContain('keyword');
    });

    it('should provide field types at VALUE position inside nested object properties', () => {
      const text = `PUT test_index/_mapping
{
  properties: {
    author: {
      type: "object",
      properties: {
        "name": 
      }
    }
  }
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 7, column: 16 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('text');
      expect(labels).toContain('keyword');
    });

    it('should NOT provide field types at KEY position inside fields subfield', () => {
      const text = `PUT test_index/_mapping
{
  properties: {
    title: {
      type: "text",
      fields: {
        keyword: {
          type: "keyword"
        },
        
      }
    }
  }
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 10, column: 7 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('text');
      expect(labels).not.toContain('keyword');
    });

    it('should provide field types at VALUE position inside fields subfield', () => {
      const text = `PUT test_index/_mapping
{
  properties: {
    title: {
      type: "text",
      fields: {
        "raw": 
      }
    }
  }
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 7, column: 15 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('text');
      expect(labels).toContain('keyword');
    });
  });

  describe('_search endpoint false match prevention', () => {
    it('should not match _search in index name for search fields', () => {
      const text = `PUT my_search_logs/_mapping
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('properties');
      expect(labels).not.toContain('query');
      expect(labels).not.toContain('size');
    });

    it('should not match _search when index name ends with _search suffix (e.g. my_custom_search)', () => {
      const text = `PUT my_custom_search
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('query');
      expect(labels).not.toContain('size');
      expect(labels).not.toContain('from');
      expect(labels).not.toContain('sort');
    });

    it('should provide search fields for actual _search endpoint', () => {
      const text = `GET my_index/_search
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('query');
      expect(labels).toContain('size');
      expect(labels).toContain('from');
    });
  });

  describe('HTTP methods not suggested inside body', () => {
    it('should not suggest HTTP verbs when typing inside body after field', () => {
      const text = `POST _search
{
  query: { match_all: {} },
  p
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 4, column: 4 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('post_filter');
      expect(labels).not.toContain('POST');
      expect(labels).not.toContain('PUT');
      expect(labels).not.toContain('GET');
    });
  });

  describe('_aliases endpoint completions', () => {
    it('should provide actions field for POST my_index/_aliases', () => {
      const text = `POST my_index/_aliases
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('actions');
    });

    it('should provide actions field for POST _aliases', () => {
      const text = `POST _aliases
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('actions');
    });
  });

  describe('_search endpoint profile field', () => {
    it('should provide profile field for GET _search', () => {
      const text = `GET _search
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('profile');
    });

    it('should provide profile field for POST my_index/_search', () => {
      const text = `POST my_index/_search
{
  
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 3 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('profile');
    });
  });

  describe('path level _alias completion', () => {
    it('should suggest _alias when typing GET my_index/_ali', () => {
      const text = `GET my_index/_ali`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 20 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('_alias');
    });

    it('should suggest _alias/{alias} when typing GET my_index/_', () => {
      const text = `GET my_index/_`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 17 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('_alias');
      expect(labels).toContain('_alias/{alias}');

      const aliasItem = result.suggestions.find(s => s.label === '_alias');
      expect(aliasItem?.filterText).toBe('my_index/_alias');
      expect(aliasItem?.insertText).toBe('my_index/_alias');
    });
  });

  describe('global _aliases endpoint', () => {
    it('should suggest _aliases for POST /_ali', () => {
      const text = `POST /_ali`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 11 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('/_aliases');
    });
  });

  describe('query parameter completions', () => {
    it('should suggest all params with descriptions for _cat/indices when cursor is right after ?', () => {
      const text = `GET _cat/indices?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('format');
      expect(labels).toContain('h');
      expect(labels).toContain('s');
      expect(labels).toContain('v');
      expect(labels).toContain('health');
      const formatSuggestion = result.suggestions.find(s => s.label === 'format');
      expect(formatSuggestion?.detail).toBeTruthy();
    });

    it('should not show already-typed param when cursor is after &', () => {
      const text = `GET _cat/indices?v=true&`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('v');
      expect(labels).toContain('format');
      expect(labels).toContain('h');
      expect(labels).toContain('s');
      expect(labels).toContain('health');
    });

    it('should show only valid enum values for format param', () => {
      const text = `GET _cat/indices?format=`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('text');
      expect(labels).toContain('json');
      expect(labels).toContain('yaml');
      expect(labels).toContain('cbor');
      expect(labels).toContain('smile');
      expect(labels).toHaveLength(5);
    });

    it('should show boolean value completions when cursor is right after = on boolean param', () => {
      const text = `GET _cat/indices?v=`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('true');
      expect(labels).toContain('false');
      expect(labels).not.toContain('v');
      expect(labels).not.toContain('h');
    });

    it('should suggest all search query params for /{index}/_search?', () => {
      const text = `GET my_index/_search?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('q');
      expect(labels).toContain('df');
      expect(labels).toContain('analyzer');
      expect(labels).toContain('default_operator');
      expect(labels).toContain('from');
      expect(labels).toContain('size');
      expect(labels).toContain('sort');
      expect(labels).toContain('timeout');
      expect(labels).toContain('terminate_after');
      expect(labels).toContain('track_total_hits');
      expect(labels).toContain('search_type');
      expect(labels).toContain('request_cache');
      expect(labels).toContain('routing');
      expect(labels).toContain('preference');
    });

    it('should show search_type enum values for /{index}/_search?search_type=', () => {
      const text = `GET my_index/_search?search_type=`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('query_then_fetch');
      expect(labels).toContain('dfs_query_then_fetch');
    });

    it('should suggest all doc query params for /{index}/_doc/{id}?', () => {
      const text = `GET my_index/_doc/123?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('routing');
      expect(labels).toContain('preference');
      expect(labels).toContain('realtime');
      expect(labels).toContain('version');
      expect(labels).toContain('_source');
      expect(labels).toContain('refresh');
      expect(labels).toContain('timeout');
    });

    it('should suggest all bulk query params for POST /{index}/_bulk?', () => {
      const text = `POST my_index/_bulk?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('refresh');
      expect(labels).toContain('routing');
      expect(labels).toContain('timeout');
      expect(labels).toContain('pipeline');
    });

    it('should show refresh enum values including wait_for for POST /{index}/_bulk?refresh=', () => {
      const text = `POST my_index/_bulk?refresh=`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('true');
      expect(labels).toContain('false');
      expect(labels).toContain('wait_for');
    });

    it('should produce identical param suggestions for _cat/indices? with and without leading slash', () => {
      const textWithSlash = `GET /_cat/indices?`;
      const textWithoutSlash = `GET _cat/indices?`;

      const resultWith = grammarCompletionProvider(createMockModel(textWithSlash), {
        lineNumber: 1,
        column: textWithSlash.length + 1,
      } as monaco.Position);
      const resultWithout = grammarCompletionProvider(createMockModel(textWithoutSlash), {
        lineNumber: 1,
        column: textWithoutSlash.length + 1,
      } as monaco.Position);

      const labelsWith = resultWith.suggestions.map(s => s.label).sort();
      const labelsWithout = resultWithout.suggestions.map(s => s.label).sort();
      expect(labelsWith).toEqual(labelsWithout);
    });

    it('should suggest all count query params for GET /{index}/_count?', () => {
      const text = `GET my_index/_count?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('q');
      expect(labels).toContain('df');
      expect(labels).toContain('analyzer');
      expect(labels).toContain('default_operator');
      expect(labels).toContain('routing');
    });

    it('should filter suggestions by partial name and exclude already-typed params', () => {
      const text = `GET _cat/indices?v=true&h=columns&for`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('format');
      expect(labels).not.toContain('v');
      expect(labels).not.toContain('h');
    });

    it('should show all valid params when cursor returns to right after ? with nothing typed', () => {
      const text = `GET _cat/indices?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('v');
      expect(labels).toContain('h');
      expect(labels).toContain('s');
      expect(labels).toContain('format');
      expect(labels).toContain('health');
    });

    it('should not show any already-typed params when multiple params typed and cursor after &', () => {
      const text = `GET _cat/indices?v=true&h=value&`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('v');
      expect(labels).not.toContain('h');
      expect(labels).toContain('health');
      expect(labels).toContain('format');
    });

    it('should not show already-typed params when cursor is mid-typing a new param name', () => {
      const text = `GET _cat/indices?v=true&h`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('v');
      expect(labels).toContain('health');
    });

    it('should show value completions when cursor is after = with partial value already typed', () => {
      const text = `GET _cat/indices?v=true&h=col`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('v');
      expect(labels).not.toContain('h');
    });

    it('should show value completions for second param when cursor is after = on second param', () => {
      const text = `GET _cat/indices?v=true&health=`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('green');
      expect(labels).toContain('yellow');
      expect(labels).toContain('red');
      expect(labels).not.toContain('v');
      expect(labels).not.toContain('health');
    });
  });

  describe('_mapping query parameters', () => {
    it('should provide query params for _mapping endpoint', () => {
      const text = `GET my_index/_mapping?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('allow_no_indices');
      expect(labels).toContain('expand_wildcards');
      expect(labels).toContain('ignore_unavailable');
      expect(labels).toContain('timeout');
    });

    it('should provide enum values for expand_wildcards on _mapping', () => {
      const text = `GET my_index/_mapping?expand_wildcards=`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('open');
      expect(labels).toContain('closed');
      expect(labels).toContain('hidden');
      expect(labels).toContain('none');
      expect(labels).toContain('all');
    });
  });

  describe('_settings query parameters', () => {
    it('should provide query params for _settings endpoint', () => {
      const text = `GET my_index/_settings?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('allow_no_indices');
      expect(labels).toContain('expand_wildcards');
      expect(labels).toContain('flat_settings');
      expect(labels).toContain('include_defaults');
      expect(labels).toContain('timeout');
    });
  });

  describe('_msearch query parameters', () => {
    it('should provide query params for _msearch with index', () => {
      const text = `GET my_index/_msearch?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('max_concurrent_searches');
      expect(labels).toContain('search_type');
    });
  });

  describe('_stats query parameters', () => {
    it('should provide query params for GET /_stats?', () => {
      const text = `GET /_stats?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('fields');
      expect(labels).toContain('level');
      expect(labels).toContain('include_unloaded_segments');
    });

    it('should provide query params for GET {index}/_stats?', () => {
      const text = `GET my_index/_stats?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('fields');
      expect(labels).toContain('level');
    });
  });

  describe('SQL query body completions', () => {
    beforeEach(() => {
      setCompletionConfig({
        backend: BackendType.ELASTICSEARCH,
        version: '8.0.0',
      });
    });

    it('should provide SQL commands inside query field of _sql endpoint', () => {
      const text = `POST /_sql
{
  "query": "SEL"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 15 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('SELECT');
      expect(labels).toContain('FROM');
      expect(labels).toContain('WHERE');
    });

    it('should provide SQL root body fields for _sql endpoint', () => {
      const text = `POST /_sql
{
  q
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 4 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('query');
      expect(labels).toContain('fetch_size');
      expect(labels).toContain('format');
      expect(labels).toContain('filter');
    });

    it('should provide SQL commands for OpenSearch _plugins/_sql endpoint', () => {
      setCompletionConfig({
        backend: BackendType.OPENSEARCH,
        version: '2.0.0',
      });

      const text = `POST /_plugins/_sql
{
  "query": "SEL"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 15 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('SELECT');
      expect(labels).toContain('FROM');
    });

    it('should provide SQL body fields without format for OpenSearch backend', () => {
      setCompletionConfig({
        backend: BackendType.OPENSEARCH,
        version: '2.0.0',
      });

      const text = `POST /_plugins/_sql
{
  q
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 4 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('query');
      expect(labels).toContain('fetch_size');
      expect(labels).not.toContain('format');
    });

    it('should provide index name completions after FROM in SQL query', () => {
      setDynamicOptions({
        indices: ['kibana_sample_data_ecommerce', 'logs-2024'],
      });

      const text = `POST /_sql
{
  "query": "SELECT * FROM kibana"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 24 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('kibana_sample_data_ecommerce');
      expect(labels).not.toContain('logs-2024');
    });

    it('should provide field completions after FROM in SQL query when fields match', () => {
      setDynamicOptions({
        activeIndex: 'kibana_sample_data_ecommerce',
        fields: ['category', 'price', 'description'],
      });

      const text = `POST /_sql
{
  "query": "SELECT category, price FROM kibana_sample_data_ecommerce"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 64 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('category');
      expect(labels).toContain('price');
      expect(labels).toContain('description');
    });
  });

  describe('query parameter completions', () => {
    it('should suggest all params with descriptions for _cat/indices when cursor is right after ?', () => {
      const text = `GET _cat/indices?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('format');
      expect(labels).toContain('h');
      expect(labels).toContain('s');
      expect(labels).toContain('v');
      expect(labels).toContain('health');
      const formatSuggestion = result.suggestions.find(s => s.label === 'format');
      expect(formatSuggestion?.detail).toBeTruthy();
    });

    it('should not show already-typed param when cursor is after &', () => {
      const text = `GET _cat/indices?v=true&`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('v');
      expect(labels).toContain('format');
      expect(labels).toContain('h');
      expect(labels).toContain('s');
      expect(labels).toContain('health');
    });

    it('should show only valid enum values for format param', () => {
      const text = `GET _cat/indices?format=`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('text');
      expect(labels).toContain('json');
      expect(labels).toContain('yaml');
      expect(labels).toContain('cbor');
      expect(labels).toContain('smile');
    });

    it('should show boolean value completions when cursor is right after = on boolean param', () => {
      const text = `GET _cat/indices?v=`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('true');
      expect(labels).toContain('false');
      expect(labels).not.toContain('v');
      expect(labels).not.toContain('h');
    });

    it('should suggest all search query params for /{index}/_search?', () => {
      const text = `GET my_index/_search?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('q');
      expect(labels).toContain('df');
      expect(labels).toContain('default_operator');
      expect(labels).toContain('from');
      expect(labels).toContain('size');
      expect(labels).toContain('sort');
      expect(labels).toContain('timeout');
      expect(labels).toContain('track_total_hits');
      expect(labels).toContain('search_type');
      expect(labels).toContain('routing');
    });

    it('should show search_type enum values for /{index}/_search?search_type=', () => {
      const text = `GET my_index/_search?search_type=`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('query_then_fetch');
      expect(labels).toContain('dfs_query_then_fetch');
    });

    it('should suggest all doc query params for /{index}/_doc/{id}?', () => {
      const text = `GET my_index/_doc/123?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('routing');
      expect(labels).toContain('preference');
      expect(labels).toContain('realtime');
      expect(labels).toContain('_source');
      expect(labels).toContain('refresh');
      expect(labels).toContain('timeout');
    });

    it('should suggest all bulk query params for POST /{index}/_bulk?', () => {
      const text = `POST my_index/_bulk?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('refresh');
      expect(labels).toContain('routing');
      expect(labels).toContain('timeout');
      expect(labels).toContain('pipeline');
    });

    it('should show refresh enum values including wait_for for POST /{index}/_bulk?refresh=', () => {
      const text = `POST my_index/_bulk?refresh=`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('true');
      expect(labels).toContain('false');
      expect(labels).toContain('wait_for');
    });

    it('should produce identical param suggestions for _cat/indices? with and without leading slash', () => {
      const textWithSlash = `GET /_cat/indices?`;
      const textWithoutSlash = `GET _cat/indices?`;

      const resultWith = grammarCompletionProvider(createMockModel(textWithSlash), {
        lineNumber: 1,
        column: textWithSlash.length + 1,
      } as monaco.Position);
      const resultWithout = grammarCompletionProvider(createMockModel(textWithoutSlash), {
        lineNumber: 1,
        column: textWithoutSlash.length + 1,
      } as monaco.Position);

      const labelsWith = resultWith.suggestions.map(s => s.label).sort();
      const labelsWithout = resultWithout.suggestions.map(s => s.label).sort();
      expect(labelsWith).toEqual(labelsWithout);
    });

    it('should suggest all count query params for GET /{index}/_count?', () => {
      const text = `GET my_index/_count?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('q');
      expect(labels).toContain('df');
      expect(labels).toContain('default_operator');
      expect(labels).toContain('routing');
    });

    it('should filter suggestions by partial name and exclude already-typed params', () => {
      const text = `GET _cat/indices?v=true&h=columns&for`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('format');
      expect(labels).not.toContain('v');
      expect(labels).not.toContain('h');
    });

    it('should show all valid params when cursor returns to right after ? with nothing typed', () => {
      const text = `GET _cat/indices?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('v');
      expect(labels).toContain('h');
      expect(labels).toContain('s');
      expect(labels).toContain('format');
      expect(labels).toContain('health');
    });

    it('should not show any already-typed params when multiple params typed and cursor after &', () => {
      const text = `GET _cat/indices?v=true&h=value&`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('v');
      expect(labels).not.toContain('h');
      expect(labels).toContain('health');
      expect(labels).toContain('format');
    });

    it('should not show already-typed params when cursor is mid-typing a new param name', () => {
      const text = `GET _cat/indices?v=true&h`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('v');
      expect(labels).toContain('health');
    });

    it('should show value completions for second param when cursor is after = on second param', () => {
      const text = `GET _cat/indices?v=true&health=`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('green');
      expect(labels).toContain('yellow');
      expect(labels).toContain('red');
      expect(labels).not.toContain('v');
      expect(labels).not.toContain('health');
    });
  });

  describe('_mapping query parameters', () => {
    it('should provide query params for _mapping endpoint', () => {
      const text = `GET my_index/_mapping?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('allow_no_indices');
      expect(labels).toContain('expand_wildcards');
      expect(labels).toContain('ignore_unavailable');
      expect(labels).toContain('timeout');
    });

    it('should provide enum values for expand_wildcards on _mapping', () => {
      const text = `GET my_index/_mapping?expand_wildcards=`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('open');
      expect(labels).toContain('closed');
      expect(labels).toContain('hidden');
      expect(labels).toContain('none');
      expect(labels).toContain('all');
    });
  });

  describe('_settings query parameters', () => {
    it('should provide query params for _settings endpoint', () => {
      const text = `GET my_index/_settings?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('allow_no_indices');
      expect(labels).toContain('expand_wildcards');
      expect(labels).toContain('flat_settings');
      expect(labels).toContain('include_defaults');
      expect(labels).toContain('timeout');
    });
  });

  describe('_msearch query parameters', () => {
    it('should provide query params for _msearch with index', () => {
      const text = `GET my_index/_msearch?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('max_concurrent_searches');
      expect(labels).toContain('search_type');
    });
  });

  describe('_stats query parameters', () => {
    it('should provide query params for GET /_stats?', () => {
      const text = `GET /_stats?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('fields');
      expect(labels).toContain('level');
      expect(labels).toContain('include_unloaded_segments');
    });

    it('should provide query params for GET {index}/_stats?', () => {
      const text = `GET my_index/_stats?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('fields');
      expect(labels).toContain('level');
    });
  });

  describe('_data_stream query parameters', () => {
    it('should provide query params for GET /_data_stream?', () => {
      const text = `GET /_data_stream?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('expand_wildcards');
      expect(labels).toContain('master_timeout');
    });
  });

  describe('_eql search path completions', () => {
    it('should NOT show path completions when exact path already typed', () => {
      const text = `POST my_index/_eql/search`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('_eql/search');
      expect(labels).not.toContain('my_index/_eql/search');
    });

    it('should show query params after ? on _eql/search', () => {
      const text = `POST my_index/_eql/search?`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: text.length + 1 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('keep_alive');
      expect(labels).toContain('wait_for_completion_timeout');
    });
  });

  describe('system indices filtering in autocomplete', () => {
    const allIndices = ['products', 'logs', '.kibana', '.security'];

    beforeEach(() => {
      setDynamicOptions({
        indices: allIndices,
        includeSystemIndices: false,
      });
    });

    it('should filter system indices when includeSystemIndices is false', () => {
      const text = `GET `;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 5 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('products');
      expect(labels).toContain('logs');
      expect(labels).not.toContain('.kibana');
      expect(labels).not.toContain('.security');
    });

    it('should filter system indices even when typing dot character', () => {
      const text = `GET .`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 6 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('.kibana');
      expect(labels).not.toContain('.security');
    });

    it('should show system indices when includeSystemIndices is true', () => {
      setDynamicOptions({
        indices: allIndices,
        includeSystemIndices: true,
      });

      const text = `GET `;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 5 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('products');
      expect(labels).toContain('logs');
      expect(labels).toContain('.kibana');
      expect(labels).toContain('.security');
    });

    it('should show system indices when typing first letter with includeSystemIndices true', () => {
      setDynamicOptions({
        indices: allIndices,
        includeSystemIndices: true,
      });

      const text = `GET p`;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 6 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('products');
      expect(labels).not.toContain('.kibana');
      expect(labels).not.toContain('.security');
    });

    it('should sort system indices after normal indices in autocomplete', () => {
      setDynamicOptions({
        indices: allIndices,
        includeSystemIndices: true,
      });

      const text = `GET `;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 5 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const items = result.suggestions.filter(
        s => typeof s.label === 'string' && allIndices.includes(s.label),
      );

      const normalIdxs = items.filter(s => !s.label.startsWith('.'));
      const systemIdxs = items.filter(s => s.label.startsWith('.'));

      normalIdxs.forEach(normalItem => {
        expect(normalItem.sortText).toMatch(/^0/);
      });
      systemIdxs.forEach(systemItem => {
        expect(systemItem.sortText).toMatch(/^3/);
      });
    });
  });

  describe('completion sort order after HTTP method', () => {
    it('should order: normal indices → root _search → other roots → system indices → {index}/*', () => {
      setDynamicOptions({
        indices: ['products', 'logs', '.kibana'],
        includeSystemIndices: true,
      });

      const text = `GET `;
      const model = createMockModel(text);
      const position = { lineNumber: 1, column: 5 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const findById = (label: string) => result.suggestions.find(s => s.label === label);

      const products = findById('products');
      const logs = findById('logs');
      const systemKibana = findById('.kibana');
      const rootSearch = findById('_search') || findById('/_search');

      const indexScopedEndpoint = result.suggestions.find(
        s => typeof s.label === 'string' && s.label.includes('{index}'),
      );

      expect(products?.sortText?.charAt(0)).toBe('0');
      expect(logs?.sortText?.charAt(0)).toBe('0');
      expect(systemKibana?.sortText?.charAt(0)).toBe('3');
      expect(rootSearch).toBeDefined();
      expect(rootSearch?.sortText?.charAt(0)).toBe('1');
      expect(indexScopedEndpoint).toBeDefined();
      expect(indexScopedEndpoint?.sortText?.charAt(0)).toBe('4');
    });
  });

  describe('ES|QL query body completions', () => {
    beforeEach(() => {
      setCompletionConfig({
        backend: BackendType.ELASTICSEARCH,
        version: '8.11.0',
      });
    });

    it('should provide ES|QL commands inside query field of _query endpoint', () => {
      const text = `POST /_query
{
  "query": "F"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 14 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('FROM');
      expect(labels).toContain('WHERE');
      expect(labels).toContain('STATS');
      expect(labels).toContain('EVAL');
      expect(labels).toContain('KEEP');
      expect(labels).toContain('SORT');
      expect(labels).toContain('LIMIT');
    });

    it('should NOT provide Query DSL completions inside _query endpoint', () => {
      const text = `POST /_query
{
  "query": "F"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 14 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('match');
      expect(labels).not.toContain('term');
      expect(labels).not.toContain('bool');
      expect(labels).not.toContain('range');
    });

    it('should still provide Query DSL completions inside _search endpoint (regression)', () => {
      const text = `GET my-index/_search
{
  "query": {
    t
  }
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 4, column: 6 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('match');
      expect(labels).toContain('term');
      expect(labels).toContain('bool');
    });

    it('should provide ES|QL function completions inside _query endpoint', () => {
      const text = `POST /_query
{
  "query": "AVG"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 15 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('AVG');
      expect(labels).toContain('SUM');
      expect(labels).toContain('COUNT');
      expect(labels).toContain('DATE_TRUNC');
    });

    it('should provide ES|QL completions for triple-quoted query strings', () => {
      const text = `POST /_query
{
  "query": """
    FROM
  """
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 4, column: 8 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('FROM');
      expect(labels).toContain('WHERE');
      expect(labels).toContain('STATS');
    });

    it('should provide field completions when fields are configured and FROM clause matches', () => {
      setDynamicOptions({
        activeIndex: 'kibana_sample_data_ecommerce',
        fields: ['category', 'customer_full_name', 'taxful_total_price', 'order_date'],
      });

      const text = `POST /_query
{
  "query": "FROM kibana_sample_data_ecommerce | WHERE c"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 52 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('category');
      expect(labels).toContain('customer_full_name');
      expect(labels).toContain('taxful_total_price');
    });

    it('should NOT provide field completions for ROW queries (no FROM clause)', () => {
      setDynamicOptions({
        activeIndex: 'kibana_sample_data_ecommerce',
        fields: ['category', 'price'],
      });

      const text = `POST /_query
{
  "query": "ROW a = 1, b = 2"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 23 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const fieldLabels = result.suggestions.filter(
        s => s.kind === monaco.languages.CompletionItemKind.Variable,
      );
      expect(fieldLabels.length).toBe(0);
    });

    it('should not provide field completions when no fields configured', () => {
      setDynamicOptions({ fields: [] });

      const text = `POST /_query
{
  "query": "FROM test | WHERE "
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 23 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const fieldLabels = result.suggestions.filter(
        s => s.kind === monaco.languages.CompletionItemKind.Variable,
      );
      expect(fieldLabels.length).toBe(0);
    });

    it('should NOT provide field completions when FROM clause queries a different index', () => {
      setDynamicOptions({
        activeIndex: 'my-active-index',
        fields: ['category', 'price', 'description'],
      });

      const text = `POST /_query
{
  "query": "FROM other-index | WHERE "
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 30 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const fieldLabels = result.suggestions.filter(
        s => s.kind === monaco.languages.CompletionItemKind.Variable,
      );
      expect(fieldLabels.length).toBe(0);
    });

    it('should provide index name completions when typing after FROM', () => {
      setDynamicOptions({
        indices: ['kibana_sample_data_ecommerce', 'kibana_sample_data_logs', 'my-index'],
      });

      const text = `POST /_query
{
  "query": "FROM kibana"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 18 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('kibana_sample_data_ecommerce');
      expect(labels).toContain('kibana_sample_data_logs');
      expect(labels).not.toContain('my-index');
    });

    it('should filter index completions by prefix typed after FROM', () => {
      setDynamicOptions({
        indices: ['kibana_sample_data_ecommerce', 'kibana_sample_data_logs', 'logs-2024'],
      });

      const text = `POST /_query
{
  "query": "FROM logs"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 17 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('logs-2024');
      expect(labels).not.toContain('kibana_sample_data_ecommerce');
      expect(labels).not.toContain('kibana_sample_data_logs');
    });

    it('should provide all index completions when no prefix after FROM', () => {
      setDynamicOptions({
        indices: ['kibana_sample_data_ecommerce', 'logs-2024'],
      });

      const text = `POST /_query
{
  "query": "FROM "
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 16 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('kibana_sample_data_ecommerce');
      expect(labels).toContain('logs-2024');
    });

    it('should NOT provide index completions when not after FROM (e.g., after WHERE)', () => {
      setDynamicOptions({
        indices: ['kibana_sample_data_ecommerce', 'logs-2024'],
      });

      const text = `POST /_query
{
  "query": "FROM kibana_sample_data_ecommerce | WHERE c"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 53 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).not.toContain('kibana_sample_data_ecommerce');
      expect(labels).not.toContain('logs-2024');
    });

    it('should exclude system indices from FROM completions by default', () => {
      setDynamicOptions({
        indices: ['.kibana', 'my-index'],
        includeSystemIndices: false,
      });

      const text = `POST /_query
{
  "query": "FROM "
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 16 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('my-index');
      expect(labels).not.toContain('.kibana');
    });

    it('should include system indices when includeSystemIndices is true', () => {
      setDynamicOptions({
        indices: ['.kibana', 'my-index'],
        includeSystemIndices: true,
      });

      const text = `POST /_query
{
  "query": "FROM "
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 16 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('my-index');
      expect(labels).toContain('.kibana');
    });

    it('should NOT provide index completions when no indices configured', () => {
      setDynamicOptions({});

      const text = `POST /_query
{
  "query": "FROM k"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 18 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const indexCompletions = result.suggestions.filter(
        s => s.kind === monaco.languages.CompletionItemKind.Variable && s.detail === 'Index',
      );
      expect(indexCompletions.length).toBe(0);
    });

    it('should NOT provide ES|QL completions for _delete_by_query (regression)', () => {
      const text = `POST my-index/_delete_by_query
{
  "query": {
    t
  }
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 4, column: 6 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('term');
      expect(labels).toContain('match');
      expect(labels).toContain('bool');
      expect(labels).not.toContain('FROM');
      expect(labels).not.toContain('STATS');
    });

    it('should NOT provide ES|QL completions for _update_by_query (regression)', () => {
      const text = `POST my-index/_update_by_query
{
  "query": {
    t
  }
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 4, column: 6 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('term');
      expect(labels).not.toContain('FROM');
    });

    it('should provide ES|QL completions for unclosed query string', () => {
      const text = `POST /_query
{
  "query": "FROM
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 16 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('FROM');
      expect(labels).toContain('WHERE');
      expect(labels).toContain('STATS');
    });

    it('should provide ES|QL completions for unclosed triple-quoted query string', () => {
      const text = `POST /_query
{
  "query": """
    FROM
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 4, column: 8 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('FROM');
      expect(labels).toContain('WHERE');
      expect(labels).toContain('STATS');
    });

    it('should provide ES|QL completions for JSON5 style (unquoted key + triple-quoted string)', () => {
      const text = `POST _query
{
  query: """
  f
  """
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 4, column: 4 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('FROM');
      expect(labels).toContain('WHERE');
      expect(labels).toContain('STATS');
      expect(labels).toContain('ROW');
      expect(labels).toContain('KEEP');
    });

    it('should provide ES|QL completions for JSON5 style with FROM in triple-quoted string', () => {
      setDynamicOptions({
        indices: ['kibana_sample_data_ecommerce', 'logs-2024'],
      });

      const text = `POST _query
{
  query: """
    FROM kibana
  """
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 4, column: 14 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('kibana_sample_data_ecommerce');
      expect(labels).not.toContain('logs-2024');
    });
  });

  describe('PPL query body completions', () => {
    beforeEach(() => {
      setCompletionConfig({
        backend: BackendType.OPENSEARCH,
        version: '2.0.0',
      });
    });

    it('should provide PPL commands inside _plugins/_ppl endpoint', () => {
      const text = `POST /_plugins/_ppl
{
  "query": "sour"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 16 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('source');
      expect(labels).toContain('where');
      expect(labels).toContain('fields');
    });

    it('should provide PPL root body fields at root level', () => {
      const text = `POST /_plugins/_ppl
{
  q
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 4 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('query');
      expect(labels).toContain('filter');
      expect(labels).toContain('fetch_size');
    });
  });

  describe('EQL query body completions', () => {
    beforeEach(() => {
      setCompletionConfig({
        backend: BackendType.ELASTICSEARCH,
        version: '8.0.0',
      });
    });

    it('should provide EQL commands inside _eql/search endpoint', () => {
      const text = `POST my-index/_eql/search
{
  "query": "any"
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 15 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('any');
      expect(labels).toContain('where');
      expect(labels).toContain('sequence');
    });

    it('should provide EQL root body fields at root level', () => {
      const text = `POST my-index/_eql/search
{
  q
}`;
      const model = createMockModel(text);
      const position = { lineNumber: 3, column: 4 };

      const result = grammarCompletionProvider(model, position as monaco.Position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('query');
      expect(labels).toContain('timestamp_field');
      expect(labels).toContain('filter');
      expect(labels).toContain('fetch_size');
      expect(labels).toContain('tiebreaker_field');
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
