/**
 * Query DSL Specification
 * Provides definitions for Elasticsearch/OpenSearch Query DSL
 * 
 * This module defines the structure and available options for Query DSL,
 * enabling grammar-driven completions for the body of search requests.
 */

import { BackendType, BodyProperty } from './types';
import { isVersionInRange } from './utils';

/**
 * Query type definition
 */
export type QueryDef = {
  name: string;
  description?: string;
  docUrl?: string;
  snippet: string;
  properties?: { [key: string]: BodyProperty };
  deprecated?: boolean;
  availability?: {
    [key in BackendType]?: { min?: string; max?: string };
  };
};

/**
 * Full-text queries
 */
export const fullTextQueries: { [key: string]: QueryDef } = {
  match: {
    name: 'match',
    description: 'Returns documents that match a provided text, number, date or boolean value',
    snippet: `match: {\n\t\${1:FIELD}: "\${2:TEXT}"\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text to search for' },
          operator: { type: 'string', description: 'Boolean logic', enum: ['or', 'and'] },
          fuzziness: { type: 'string', description: 'Fuzziness for matching' },
          prefix_length: { type: 'integer', description: 'Prefix length for fuzzy matching' },
          max_expansions: { type: 'integer', description: 'Maximum expansions for fuzzy matching' },
          zero_terms_query: { type: 'string', description: 'Behavior for zero terms', enum: ['none', 'all'] },
          auto_generate_synonyms_phrase_query: { type: 'boolean', description: 'Auto-generate synonym phrase queries' },
          analyzer: { type: 'string', description: 'Analyzer to use' },
          minimum_should_match: { type: 'string', description: 'Minimum should match' },
          lenient: { type: 'boolean', description: 'Ignore format-based errors' },
          boost: { type: 'number', description: 'Boost factor' },
        },
      },
    },
  },
  match_phrase: {
    name: 'match_phrase',
    description: 'Returns documents that contain an exact phrase',
    snippet: `match_phrase: {\n\t\${1:FIELD}: "\${2:PHRASE}"\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Phrase to search for' },
          slop: { type: 'integer', description: 'Number of positions between terms' },
          analyzer: { type: 'string', description: 'Analyzer to use' },
          zero_terms_query: { type: 'string', description: 'Behavior for zero terms', enum: ['none', 'all'] },
          boost: { type: 'number', description: 'Boost factor' },
        },
      },
    },
  },
  match_phrase_prefix: {
    name: 'match_phrase_prefix',
    description: 'Returns documents that contain a phrase prefix',
    snippet: `match_phrase_prefix: {\n\t\${1:FIELD}: "\${2:PREFIX}"\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Phrase prefix to search for' },
          slop: { type: 'integer', description: 'Number of positions between terms' },
          max_expansions: { type: 'integer', description: 'Maximum expansions', default: 50 },
          analyzer: { type: 'string', description: 'Analyzer to use' },
          zero_terms_query: { type: 'string', description: 'Behavior for zero terms', enum: ['none', 'all'] },
          boost: { type: 'number', description: 'Boost factor' },
        },
      },
    },
  },
  multi_match: {
    name: 'multi_match',
    description: 'Returns documents matching across multiple fields',
    snippet: `multi_match: {\n\tquery: "\${1:TEXT}",\n\tfields: [\${2:FIELDS}]\n}`,
    properties: {
      query: { type: 'string', description: 'Text to search for', required: true },
      fields: { type: 'array', description: 'Fields to search in', required: true },
      type: {
        type: 'string',
        description: 'Multi-match type',
        enum: ['best_fields', 'most_fields', 'cross_fields', 'phrase', 'phrase_prefix', 'bool_prefix'],
      },
      tie_breaker: { type: 'number', description: 'Tie breaker for multiple matches' },
      operator: { type: 'string', description: 'Boolean logic', enum: ['or', 'and'] },
      minimum_should_match: { type: 'string', description: 'Minimum should match' },
      analyzer: { type: 'string', description: 'Analyzer to use' },
      boost: { type: 'number', description: 'Boost factor' },
      fuzziness: { type: 'string', description: 'Fuzziness for matching' },
      prefix_length: { type: 'integer', description: 'Prefix length for fuzzy matching' },
      max_expansions: { type: 'integer', description: 'Maximum expansions' },
      lenient: { type: 'boolean', description: 'Ignore format-based errors' },
      auto_generate_synonyms_phrase_query: { type: 'boolean', description: 'Auto-generate synonym phrase queries' },
    },
  },
  query_string: {
    name: 'query_string',
    description: 'Parses and executes a Lucene query string',
    snippet: `query_string: {\n\tquery: "\${1:QUERY}"\n}`,
    properties: {
      query: { type: 'string', description: 'Lucene query string', required: true },
      default_field: { type: 'string', description: 'Default field' },
      default_operator: { type: 'string', description: 'Default operator', enum: ['OR', 'AND'] },
      fields: { type: 'array', description: 'Fields to search in' },
      analyzer: { type: 'string', description: 'Analyzer to use' },
      allow_leading_wildcard: { type: 'boolean', description: 'Allow leading wildcard' },
      analyze_wildcard: { type: 'boolean', description: 'Analyze wildcards' },
      auto_generate_synonyms_phrase_query: { type: 'boolean', description: 'Auto-generate synonym phrase queries' },
      boost: { type: 'number', description: 'Boost factor' },
      enable_position_increments: { type: 'boolean', description: 'Enable position increments' },
      escape: { type: 'boolean', description: 'Escape special characters' },
      fuzziness: { type: 'string', description: 'Fuzziness for matching' },
      fuzzy_max_expansions: { type: 'integer', description: 'Maximum fuzzy expansions' },
      fuzzy_prefix_length: { type: 'integer', description: 'Fuzzy prefix length' },
      fuzzy_transpositions: { type: 'boolean', description: 'Allow fuzzy transpositions' },
      lenient: { type: 'boolean', description: 'Ignore format-based errors' },
      max_determinized_states: { type: 'integer', description: 'Maximum determinized automaton states' },
      minimum_should_match: { type: 'string', description: 'Minimum should match' },
      phrase_slop: { type: 'integer', description: 'Phrase slop' },
      quote_analyzer: { type: 'string', description: 'Analyzer for quoted text' },
      quote_field_suffix: { type: 'string', description: 'Suffix for quoted field search' },
      rewrite: { type: 'string', description: 'Rewrite method' },
      time_zone: { type: 'string', description: 'Time zone for date parsing' },
      type: { type: 'string', description: 'Query type', enum: ['best_fields', 'most_fields', 'cross_fields', 'phrase', 'phrase_prefix'] },
    },
  },
  simple_query_string: {
    name: 'simple_query_string',
    description: 'Returns documents based on a simple query string',
    snippet: `simple_query_string: {\n\tquery: "\${1:QUERY}"\n}`,
    properties: {
      query: { type: 'string', description: 'Simple query string', required: true },
      fields: { type: 'array', description: 'Fields to search in' },
      default_operator: { type: 'string', description: 'Default operator', enum: ['OR', 'AND'] },
      analyzer: { type: 'string', description: 'Analyzer to use' },
      flags: { type: 'string', description: 'Query flags' },
      analyze_wildcard: { type: 'boolean', description: 'Analyze wildcards' },
      auto_generate_synonyms_phrase_query: { type: 'boolean', description: 'Auto-generate synonym phrase queries' },
      boost: { type: 'number', description: 'Boost factor' },
      fuzzy_max_expansions: { type: 'integer', description: 'Maximum fuzzy expansions' },
      fuzzy_prefix_length: { type: 'integer', description: 'Fuzzy prefix length' },
      fuzzy_transpositions: { type: 'boolean', description: 'Allow fuzzy transpositions' },
      lenient: { type: 'boolean', description: 'Ignore format-based errors' },
      minimum_should_match: { type: 'string', description: 'Minimum should match' },
      quote_field_suffix: { type: 'string', description: 'Suffix for quoted field search' },
    },
  },
  combined_fields: {
    name: 'combined_fields',
    description: 'Searches multiple fields as one combined field',
    snippet: `combined_fields: {\n\tquery: "\${1:TEXT}",\n\tfields: [\${2:FIELDS}]\n}`,
    properties: {
      query: { type: 'string', description: 'Text to search for', required: true },
      fields: { type: 'array', description: 'Fields to combine', required: true },
      operator: { type: 'string', description: 'Boolean logic', enum: ['or', 'and'] },
      minimum_should_match: { type: 'string', description: 'Minimum should match' },
      zero_terms_query: { type: 'string', description: 'Behavior for zero terms', enum: ['none', 'all'] },
      auto_generate_synonyms_phrase_query: { type: 'boolean', description: 'Auto-generate synonym phrase queries' },
      boost: { type: 'number', description: 'Boost factor' },
    },
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.13.0' } },
  },
  intervals: {
    name: 'intervals',
    description: 'Returns documents based on the order and proximity of matching terms',
    snippet: `intervals: {\n\t\${1:FIELD}: {\n\t\t\${2:type}: {}\n\t}\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          match: { type: 'object', description: 'Match interval' },
          prefix: { type: 'object', description: 'Prefix interval' },
          wildcard: { type: 'object', description: 'Wildcard interval' },
          fuzzy: { type: 'object', description: 'Fuzzy interval' },
          all_of: { type: 'object', description: 'All intervals must match' },
          any_of: { type: 'object', description: 'Any interval can match' },
          filter: { type: 'object', description: 'Filter intervals' },
        },
      },
    },
  },
};

