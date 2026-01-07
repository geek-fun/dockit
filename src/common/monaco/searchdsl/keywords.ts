import { allQueries, QueryDef } from './queryDsl';
import { BodyProperty } from './types';


const methods = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH', 'TRACE'];
const paths = [
  '_search',
  '_cat',
  '_count',
  '_mapping',
  '_cluster',
  '_nodes',
  '_aliases',
  '_doc',
  '_update',
  '_bulk',
  '_search_shards',
  '_validate/query',
  'stats',
  'indices',
  'index',
  'type',
  'types',
  // query parameters & enum values
  'search_type',
  'query_then_fetch',
  'query_and_fetch',
  'dfs_query_then_fetch',
  'dfs_query_and_fetch',
  'count',
  'scan',
  'preference',
  '_primary',
  '_primary_first',
  '_local',
  '_only_node:',
  '_prefer_node:',
  '_shards:',
];

/**
 * Extract keywords from query definitions
 */
const getKeywordsFromQueries = (queries: { [key: string]: QueryDef }): string[] => {
  const keywords: string[] = [];

  const extractFromProperties = (properties?: { [key: string]: BodyProperty }): void => {
    if (!properties) return;
    for (const [key, prop] of Object.entries(properties)) {
      if (key !== '*') {
        keywords.push(key);
      }
      if (prop.properties) {
        extractFromProperties(prop.properties);
      }
    }
  };

  for (const [name, query] of Object.entries(queries)) {
    keywords.push(name);
    extractFromProperties(query.properties);
  }

  return keywords;
};

// Common search body keywords
const searchBodyKeywords = [
  'query',
  'from',
  'size',
  'aggs',
  'sort',
  'type',
  'version',
  'min_score',
  'fields',
  'script_fields',
  'partial_fields',
  'highlight',
  '_source',
  'track_total_hits',
  'explain',
  'stored_fields',
  'docvalue_fields',
  'seq_no_primary_term',
  'timeout',
  'terminate_after',
  'track_scores',
  'collapse',
  'suggest',
  'search_after',
  'rescore',
  'pit',
  'runtime_mappings',
  'stats',
  'indices_boost',
  'slice',
];

const queryKeywords = getKeywordsFromQueries(allQueries);

const keywords = Array.from(
  new Set([...methods, ...paths, ...searchBodyKeywords, ...queryKeywords]),
).filter(Boolean);

export { keywords, paths };
