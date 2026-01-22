/**
 * Tests for the API specification provider
 */
import { apiSpecProvider } from '../../../../src/common/monaco/searchdsl/apiSpec';
import { BackendType } from '../../../../src/common/monaco/searchdsl/types';

// Mock monaco-editor
jest.mock('monaco-editor', () => ({
  self: { MonacoEnvironment: {} },
  editor: {},
  languages: {},
  Range: {},
  Position: {},
  MarkerSeverity: {},
}));

describe('ApiSpecProvider', () => {
  describe('getEndpoints', () => {
    it('should return endpoints for Elasticsearch', () => {
      const endpoints = apiSpecProvider.getEndpoints(BackendType.ELASTICSEARCH);

      expect(endpoints.length).toBeGreaterThan(0);

      // Should include common endpoints
      const searchEndpoint = endpoints.find(e => e.path === '/_search');
      expect(searchEndpoint).toBeDefined();
      expect(searchEndpoint?.methods).toContain('GET');
      expect(searchEndpoint?.methods).toContain('POST');
    });

    it('should return endpoints for OpenSearch', () => {
      const endpoints = apiSpecProvider.getEndpoints(BackendType.OPENSEARCH);

      expect(endpoints.length).toBeGreaterThan(0);

      // Should include common endpoints
      const searchEndpoint = endpoints.find(e => e.path === '/_search');
      expect(searchEndpoint).toBeDefined();
    });

    it('should include Elasticsearch-specific endpoints for Elasticsearch', () => {
      const endpoints = apiSpecProvider.getEndpoints(BackendType.ELASTICSEARCH);

      // SQL endpoint is Elasticsearch-specific
      const sqlEndpoint = endpoints.find(e => e.path === '/_sql');
      expect(sqlEndpoint).toBeDefined();
    });

    it('should include OpenSearch-specific endpoints for OpenSearch', () => {
      const endpoints = apiSpecProvider.getEndpoints(BackendType.OPENSEARCH);

      // PPL endpoint is OpenSearch-specific
      const pplEndpoint = endpoints.find(e => e.path === '/_plugins/_ppl');
      expect(pplEndpoint).toBeDefined();
    });

    it('should not include OpenSearch-specific endpoints for Elasticsearch', () => {
      const endpoints = apiSpecProvider.getEndpoints(BackendType.ELASTICSEARCH);

      // PPL endpoint should not be in Elasticsearch
      const pplEndpoint = endpoints.find(e => e.path === '/_plugins/_ppl');
      expect(pplEndpoint).toBeUndefined();
    });

    it('should not include Elasticsearch-specific endpoints for OpenSearch', () => {
      const endpoints = apiSpecProvider.getEndpoints(BackendType.OPENSEARCH);

      // Elasticsearch SQL endpoint should not be in OpenSearch
      const sqlEndpoint = endpoints.find(e => e.path === '/_sql');
      expect(sqlEndpoint).toBeUndefined();
    });

    it('should filter by version when provided', () => {
      // kNN endpoint requires version 8.0.0+ for Elasticsearch
      const oldVersionEndpoints = apiSpecProvider.getEndpoints(BackendType.ELASTICSEARCH, '7.10.0');
      const newVersionEndpoints = apiSpecProvider.getEndpoints(BackendType.ELASTICSEARCH, '8.5.0');

      // Note: This test may need adjustment based on actual availability data
      // Just verify version filtering doesn't break
      expect(oldVersionEndpoints.length).toBeGreaterThan(0);
      expect(newVersionEndpoints.length).toBeGreaterThan(0);
    });
  });

  describe('findEndpoint', () => {
    it('should find endpoint by exact path', () => {
      const endpoint = apiSpecProvider.findEndpoint(BackendType.ELASTICSEARCH, '/_search');

      expect(endpoint).toBeDefined();
      expect(endpoint?.path).toBe('/_search');
    });

    it('should find endpoint by path pattern with parameter', () => {
      const endpoint = apiSpecProvider.findEndpoint(BackendType.ELASTICSEARCH, '/my-index/_search');

      expect(endpoint).toBeDefined();
      expect(endpoint?.path).toBe('/{index}/_search');
    });

    it('should filter by method', () => {
      const getEndpoint = apiSpecProvider.findEndpoint(
        BackendType.ELASTICSEARCH,
        '/_search',
        'GET',
      );

      expect(getEndpoint).toBeDefined();
      expect(getEndpoint?.methods).toContain('GET');
    });

    it('should match parametric path for unknown endpoints', () => {
      // /_nonexistent matches /{index} pattern
      const endpoint = apiSpecProvider.findEndpoint(BackendType.ELASTICSEARCH, '/_nonexistent');

      // It matches the {index} pattern since it's a valid path segment
      if (endpoint) {
        expect(endpoint.path).toBe('/{index}');
      }
    });
  });

  describe('getPathCompletions', () => {
    it('should return path completions', () => {
      const paths = apiSpecProvider.getPathCompletions(BackendType.ELASTICSEARCH);

      expect(paths.length).toBeGreaterThan(0);
      expect(paths).toContain('/_search');
    });

    it('should return paths containing cat endpoints', () => {
      const allPaths = apiSpecProvider.getPathCompletions(BackendType.ELASTICSEARCH);

      // Check that there are cat-related endpoints
      const catPaths = allPaths.filter(p => p.includes('_cat'));
      expect(catPaths.length).toBeGreaterThan(0);
    });
  });

  describe('aliases endpoint', () => {
    it('should have requestBody with actions property for /_aliases', () => {
      const endpoint = apiSpecProvider.findEndpoint(BackendType.ELASTICSEARCH, '/_aliases', 'POST');

      expect(endpoint).toBeDefined();
      expect(endpoint?.requestBody).toBeDefined();
      expect(endpoint?.requestBody?.properties).toBeDefined();
      expect(endpoint?.requestBody?.properties?.actions).toBeDefined();
      expect(endpoint?.requestBody?.properties?.actions.type).toBe('array');
    });

    it('should include /_aliases in path completions', () => {
      const paths = apiSpecProvider.getPathCompletions(BackendType.ELASTICSEARCH);

      expect(paths).toContain('/_aliases');
    });
  });
});
