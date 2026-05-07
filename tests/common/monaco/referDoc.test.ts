import { getActionApiDoc } from '../../../src/common/monaco/referDoc';
import { EngineType } from '../../../src/common/monaco/type';

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

const createSearchActionWithIndex = (method: string, index: string, path: string) => ({
  qdsl: '',
  position: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } as any,
  method,
  index,
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
      describe('v9.x - new API docs format', () => {
        it('should return new API docs URL for v9.x', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '9.0.0', action);
          expect(result).toBe(
            'https://www.elastic.co/docs/api/doc/elasticsearch/v9/operation/operation-search',
          );
        });

        it('should return new API docs URL for v9.2', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '9.2.0', action);
          expect(result).toBe(
            'https://www.elastic.co/docs/api/doc/elasticsearch/v9/operation/operation-search',
          );
        });

        it('should return new API docs URL without version for current/empty version (assumes latest)', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '', action);
          expect(result).toBe(
            'https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-search',
          );
        });
      });

      describe('v8.x - old guide format with specific version', () => {
        it('should return old guide URL for v8.0', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.0.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.0/search-search.html',
          );
        });

        it('should return old guide URL for v8.2', () => {
          const action = createSearchAction('GET', '_cat/indices');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.2.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.2/cat-indices.html',
          );
        });

        it('should return old guide URL for v8.10', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.10/search-search.html',
          );
        });

        it('should return old guide URL for v8.19 (last v8)', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.19.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.19/search-search.html',
          );
        });

        it('should return old guide URL for v8.20 (beyond last available, maps to 8.19)', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.20.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.19/search-search.html',
          );
        });

        it('should return old guide URL for _reindex in v8.x', () => {
          const action = createSearchAction('POST', '_reindex');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.15.1', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.15/docs-reindex.html',
          );
        });

        it('should return old guide URL for _bulk in v8.x', () => {
          const action = createSearchAction('POST', '_bulk');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.10/docs-bulk.html',
          );
        });

        it('should return old guide URL for index API in v8.x (docs-index_ with underscore)', () => {
          const action = createSearchAction('POST', 'my-index/_doc');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.10/docs-index_.html',
          );
        });

        it('should return method-specific old guide URL for GET /{index} (indices-get-index)', () => {
          const action = createSearchAction('GET', 'my-index');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.10/indices-get-index.html',
          );
        });

        it('should return method-specific old guide URL for PUT /{index} (indices-create-index)', () => {
          const action = createSearchAction('PUT', 'my-index');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.10/indices-create-index.html',
          );
        });

        it('should return method-specific old guide URL for DELETE /{index} (indices-delete-index)', () => {
          const action = createSearchAction('DELETE', 'my-index');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.10/indices-delete-index.html',
          );
        });

        it('should return method-specific old guide URL for HEAD /{index} (indices-exists)', () => {
          const action = createSearchAction('HEAD', 'my-index');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.10/indices-exists.html',
          );
        });

        it('should return method-specific old guide URL for GET /{index}/_doc/{id} (docs-get)', () => {
          const action = createSearchAction('GET', 'my-index/_doc/1');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.10/docs-get.html',
          );
        });

        it('should return method-specific old guide URL for PUT /{index}/_doc/{id} (docs-index_)', () => {
          const action = createSearchAction('PUT', 'my-index/_doc/1');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.10/docs-index_.html',
          );
        });

        it('should return method-specific old guide URL for DELETE /{index}/_doc/{id} (docs-delete)', () => {
          const action = createSearchAction('DELETE', 'my-index/_doc/1');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.10/docs-delete.html',
          );
        });

        it('should return method-specific old guide URL for GET _cluster/settings (cluster-update-settings)', () => {
          const action = createSearchAction('GET', '_cluster/settings');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.10/cluster-update-settings.html',
          );
        });

        it('should return method-specific old guide URL for PUT _cluster/settings (cluster-update-settings)', () => {
          const action = createSearchAction('PUT', '_cluster/settings');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/8.10/cluster-update-settings.html',
          );
        });
      });

      describe('v7.x - old guide format with specific version', () => {
        it('should return old guide URL for v7.0', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '7.0.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/7.0/search-search.html',
          );
        });

        it('should return old guide URL for v7.10', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '7.10.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/7.10/search-search.html',
          );
        });

        it('should return old guide URL for v7.17', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '7.17.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/7.17/search-search.html',
          );
        });

        it('should map v7.18 to v7.17 (beyond last available)', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '7.18.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/7.17/search-search.html',
          );
        });
      });

      describe('v6.x - old guide format with specific version', () => {
        it('should return old guide URL for v6.0', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '6.0.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/6.0/search-search.html',
          );
        });

        it('should return old guide URL for v6.8', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '6.8.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/6.8/search-search.html',
          );
        });

        it('should map v6.9 to v6.8 (beyond last available)', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '6.9.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/6.8/search-search.html',
          );
        });
      });

      describe('v5.x - old guide format with specific version', () => {
        it('should return old guide URL for v5.0', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '5.0.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/5.0/search-search.html',
          );
        });

        it('should return old guide URL for v5.6', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '5.6.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/5.6/search-search.html',
          );
        });

        it('should map v5.7 to v5.6 (beyond last available)', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '5.7.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/5.6/search-search.html',
          );
        });
      });

      describe('v2.x - old guide format with specific version', () => {
        it('should return old guide URL for v2.0', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '2.0.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/2.0/search-search.html',
          );
        });

        it('should return old guide URL for v2.4', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '2.4.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/2.4/search-search.html',
          );
        });

        it('should map v2.5 to v2.4 (beyond last available)', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '2.5.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/2.4/search-search.html',
          );
        });
      });

      describe('v1.x - old guide format with closest available version', () => {
        it('should map v1.0 to v1.3 (v1.0 not available)', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '1.0.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/1.3/search-search.html',
          );
        });

        it('should map v1.1 to v1.3 (v1.1 not available)', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '1.1.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/1.3/search-search.html',
          );
        });

        it('should map v1.2 to v1.3 (v1.2 not available)', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '1.2.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/1.3/search-search.html',
          );
        });

        it('should return old guide URL for v1.3', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '1.3.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/1.3/search-search.html',
          );
        });

        it('should return old guide URL for v1.7', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '1.7.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/1.7/search-search.html',
          );
        });
      });

      describe('v0.90 - old guide format', () => {
        it('should return old guide URL for v0.90', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '0.90.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/0.90/search-search.html',
          );
        });
      });

      describe('Missing versions - map to closest available', () => {
        it('should map v3.x to v5.0 (v3.x not available)', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '3.0.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/5.0/search-search.html',
          );
        });

        it('should map v4.x to v5.0 (v4.x not available)', () => {
          const action = createSearchAction('GET', '_search');
          const result = getActionApiDoc(EngineType.ELASTICSEARCH, '4.0.0', action);
          expect(result).toBe(
            'https://www.elastic.co/guide/en/elasticsearch/reference/5.0/search-search.html',
          );
        });
      });

      it('should return undefined for unknown path', () => {
        const action = createSearchAction('GET', '_unknown/path');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, 'current', action);
        expect(result).toBeUndefined();
      });

      it('should use English URL for Chinese lang (Chinese docs not available)', () => {
        mockLocalStorage('zhCN');
        const action = createSearchAction('GET', '_cat/indices');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
        expect(result).toBe(
          'https://www.elastic.co/guide/en/elasticsearch/reference/8.10/cat-indices.html',
        );
      });
    });

    describe('OpenSearch', () => {
      it('should return doc URL for _search', () => {
        const action = createSearchAction('GET', '_search');
        const result = getActionApiDoc(EngineType.OPENSEARCH, 'current', action);
        expect(result).toBe('https://docs.opensearch.org/latest/api-reference/search-apis/search/');
      });

      it('should return undefined for unknown OpenSearch path', () => {
        const action = createSearchAction('GET', '_unknown/path');
        const result = getActionApiDoc(EngineType.OPENSEARCH, 'current', action);
        expect(result).toBeUndefined();
      });
    });
  });

  describe('fullPath reconstruction with action.index', () => {
    it('should reconstruct full path from action.index + action.path for v9', () => {
      const action = createSearchActionWithIndex('GET', 'my_index', '_mapping');
      const result = getActionApiDoc(EngineType.ELASTICSEARCH, '9.0.0', action);
      expect(result).toBe(
        'https://www.elastic.co/docs/api/doc/elasticsearch/v9/operation/operation-indices-get-mapping',
      );
    });

    it('should reconstruct full path from action.index + action.path for v8', () => {
      const action = createSearchActionWithIndex('GET', 'my_index', '_mapping');
      const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.10.0', action);
      expect(result).toBe(
        'https://www.elastic.co/guide/en/elasticsearch/reference/8.10/indices-get-mapping.html',
      );
    });

    it('should match _clone endpoint with reconstructed path for v9', () => {
      const action = createSearchActionWithIndex('POST', 'my_index', '_clone');
      const result = getActionApiDoc(EngineType.ELASTICSEARCH, '9.0.0', action);
      expect(result).toBe(
        'https://www.elastic.co/docs/api/doc/elasticsearch/v9/operation/operation-indices-clone',
      );
    });

    it('should match _terms_enum endpoint with reconstructed path for v9', () => {
      const action = createSearchActionWithIndex('GET', 'my_index', '_terms_enum');
      const result = getActionApiDoc(EngineType.ELASTICSEARCH, '9.0.0', action);
      expect(result).toBe(
        'https://www.elastic.co/docs/api/doc/elasticsearch/v9/operation/operation-terms-enum',
      );
    });

    it('should match _settings endpoint with reconstructed path for v9', () => {
      const action = createSearchActionWithIndex('GET', 'my_index', '_settings');
      const result = getActionApiDoc(EngineType.ELASTICSEARCH, '9.0.0', action);
      expect(result).toBe(
        'https://www.elastic.co/docs/api/doc/elasticsearch/v9/operation/operation-indices-get-settings',
      );
    });

    it('should match _alias endpoint with reconstructed path for v9', () => {
      const action = createSearchActionWithIndex('GET', 'my_index', '_alias');
      const result = getActionApiDoc(EngineType.ELASTICSEARCH, '9.0.0', action);
      expect(result).toBe(
        'https://www.elastic.co/docs/api/doc/elasticsearch/v9/operation/operation-indices-get-alias',
      );
    });

    it('should return undefined when reconstructed full path does not match any endpoint', () => {
      const action = createSearchActionWithIndex('GET', 'my_index', '_fake_endpoint');
      const result = getActionApiDoc(EngineType.ELASTICSEARCH, '9.0.0', action);
      expect(result).toBeUndefined();
    });
  });

  describe('issue #385 - index-level endpoint method-specific doc URLs', () => {
    describe('GET {index}/_alias', () => {
      it('should return indices-get-alias.html for v8', () => {
        const action = createSearchActionWithIndex('GET', 'my_index', '_alias');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.19.0', action);
        expect(result).toBe(
          'https://www.elastic.co/guide/en/elasticsearch/reference/8.19/indices-get-alias.html',
        );
      });

      it('should return operation-indices-get-alias for v9', () => {
        const action = createSearchActionWithIndex('GET', 'my_index', '_alias');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '9.2.0', action);
        expect(result).toBe(
          'https://www.elastic.co/docs/api/doc/elasticsearch/v9/operation/operation-indices-get-alias',
        );
      });
    });

    describe('GET {index}/_settings', () => {
      it('should return indices-get-settings.html for v8', () => {
        const action = createSearchActionWithIndex('GET', 'my_index', '_settings');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.19.0', action);
        expect(result).toBe(
          'https://www.elastic.co/guide/en/elasticsearch/reference/8.19/indices-get-settings.html',
        );
      });

      it('should return operation-indices-get-settings for v9', () => {
        const action = createSearchActionWithIndex('GET', 'my_index', '_settings');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '9.2.0', action);
        expect(result).toBe(
          'https://www.elastic.co/docs/api/doc/elasticsearch/v9/operation/operation-indices-get-settings',
        );
      });
    });

    describe('POST {index}/_clone', () => {
      it('should return indices-clone-index.html for v8', () => {
        const action = createSearchActionWithIndex('POST', 'my_index', '_clone');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.19.0', action);
        expect(result).toBe(
          'https://www.elastic.co/guide/en/elasticsearch/reference/8.19/indices-clone-index.html',
        );
      });

      it('should return operation-indices-clone for v9', () => {
        const action = createSearchActionWithIndex('POST', 'my_index', '_clone');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '9.2.0', action);
        expect(result).toBe(
          'https://www.elastic.co/docs/api/doc/elasticsearch/v9/operation/operation-indices-clone',
        );
      });
    });

    describe('PUT {index}/_alias/{alias_name}', () => {
      it('should return indices-add-alias.html for v8', () => {
        const action = createSearchActionWithIndex('PUT', 'my_index', '_alias/my_alias');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '8.19.0', action);
        expect(result).toBe(
          'https://www.elastic.co/guide/en/elasticsearch/reference/8.19/indices-add-alias.html',
        );
      });

      it('should return operation-indices-put-alias for v9', () => {
        const action = createSearchActionWithIndex('PUT', 'my_index', '_alias/my_alias');
        const result = getActionApiDoc(EngineType.ELASTICSEARCH, '9.2.0', action);
        expect(result).toBe(
          'https://www.elastic.co/docs/api/doc/elasticsearch/v9/operation/operation-indices-put-alias',
        );
      });
    });
  });

  describe('esSampleQueries', () => {
    it('should contain expected sample queries', () => {
      const { esSampleQueries } = require('../../../src/common/monaco/referDoc');
      expect(esSampleQueries.clusterHealth).toBeDefined();
      expect(esSampleQueries.catIndices).toBeDefined();
      expect(esSampleQueries.search).toBeDefined();
      expect(esSampleQueries.bulkOperation).toBeDefined();
    });
  });
});