/**
 * Term-level queries
 */
export const termLevelQueries: { [key: string]: QueryDef } = {
  term: {
    name: 'term',
    description: 'Returns documents that contain an exact term',
    snippet: `term: {\n\t\${1:FIELD}: {\n\t\tvalue: "\${2:VALUE}"\n\t}\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          value: { type: 'string', description: 'Term value', required: true },
          boost: { type: 'number', description: 'Boost factor' },
          case_insensitive: { type: 'boolean', description: 'Case insensitive matching' },
        },
      },
    },
  },
  terms: {
    name: 'terms',
    description: 'Returns documents that contain one or more exact terms',
    snippet: `terms: {\n\t\${1:FIELD}: [\${2:VALUES}]\n}`,
    properties: {
      '*': { type: 'array', description: 'Term values' },
      boost: { type: 'number', description: 'Boost factor' },
    },
  },
  terms_set: {
    name: 'terms_set',
    description: 'Returns documents that contain a minimum number of exact terms',
    snippet: `terms_set: {\n\t\${1:FIELD}: {\n\t\tterms: [\${2:VALUES}],\n\t\tminimum_should_match_field: "\${3:FIELD}"\n\t}\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          terms: { type: 'array', description: 'Term values', required: true },
          minimum_should_match_field: { type: 'string', description: 'Field for minimum match count' },
          minimum_should_match_script: { type: 'object', description: 'Script for minimum match count' },
          boost: { type: 'number', description: 'Boost factor' },
        },
      },
    },
  },
  range: {
    name: 'range',
    description: 'Returns documents that contain terms within a range',
    snippet: `range: {\n\t\${1:FIELD}: {\n\t\tgte: \${2:MIN},\n\t\tlte: \${3:MAX}\n\t}\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          gte: { type: 'string', description: 'Greater than or equal' },
          gt: { type: 'string', description: 'Greater than' },
          lte: { type: 'string', description: 'Less than or equal' },
          lt: { type: 'string', description: 'Less than' },
          format: { type: 'string', description: 'Date format' },
          time_zone: { type: 'string', description: 'Time zone' },
          relation: { type: 'string', description: 'Shape relation', enum: ['INTERSECTS', 'CONTAINS', 'WITHIN'] },
          boost: { type: 'number', description: 'Boost factor' },
        },
      },
    },
  },
  prefix: {
    name: 'prefix',
    description: 'Returns documents that contain terms with a specified prefix',
    snippet: `prefix: {\n\t\${1:FIELD}: {\n\t\tvalue: "\${2:PREFIX}"\n\t}\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          value: { type: 'string', description: 'Prefix value', required: true },
          rewrite: { type: 'string', description: 'Rewrite method' },
          case_insensitive: { type: 'boolean', description: 'Case insensitive matching' },
          boost: { type: 'number', description: 'Boost factor' },
        },
      },
    },
  },
  wildcard: {
    name: 'wildcard',
    description: 'Returns documents that contain terms matching a wildcard pattern',
    snippet: `wildcard: {\n\t\${1:FIELD}: {\n\t\tvalue: "\${2:PATTERN}"\n\t}\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          value: { type: 'string', description: 'Wildcard pattern', required: true },
          rewrite: { type: 'string', description: 'Rewrite method' },
          case_insensitive: { type: 'boolean', description: 'Case insensitive matching' },
          boost: { type: 'number', description: 'Boost factor' },
        },
      },
    },
  },
  regexp: {
    name: 'regexp',
    description: 'Returns documents that contain terms matching a regular expression',
    snippet: `regexp: {\n\t\${1:FIELD}: {\n\t\tvalue: "\${2:REGEX}"\n\t}\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          value: { type: 'string', description: 'Regular expression', required: true },
          flags: { type: 'string', description: 'Regex flags' },
          case_insensitive: { type: 'boolean', description: 'Case insensitive matching' },
          max_determinized_states: { type: 'integer', description: 'Maximum automaton states' },
          rewrite: { type: 'string', description: 'Rewrite method' },
          boost: { type: 'number', description: 'Boost factor' },
        },
      },
    },
  },
  fuzzy: {
    name: 'fuzzy',
    description: 'Returns documents that contain terms similar to the specified term',
    snippet: `fuzzy: {\n\t\${1:FIELD}: {\n\t\tvalue: "\${2:VALUE}"\n\t}\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          value: { type: 'string', description: 'Term value', required: true },
          fuzziness: { type: 'string', description: 'Fuzziness level' },
          max_expansions: { type: 'integer', description: 'Maximum expansions' },
          prefix_length: { type: 'integer', description: 'Prefix length' },
          transpositions: { type: 'boolean', description: 'Allow transpositions' },
          rewrite: { type: 'string', description: 'Rewrite method' },
          boost: { type: 'number', description: 'Boost factor' },
        },
      },
    },
  },
  ids: {
    name: 'ids',
    description: 'Returns documents based on their IDs',
    snippet: `ids: {\n\tvalues: [\${1:IDS}]\n}`,
    properties: {
      values: { type: 'array', description: 'Document IDs', required: true },
    },
  },
  exists: {
    name: 'exists',
    description: 'Returns documents that contain a field',
    snippet: `exists: {\n\tfield: "\${1:FIELD}"\n}`,
    properties: {
      field: { type: 'string', description: 'Field name', required: true },
    },
  },
};

/**
 * Compound queries
 */
export const compoundQueries: { [key: string]: QueryDef } = {
  bool: {
    name: 'bool',
    description: 'Combines multiple queries with boolean logic',
    snippet: `bool: {\n\tmust: [\n\t\t{}\n\t]\n}`,
    properties: {
      must: { type: 'array', description: 'Queries that must match' },
      filter: { type: 'array', description: 'Queries that must match but do not contribute to score' },
      should: { type: 'array', description: 'Queries that should match' },
      must_not: { type: 'array', description: 'Queries that must not match' },
      minimum_should_match: { type: 'string', description: 'Minimum number of should clauses' },
      boost: { type: 'number', description: 'Boost factor' },
    },
  },
  boosting: {
    name: 'boosting',
    description: 'Returns documents matching positive query, reducing score for negative query matches',
    snippet: `boosting: {\n\tpositive: {},\n\tnegative: {},\n\tnegative_boost: 0.5\n}`,
    properties: {
      positive: { type: 'object', description: 'Positive query', required: true },
      negative: { type: 'object', description: 'Negative query', required: true },
      negative_boost: { type: 'number', description: 'Negative boost factor', required: true },
    },
  },
  constant_score: {
    name: 'constant_score',
    description: 'Wraps a filter query and returns a constant score',
    snippet: `constant_score: {\n\tfilter: {},\n\tboost: 1.0\n}`,
    properties: {
      filter: { type: 'object', description: 'Filter query', required: true },
      boost: { type: 'number', description: 'Boost factor' },
    },
  },
  dis_max: {
    name: 'dis_max',
    description: 'Returns documents matching any query, with score of best matching query',
    snippet: `dis_max: {\n\tqueries: [\n\t\t{}\n\t]\n}`,
    properties: {
      queries: { type: 'array', description: 'Queries to search', required: true },
      tie_breaker: { type: 'number', description: 'Tie breaker multiplier' },
      boost: { type: 'number', description: 'Boost factor' },
    },
  },
  function_score: {
    name: 'function_score',
    description: 'Modifies scores of documents using scoring functions',
    snippet: `function_score: {\n\tquery: {},\n\tfunctions: [\n\t\t{}\n\t]\n}`,
    properties: {
      query: { type: 'object', description: 'Base query' },
      functions: { type: 'array', description: 'Score functions' },
      score_mode: { type: 'string', description: 'Score combination mode', enum: ['multiply', 'sum', 'avg', 'first', 'max', 'min'] },
      boost_mode: { type: 'string', description: 'Boost combination mode', enum: ['multiply', 'replace', 'sum', 'avg', 'max', 'min'] },
      max_boost: { type: 'number', description: 'Maximum boost' },
      min_score: { type: 'number', description: 'Minimum score threshold' },
      boost: { type: 'number', description: 'Boost factor' },
    },
  },
};

/**
 * Joining queries
 */
export const joiningQueries: { [key: string]: QueryDef } = {
  nested: {
    name: 'nested',
    description: 'Returns documents with matching nested objects',
    snippet: `nested: {\n\tpath: "\${1:PATH}",\n\tquery: {}\n}`,
    properties: {
      path: { type: 'string', description: 'Nested object path', required: true },
      query: { type: 'object', description: 'Query to run on nested objects', required: true },
      score_mode: { type: 'string', description: 'Score mode', enum: ['avg', 'max', 'min', 'sum', 'none'] },
      ignore_unmapped: { type: 'boolean', description: 'Ignore unmapped paths' },
      inner_hits: { type: 'object', description: 'Inner hits configuration' },
    },
  },
  has_child: {
    name: 'has_child',
    description: 'Returns parent documents with matching child documents',
    snippet: `has_child: {\n\ttype: "\${1:TYPE}",\n\tquery: {}\n}`,
    properties: {
      type: { type: 'string', description: 'Child document type', required: true },
      query: { type: 'object', description: 'Query to run on child documents', required: true },
      score_mode: { type: 'string', description: 'Score mode', enum: ['avg', 'max', 'min', 'sum', 'none'] },
      min_children: { type: 'integer', description: 'Minimum matching children' },
      max_children: { type: 'integer', description: 'Maximum matching children' },
      ignore_unmapped: { type: 'boolean', description: 'Ignore unmapped types' },
      inner_hits: { type: 'object', description: 'Inner hits configuration' },
    },
  },
  has_parent: {
    name: 'has_parent',
    description: 'Returns child documents with matching parent documents',
    snippet: `has_parent: {\n\tparent_type: "\${1:TYPE}",\n\tquery: {}\n}`,
    properties: {
      parent_type: { type: 'string', description: 'Parent document type', required: true },
      query: { type: 'object', description: 'Query to run on parent documents', required: true },
      score: { type: 'boolean', description: 'Include parent score' },
      ignore_unmapped: { type: 'boolean', description: 'Ignore unmapped types' },
      inner_hits: { type: 'object', description: 'Inner hits configuration' },
    },
  },
  parent_id: {
    name: 'parent_id',
    description: 'Returns child documents joined to a parent document',
    snippet: `parent_id: {\n\ttype: "\${1:TYPE}",\n\tid: "\${2:ID}"\n}`,
    properties: {
      type: { type: 'string', description: 'Child document type', required: true },
      id: { type: 'string', description: 'Parent document ID', required: true },
      ignore_unmapped: { type: 'boolean', description: 'Ignore unmapped types' },
    },
  },
};

/**
 * Geo queries
 */
export const geoQueries: { [key: string]: QueryDef } = {
  geo_bounding_box: {
    name: 'geo_bounding_box',
    description: 'Returns documents with geo-points within a bounding box',
    snippet: `geo_bounding_box: {\n\t\${1:FIELD}: {\n\t\ttop_left: { lat: \${2:LAT}, lon: \${3:LON} },\n\t\tbottom_right: { lat: \${4:LAT}, lon: \${5:LON} }\n\t}\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          top_left: { type: 'object', description: 'Top-left corner' },
          bottom_right: { type: 'object', description: 'Bottom-right corner' },
          top_right: { type: 'object', description: 'Top-right corner' },
          bottom_left: { type: 'object', description: 'Bottom-left corner' },
        },
      },
      validation_method: { type: 'string', description: 'Validation method', enum: ['STRICT', 'IGNORE_MALFORMED', 'COERCE'] },
      type: { type: 'string', description: 'Execution type', enum: ['memory', 'indexed'] },
      ignore_unmapped: { type: 'boolean', description: 'Ignore unmapped fields' },
    },
  },
  geo_distance: {
    name: 'geo_distance',
    description: 'Returns documents with geo-points within a distance',
    snippet: `geo_distance: {\n\tdistance: "\${1:DISTANCE}",\n\t\${2:FIELD}: { lat: \${3:LAT}, lon: \${4:LON} }\n}`,
    properties: {
      distance: { type: 'string', description: 'Distance from center point', required: true },
      distance_type: { type: 'string', description: 'Distance calculation type', enum: ['arc', 'plane'] },
      validation_method: { type: 'string', description: 'Validation method', enum: ['STRICT', 'IGNORE_MALFORMED', 'COERCE'] },
      ignore_unmapped: { type: 'boolean', description: 'Ignore unmapped fields' },
    },
  },
  geo_polygon: {
    name: 'geo_polygon',
    description: 'Returns documents with geo-points within a polygon',
    snippet: `geo_polygon: {\n\t\${1:FIELD}: {\n\t\tpoints: []\n\t}\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          points: { type: 'array', description: 'Polygon points', required: true },
        },
      },
      validation_method: { type: 'string', description: 'Validation method', enum: ['STRICT', 'IGNORE_MALFORMED', 'COERCE'] },
      ignore_unmapped: { type: 'boolean', description: 'Ignore unmapped fields' },
    },
    deprecated: true,
  },
  geo_shape: {
    name: 'geo_shape',
    description: 'Returns documents with geo-shapes matching a shape query',
    snippet: `geo_shape: {\n\t\${1:FIELD}: {\n\t\tshape: {},\n\t\trelation: "intersects"\n\t}\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          shape: { type: 'object', description: 'GeoJSON shape' },
          indexed_shape: { type: 'object', description: 'Pre-indexed shape reference' },
          relation: { type: 'string', description: 'Spatial relation', enum: ['intersects', 'disjoint', 'within', 'contains'] },
        },
      },
      ignore_unmapped: { type: 'boolean', description: 'Ignore unmapped fields' },
    },
  },
};

