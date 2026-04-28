import { getActionApiDoc } from '../../src/common/monaco/referDoc';
import { EngineType } from '../../src/common/monaco/type';
import { BackendType } from '../../src/common/monaco/searchdsl/types';

jest.mock('monaco-editor', () => ({
  self: { MonacoEnvironment: {} },
  editor: {},
  languages: {},
  Range: class Range {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    constructor(a: number, b: number, c: number, d: number) {
      this.startLineNumber = a;
      this.startColumn = b;
      this.endLineNumber = c;
      this.endColumn = d;
    }
  },
}));

const mockLocalStorage = (lang: string) => {
  Object.defineProperty(global, 'localStorage', {
    value: {
      getItem: () => lang,
      setItem: () => {},
      clear: () => {},
    },
    writable: true,
    configurable: true,
  });
};

const mockNavigator = (language: string) => {
  Object.defineProperty(global, 'navigator', {
    value: { language },
    writable: true,
    configurable: true,
  });
};

const createSearchAction = (method: string, path: string) => ({
  qdsl: '',
  position: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } as any,
  method,
  index: '',
  path,
  queryParams: null,
});

describe('referDoc', () => {
  beforeEach(() => {
    mockLocalStorage('enUS');
    mockNavigator('en-US');
  });

  describe('getActionApiDoc', () => {
    describe('Elasticsearch', () => {
      it('should return doc URL for _cat/indices', () => {
        const action = createSearchAction('GET', '_cat/indices');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, 'current', action);
        expect(result).toBe('https://www.elastic.co/guide/en/elasticsearch/reference/8.10/cat-indices.html');
      });

      it('should return doc URL with version for _search', () => {
        const action = createSearchAction('GET', 'my-index/_search');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
        expect(result).toBe('https://www.elastic.co/guide/en/elasticsearch/reference/8.10/search-search.html');
      });

      it('should return doc URL for _reindex', () => {
        const action = createSearchAction('POST', '_reindex');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, 'current', action);
        expect(result).toBe('https://www.elastic.co/guide/en/elasticsearch/reference/8.10/docs-reindex.html');
      });

      it('should return doc URL for _settings', () => {
        const action = createSearchAction('GET', 'my-index/_settings');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '7.17', action);
        expect(result).toBe('https://www.elastic.co/guide/en/elasticsearch/reference/7.17/indices-update-settings.html');
      });

      it('should return doc URL for _cluster/health', () => {
        const action = createSearchAction('GET', '_cluster/health');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, 'current', action);
        expect(result).toBe('https://www.elastic.co/guide/en/elasticsearch/reference/8.10/cluster-health.html');
      });

      it('should return undefined for unknown path', () => {
        const action = createSearchAction('GET', '_unknown/path');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, 'current', action);
        expect(result).toBeUndefined();
      });

      it('should normalize version to major.minor', () => {
        const action = createSearchAction('GET', '_search');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.15.1', action);
        expect(result).toContain('/8.15/');
      });

      it('should handle empty version as default 8.10', () => {
        const action = createSearchAction('GET', '_search');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '', action);
        expect(result).toContain('/8.10/');
      });

      it('should fallback ES 9.x to 8.15', () => {
        const action = createSearchAction('GET', '_search');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '9.2.0', action);
        expect(result).toContain('/8.15/');
      });

      it('should cap ES 7.x to 7.17', () => {
        const action = createSearchAction('GET', '_search');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '7.99.0', action);
        expect(result).toContain('/7.17/');
      });

      it('should use English URL for Chinese lang (Chinese docs not available)', () => {
        mockLocalStorage('zhCN');
        const action = createSearchAction('GET', '_cat/indices');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, 'current', action);
        expect(result).toBe('https://www.elastic.co/guide/en/elasticsearch/reference/8.10/cat-indices.html');
      });
    });

    describe('OpenSearch', () => {
      it('should return doc URL for _search', () => {
        const action = createSearchAction('GET', '_search');
        const result = getActionApiDoc(EngineType.OPENSEARCH, 'current', action);
        expect(result).toBe('https://docs.opensearch.org/latest/search-search.html');
      });

      it('should return undefined for unknown OpenSearch path', () => {
        const action = createSearchAction('GET', '_unknown/path');
        const result = getActionApiDoc(EngineType.OPENSEARCH, 'current', action);
        expect(result).toBeUndefined();
      });
    });
  });

  describe('esSampleQueries', () => {
    it('should contain expected sample queries', () => {
      const { esSampleQueries } = require('../../src/common/monaco/referDoc');
      expect(esSampleQueries.clusterHealth).toBeDefined();
      expect(esSampleQueries.catIndices).toBeDefined();
      expect(esSampleQueries.search).toBeDefined();
      expect(esSampleQueries.bulkOperation).toBeDefined();
    });
  });
});