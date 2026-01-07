/**
 * Tests for the Query DSL provider
 */
import { QueryDslProvider, queryDslProvider, allQueries } from '../../../../src/common/monaco/searchdsl/queryDsl';
import { BackendType } from '../../../../src/common/monaco/searchdsl/types';

describe('QueryDslProvider', () => {
  describe('allQueries', () => {
    it('should have full-text queries', () => {
      expect(allQueries.match).toBeDefined();
      expect(allQueries.match_phrase).toBeDefined();
      expect(allQueries.match_phrase_prefix).toBeDefined();
      expect(allQueries.multi_match).toBeDefined();
      expect(allQueries.query_string).toBeDefined();
      expect(allQueries.simple_query_string).toBeDefined();
    });

    it('should have term-level queries', () => {
      expect(allQueries.term).toBeDefined();
      expect(allQueries.terms).toBeDefined();
      expect(allQueries.range).toBeDefined();
      expect(allQueries.prefix).toBeDefined();
      expect(allQueries.wildcard).toBeDefined();
      expect(allQueries.regexp).toBeDefined();
      expect(allQueries.fuzzy).toBeDefined();
      expect(allQueries.ids).toBeDefined();
      expect(allQueries.exists).toBeDefined();
    });

    it('should have compound queries', () => {
      expect(allQueries.bool).toBeDefined();
      expect(allQueries.boosting).toBeDefined();
      expect(allQueries.constant_score).toBeDefined();
      expect(allQueries.dis_max).toBeDefined();
      expect(allQueries.function_score).toBeDefined();
    });

    it('should have joining queries', () => {
      expect(allQueries.nested).toBeDefined();
      expect(allQueries.has_child).toBeDefined();
      expect(allQueries.has_parent).toBeDefined();
      expect(allQueries.parent_id).toBeDefined();
    });

    it('should have geo queries', () => {
      expect(allQueries.geo_bounding_box).toBeDefined();
      expect(allQueries.geo_distance).toBeDefined();
      expect(allQueries.geo_shape).toBeDefined();
    });

    it('should have specialized queries', () => {
      expect(allQueries.more_like_this).toBeDefined();
      expect(allQueries.script).toBeDefined();
      expect(allQueries.script_score).toBeDefined();
      expect(allQueries.percolate).toBeDefined();
    });

    it('should have match_all and match_none queries', () => {
      expect(allQueries.match_all).toBeDefined();
      expect(allQueries.match_none).toBeDefined();
    });
  });

  describe('Query definitions', () => {
    it('should have name for each query', () => {
      for (const [key, query] of Object.entries(allQueries)) {
        expect(query.name).toBe(key);
      }
    });

    it('should have description for most queries', () => {
      let queriesWithDescription = 0;
      for (const query of Object.values(allQueries)) {
        if (query.description) {
          queriesWithDescription++;
        }
      }
      // Most queries should have descriptions
      expect(queriesWithDescription / Object.keys(allQueries).length).toBeGreaterThan(0.9);
    });

    it('should have snippet for each query', () => {
      for (const query of Object.values(allQueries)) {
        expect(query.snippet).toBeDefined();
        expect(typeof query.snippet).toBe('string');
        expect(query.snippet.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getQueryTypes', () => {
    it('should return all queries when no version specified', () => {
      const queries = queryDslProvider.getQueryTypes(BackendType.ELASTICSEARCH);
      
      expect(Object.keys(queries).length).toBe(Object.keys(allQueries).length);
    });

    it('should filter queries by version', () => {
      // knn query requires ES 8.0+
      const oldVersionQueries = queryDslProvider.getQueryTypes(BackendType.ELASTICSEARCH, '7.10.0');
      const newVersionQueries = queryDslProvider.getQueryTypes(BackendType.ELASTICSEARCH, '8.5.0');
      
      // knn should not be in old version
      expect(oldVersionQueries.knn).toBeUndefined();
      // knn should be in new version
      expect(newVersionQueries.knn).toBeDefined();
    });

    it('should include combined_fields for ES 7.13+', () => {
      const oldQueries = queryDslProvider.getQueryTypes(BackendType.ELASTICSEARCH, '7.12.0');
      const newQueries = queryDslProvider.getQueryTypes(BackendType.ELASTICSEARCH, '7.13.0');
      
      expect(oldQueries.combined_fields).toBeUndefined();
      expect(newQueries.combined_fields).toBeDefined();
    });
  });

  describe('getQueryProperties', () => {
    it('should return properties for match query', () => {
      const properties = queryDslProvider.getQueryProperties('match');
      
      expect(properties).toBeDefined();
      expect(properties?.['*']).toBeDefined();
      expect(properties?.['*'].properties?.query).toBeDefined();
      expect(properties?.['*'].properties?.operator).toBeDefined();
    });

    it('should return properties for bool query', () => {
      const properties = queryDslProvider.getQueryProperties('bool');
      
      expect(properties).toBeDefined();
      expect(properties?.must).toBeDefined();
      expect(properties?.filter).toBeDefined();
      expect(properties?.should).toBeDefined();
      expect(properties?.must_not).toBeDefined();
    });

    it('should return undefined for non-existent query', () => {
      const properties = queryDslProvider.getQueryProperties('nonexistent');
      
      expect(properties).toBeUndefined();
    });
  });

  describe('getQuerySnippet', () => {
    it('should return snippet for match query', () => {
      const snippet = queryDslProvider.getQuerySnippet('match');
      
      expect(snippet).toBeDefined();
      expect(snippet).toContain('match');
    });

    it('should return snippet for bool query', () => {
      const snippet = queryDslProvider.getQuerySnippet('bool');
      
      expect(snippet).toBeDefined();
      expect(snippet).toContain('bool');
      expect(snippet).toContain('must');
    });

    it('should return undefined for non-existent query', () => {
      const snippet = queryDslProvider.getQuerySnippet('nonexistent');
      
      expect(snippet).toBeUndefined();
    });
  });

  describe('getQueryDescription', () => {
    it('should return description for match query', () => {
      const description = queryDslProvider.getQueryDescription('match');
      
      expect(description).toBeDefined();
      expect(description?.toLowerCase()).toContain('match');
    });

    it('should return undefined for non-existent query', () => {
      const description = queryDslProvider.getQueryDescription('nonexistent');
      
      expect(description).toBeUndefined();
    });
  });
});