/**
 * Shape queries
 */
export const shapeQueries: { [key: string]: QueryDef } = {
  shape: {
    name: 'shape',
    description: 'Returns documents with shapes matching a shape query',
    snippet: `shape: {\n\t\${1:FIELD}: {\n\t\tshape: {},\n\t\trelation: "intersects"\n\t}\n}`,
    properties: {
      '*': {
        type: 'object',
        properties: {
          shape: { type: 'object', description: 'Shape geometry' },
          indexed_shape: { type: 'object', description: 'Pre-indexed shape reference' },
          relation: { type: 'string', description: 'Spatial relation', enum: ['intersects', 'disjoint', 'within', 'contains'] },
        },
      },
      ignore_unmapped: { type: 'boolean', description: 'Ignore unmapped fields' },
    },
  },
};

/**
 * Specialized queries
 */
export const specializedQueries: { [key: string]: QueryDef } = {
  more_like_this: {
    name: 'more_like_this',
    description: 'Returns documents similar to the provided text, document, or collection of documents',
    snippet: `more_like_this: {\n\tfields: [\${1:FIELDS}],\n\tlike: "\${2:TEXT}"\n}`,
    properties: {
      fields: { type: 'array', description: 'Fields to analyze' },
      like: { type: 'string', description: 'Text or documents to find similar matches', required: true },
      unlike: { type: 'string', description: 'Text or documents to exclude' },
      min_term_freq: { type: 'integer', description: 'Minimum term frequency' },
      max_query_terms: { type: 'integer', description: 'Maximum query terms' },
      min_doc_freq: { type: 'integer', description: 'Minimum document frequency' },
      max_doc_freq: { type: 'integer', description: 'Maximum document frequency' },
      min_word_length: { type: 'integer', description: 'Minimum word length' },
      max_word_length: { type: 'integer', description: 'Maximum word length' },
      stop_words: { type: 'array', description: 'Stop words' },
      analyzer: { type: 'string', description: 'Analyzer to use' },
      include: { type: 'boolean', description: 'Include input documents' },
      boost_terms: { type: 'number', description: 'Term boost factor' },
      boost: { type: 'number', description: 'Boost factor' },
    },
  },
  script: {
    name: 'script',
    description: 'Returns documents matching a script-based query',
    snippet: `script: {\n\tscript: {\n\t\tsource: "\${1:SCRIPT}"\n\t}\n}`,
    properties: {
      script: {
        type: 'object',
        description: 'Script definition',
        required: true,
        properties: {
          source: { type: 'string', description: 'Script source' },
          lang: { type: 'string', description: 'Script language' },
          params: { type: 'object', description: 'Script parameters' },
        },
      },
      boost: { type: 'number', description: 'Boost factor' },
    },
  },
  script_score: {
    name: 'script_score',
    description: 'Uses a script to compute custom scores',
    snippet: `script_score: {\n\tquery: {},\n\tscript: {\n\t\tsource: "\${1:SCRIPT}"\n\t}\n}`,
    properties: {
      query: { type: 'object', description: 'Base query', required: true },
      script: {
        type: 'object',
        description: 'Script definition',
        required: true,
        properties: {
          source: { type: 'string', description: 'Script source' },
          lang: { type: 'string', description: 'Script language' },
          params: { type: 'object', description: 'Script parameters' },
        },
      },
      min_score: { type: 'number', description: 'Minimum score threshold' },
      boost: { type: 'number', description: 'Boost factor' },
    },
  },
  percolate: {
    name: 'percolate',
    description: 'Returns stored queries that match the provided document',
    snippet: `percolate: {\n\tfield: "\${1:FIELD}",\n\tdocument: {}\n}`,
    properties: {
      field: { type: 'string', description: 'Percolator field', required: true },
      document: { type: 'object', description: 'Document to percolate' },
      documents: { type: 'array', description: 'Documents to percolate' },
      index: { type: 'string', description: 'Index for document lookup' },
      id: { type: 'string', description: 'Document ID for lookup' },
      routing: { type: 'string', description: 'Routing for document lookup' },
      preference: { type: 'string', description: 'Preference for document lookup' },
      version: { type: 'integer', description: 'Version for document lookup' },
      name: { type: 'string', description: 'Query name' },
    },
  },
  rank_feature: {
    name: 'rank_feature',
    description: 'Boosts relevance score based on rank_feature field values',
    snippet: `rank_feature: {\n\tfield: "\${1:FIELD}"\n}`,
    properties: {
      field: { type: 'string', description: 'Rank feature field', required: true },
      saturation: { type: 'object', description: 'Saturation function' },
      log: { type: 'object', description: 'Log function' },
      sigmoid: { type: 'object', description: 'Sigmoid function' },
      linear: { type: 'object', description: 'Linear function' },
      boost: { type: 'number', description: 'Boost factor' },
    },
  },
  distance_feature: {
    name: 'distance_feature',
    description: 'Boosts relevance score based on distance from a date or geo_point',
    snippet: `distance_feature: {\n\tfield: "\${1:FIELD}",\n\tpivot: "\${2:PIVOT}",\n\torigin: "\${3:ORIGIN}"\n}`,
    properties: {
      field: { type: 'string', description: 'Date or geo_point field', required: true },
      pivot: { type: 'string', description: 'Pivot distance/duration', required: true },
      origin: { type: 'string', description: 'Origin point or date', required: true },
      boost: { type: 'number', description: 'Boost factor' },
    },
  },
  wrapper: {
    name: 'wrapper',
    description: 'Accepts a base64 encoded query string',
    snippet: `wrapper: {\n\tquery: "\${1:BASE64_QUERY}"\n}`,
    properties: {
      query: { type: 'string', description: 'Base64 encoded query', required: true },
    },
  },
  pinned: {
    name: 'pinned',
    description: 'Promotes selected documents to the top of results',
    snippet: `pinned: {\n\tids: [\${1:IDS}],\n\torganic: {}\n}`,
    properties: {
      ids: { type: 'array', description: 'Document IDs to pin' },
      docs: { type: 'array', description: 'Documents to pin' },
      organic: { type: 'object', description: 'Organic query', required: true },
    },
  },
};

/**
 * Match all/none queries
 */
export const matchAllQueries: { [key: string]: QueryDef } = {
  match_all: {
    name: 'match_all',
    description: 'Returns all documents',
    snippet: `match_all: {}`,
    properties: {
      boost: { type: 'number', description: 'Boost factor' },
    },
  },
  match_none: {
    name: 'match_none',
    description: 'Returns no documents',
    snippet: `match_none: {}`,
    properties: {},
  },
};

/**
 * Vector queries (for kNN/semantic search)
 */
export const vectorQueries: { [key: string]: QueryDef } = {
  knn: {
    name: 'knn',
    description: 'k-nearest neighbor search on dense vectors',
    snippet: `knn: {\n\tfield: "\${1:FIELD}",\n\tquery_vector: [\${2:VECTOR}],\n\tk: \${3:K},\n\tnum_candidates: \${4:CANDIDATES}\n}`,
    properties: {
      field: { type: 'string', description: 'Vector field', required: true },
      query_vector: { type: 'array', description: 'Query vector', required: true },
      query_vector_builder: { type: 'object', description: 'Query vector builder' },
      k: { type: 'integer', description: 'Number of nearest neighbors', required: true },
      num_candidates: { type: 'integer', description: 'Number of candidates to consider', required: true },
      filter: { type: 'object', description: 'Pre-filter query' },
      similarity: { type: 'number', description: 'Minimum similarity threshold' },
      boost: { type: 'number', description: 'Boost factor' },
    },
    availability: { [BackendType.ELASTICSEARCH]: { min: '8.0.0' }, [BackendType.OPENSEARCH]: { min: '2.0.0' } },
  },
};

/**
 * All query types combined
 */
export const allQueries: { [key: string]: QueryDef } = {
  ...fullTextQueries,
  ...termLevelQueries,
  ...compoundQueries,
  ...joiningQueries,
  ...geoQueries,
  ...shapeQueries,
  ...specializedQueries,
  ...matchAllQueries,
  ...vectorQueries,
};

/**
 * Query DSL provider class
 */
export class QueryDslProvider {
  /**
   * Get all query types for a backend
   */
  getQueryTypes(backend: BackendType, version?: string): { [key: string]: QueryDef } {
    if (!version) {
      return allQueries;
    }

    return Object.entries(allQueries)
      .filter(([_, query]) => this.isAvailable(query, backend, version))
      .reduce((acc, [key, query]) => ({ ...acc, [key]: query }), {});
  }

  /**
   * Check if a query is available for a backend/version
   */
  private isAvailable(query: QueryDef, backend: BackendType, version: string): boolean {
    if (!query.availability) return true;
    const availability = query.availability[backend];
    if (!availability) return true;
    return isVersionInRange(version, availability);
  }

  /**
   * Get properties for a query type
   */
  getQueryProperties(queryType: string): { [key: string]: BodyProperty } | undefined {
    const query = allQueries[queryType];
    return query?.properties;
  }

  /**
   * Get snippet for a query type
   */
  getQuerySnippet(queryType: string): string | undefined {
    const query = allQueries[queryType];
    return query?.snippet;
  }

  /**
   * Get description for a query type
   */
  getQueryDescription(queryType: string): string | undefined {
    const query = allQueries[queryType];
    return query?.description;
  }
}

// Export singleton instance
export const queryDslProvider = new QueryDslProvider();
