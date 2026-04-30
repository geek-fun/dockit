/**
 * API Specification Provider
 * Provides endpoint and Query DSL definitions for Elasticsearch and OpenSearch
 *
 * This module serves as the foundation for spec-driven completions.
 * In the future, this can be extended to load from elasticsearch-specification
 * and opensearch-api-specification repositories.
 *
 * For i18n translation support:
 * - Each endpoint has a `descriptionKey` field (e.g., 'grammar.search')
 * - Translations are defined in src/lang/enUS.ts and src/lang/zhCN.ts
 * - Use lang.global.t(descriptionKey) in Vue components for localized descriptions
 */

import { ApiEndpoint, BackendType, HttpMethod } from './types';
import { isVersionInRange } from '../monacoUtils';

/**
 * Base endpoints available in both Elasticsearch and OpenSearch
 */
const commonEndpoints: ApiEndpoint[] = [
  // Search APIs
  {
    path: '/_search',
    methods: ['GET', 'POST'],
    description: 'Execute a search query',
    descriptionKey: 'grammar.search',
    docPath: 'operation-search',
    queryParams: [
      { name: 'q', type: 'string', description: 'Query in the Lucene query string syntax' },
      { name: 'df', type: 'string', description: 'Default field for query string' },
      { name: 'analyzer', type: 'string', description: 'Analyzer to use for query string' },
      {
        name: 'default_operator',
        type: 'string',
        description: 'Default operator for query string',
        enum: ['AND', 'OR'],
      },
      { name: 'from', type: 'integer', description: 'Starting offset', default: 0 },
      { name: 'size', type: 'integer', description: 'Number of hits to return', default: 10 },
      { name: 'sort', type: 'string', description: 'Sort order' },
      { name: 'timeout', type: 'string', description: 'Search timeout' },
      {
        name: 'terminate_after',
        type: 'integer',
        description: 'Maximum number of documents to collect',
      },
      { name: 'track_total_hits', type: 'boolean', description: 'Track total number of hits' },
      {
        name: 'search_type',
        type: 'string',
        description: 'Search type',
        enum: ['query_then_fetch', 'dfs_query_then_fetch'],
      },
      { name: 'request_cache', type: 'boolean', description: 'Enable request cache' },
      { name: 'routing', type: 'string', description: 'Routing value' },
      { name: 'preference', type: 'string', description: 'Execution preference' },
    ],
    requestBody: {
      properties: {
        query: { type: 'object', description: 'Query DSL' },
        from: { type: 'integer', description: 'Starting offset' },
        size: { type: 'integer', description: 'Number of hits to return' },
        sort: { type: 'array', description: 'Sort order' },
        _source: { type: 'object', description: 'Source filtering' },
        aggs: { type: 'object', description: 'Aggregations' },
        aggregations: { type: 'object', description: 'Aggregations' },
        highlight: { type: 'object', description: 'Highlighting' },
        post_filter: { type: 'object', description: 'Post filter' },
        track_total_hits: { type: 'boolean', description: 'Track total hits' },
        explain: { type: 'boolean', description: 'Explain scoring' },
        profile: { type: 'boolean', description: 'Profile query execution' },
        timeout: { type: 'string', description: 'Search timeout' },
        min_score: { type: 'number', description: 'Minimum score threshold' },
        suggest: { type: 'object', description: 'Suggest queries' },
        script_fields: { type: 'object', description: 'Script fields' },
        stored_fields: { type: 'array', description: 'Stored fields to retrieve' },
        docvalue_fields: { type: 'array', description: 'Doc value fields to retrieve' },
        indices_boost: { type: 'array', description: 'Index boosting' },
        rescore: { type: 'object', description: 'Query rescoring' },
        search_after: { type: 'array', description: 'Search after for pagination' },
        pit: { type: 'object', description: 'Point in time' },
        runtime_mappings: { type: 'object', description: 'Runtime mappings' },
        seq_no_primary_term: {
          type: 'boolean',
          description: 'Return sequence number and primary term',
        },
        version: { type: 'boolean', description: 'Return version number' },
        collapse: { type: 'object', description: 'Field collapsing' },
        slice: { type: 'object', description: 'Sliced scroll' },
      },
    },
  },
  {
    path: '/{index}/_search',
    methods: ['GET', 'POST'],
    description: 'Execute a search query on a specific index',
    descriptionKey: 'grammar.searchIndex',
    docPath: 'operation-search',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name(s)', required: true }],
    queryParams: [
      { name: 'q', type: 'string', description: 'Query in the Lucene query string syntax' },
      { name: 'df', type: 'string', description: 'Default field for query string' },
      { name: 'analyzer', type: 'string', description: 'Analyzer to use for query string' },
      {
        name: 'default_operator',
        type: 'string',
        description: 'Default operator for query string',
        enum: ['AND', 'OR'],
      },
      { name: 'from', type: 'integer', description: 'Starting offset', default: 0 },
      { name: 'size', type: 'integer', description: 'Number of hits to return', default: 10 },
      { name: 'sort', type: 'string', description: 'Sort order' },
      { name: 'timeout', type: 'string', description: 'Search timeout' },
      {
        name: 'terminate_after',
        type: 'integer',
        description: 'Maximum number of documents to collect',
      },
      { name: 'track_total_hits', type: 'boolean', description: 'Track total number of hits' },
      {
        name: 'search_type',
        type: 'string',
        description: 'Search type',
        enum: ['query_then_fetch', 'dfs_query_then_fetch'],
      },
      { name: 'request_cache', type: 'boolean', description: 'Enable request cache' },
      { name: 'routing', type: 'string', description: 'Routing value' },
      { name: 'preference', type: 'string', description: 'Execution preference' },
    ],
  },

  // Count API
  {
    path: '/_count',
    methods: ['GET', 'POST'],
    description: 'Count documents matching a query',
    descriptionKey: 'grammar.count',
    docPath: 'operation-count',
    queryParams: [
      { name: 'q', type: 'string', description: 'Query in the Lucene query string syntax' },
      { name: 'df', type: 'string', description: 'Default field for query string' },
      { name: 'analyzer', type: 'string', description: 'Analyzer to use for query string' },
      {
        name: 'default_operator',
        type: 'string',
        description: 'Default operator',
        enum: ['AND', 'OR'],
      },
      { name: 'routing', type: 'string', description: 'Routing value' },
    ],
  },
  {
    path: '/{index}/_count',
    methods: ['GET', 'POST'],
    description: 'Count documents in a specific index',
    descriptionKey: 'grammar.countIndex',
    docPath: 'operation-count',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name(s)', required: true }],
    queryParams: [
      { name: 'q', type: 'string', description: 'Query in the Lucene query string syntax' },
      { name: 'df', type: 'string', description: 'Default field for query string' },
      { name: 'analyzer', type: 'string', description: 'Analyzer to use for query string' },
      {
        name: 'default_operator',
        type: 'string',
        description: 'Default operator',
        enum: ['AND', 'OR'],
      },
      { name: 'routing', type: 'string', description: 'Routing value' },
    ],
  },

  // Document APIs
  {
    path: '/{index}/_doc',
    methods: ['POST'],
    description: 'Index a document',
    descriptionKey: 'grammar.indexDoc',
    docPath: 'operation-index',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      { name: 'routing', type: 'string', description: 'Routing value' },
      {
        name: 'refresh',
        type: 'string',
        description: 'Refresh policy',
        enum: ['true', 'false', 'wait_for'],
      },
      { name: 'timeout', type: 'string', description: 'Operation timeout' },
      { name: 'pipeline', type: 'string', description: 'Ingest pipeline' },
    ],
  },
  {
    path: '/{index}/_doc/{id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Get, index, or delete a document by ID',
    descriptionKey: 'grammar.getDoc',
    docPath: 'operation-get',
    pathParams: [
      { name: 'index', type: 'string', description: 'Index name', required: true },
      { name: 'id', type: 'string', description: 'Document ID', required: true },
    ],
    queryParams: [
      { name: 'routing', type: 'string', description: 'Routing value' },
      { name: 'preference', type: 'string', description: 'Execution preference' },
      { name: 'realtime', type: 'boolean', description: 'Realtime get' },
      {
        name: 'version',
        type: 'integer',
        description: 'Document version for optimistic concurrency',
      },
      { name: '_source', type: 'string', description: 'Source fields to return' },
      {
        name: 'refresh',
        type: 'string',
        description: 'Refresh policy',
        enum: ['true', 'false', 'wait_for'],
      },
      { name: 'timeout', type: 'string', description: 'Operation timeout' },
    ],
  },
  {
    path: '/{index}/_update/{id}',
    methods: ['POST'],
    description: 'Update a document',
    descriptionKey: 'grammar.updateDoc',
    docPath: 'operation-update',
    pathParams: [
      { name: 'index', type: 'string', description: 'Index name', required: true },
      { name: 'id', type: 'string', description: 'Document ID', required: true },
    ],
    requestBody: {
      properties: {
        doc: { type: 'object', description: 'Partial document' },
        script: { type: 'object', description: 'Update script' },
        upsert: { type: 'object', description: 'Document to upsert' },
        doc_as_upsert: { type: 'boolean', description: 'Use doc as upsert' },
        detect_noop: { type: 'boolean', description: 'Detect noop updates' },
        _source: { type: 'object', description: 'Source filtering' },
      },
    },
  },

  // Bulk API
  {
    path: '/_bulk',
    methods: ['POST'],
    description: 'Perform multiple index/delete/update operations in a single request',
    descriptionKey: 'grammar.bulk',
    docPath: 'operation-bulk',
    queryParams: [
      {
        name: 'refresh',
        type: 'string',
        description: 'Refresh policy',
        enum: ['true', 'false', 'wait_for'],
      },
      { name: 'routing', type: 'string', description: 'Default routing' },
      { name: 'timeout', type: 'string', description: 'Operation timeout' },
      { name: 'pipeline', type: 'string', description: 'Default ingest pipeline' },
    ],
  },
  {
    path: '/{index}/_bulk',
    methods: ['POST'],
    description: 'Perform bulk operations on a specific index',
    docPath: 'operation-bulk',
    pathParams: [
      { name: 'index', type: 'string', description: 'Default index name', required: true },
    ],
    queryParams: [
      {
        name: 'refresh',
        type: 'string',
        description: 'Refresh policy',
        enum: ['true', 'false', 'wait_for'],
      },
      { name: 'routing', type: 'string', description: 'Default routing' },
      { name: 'timeout', type: 'string', description: 'Operation timeout' },
      { name: 'pipeline', type: 'string', description: 'Default ingest pipeline' },
    ],
  },

  // Index APIs
  {
    path: '/{index}',
    methods: ['GET', 'PUT', 'DELETE', 'HEAD'],
    description: 'Manage an index',
    docPath: 'operation-indices-create',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },
  {
    path: '/{index}/_mapping',
    methods: ['GET', 'PUT'],
    description: 'Get or update index mappings',
    docPath: 'operation-indices-put-mapping',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Specify timeout for connection to master',
      },
      { name: 'timeout', type: 'string', description: 'Explicit operation timeout' },
      {
        name: 'write_index_only',
        type: 'boolean',
        description: 'When true, applies mappings only to the write index of an alias',
      },
      {
        name: 'include_defaults',
        type: 'boolean',
        description: 'Whether to return all default mapping settings',
      },
    ],
  },
  {
    path: '/{index}/_settings',
    methods: ['GET', 'PUT'],
    description: 'Get or update index settings',
    docPath: 'operation-indices-update-settings',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      { name: 'flat_settings', type: 'boolean', description: 'Return settings in flat format' },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
      {
        name: 'include_defaults',
        type: 'boolean',
        description: 'Whether to return all default setting for each of the indices',
      },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Specify timeout for connection to master',
      },
      {
        name: 'preserve_existing',
        type: 'boolean',
        description:
          'Whether to update existing settings. If set to true existing settings on an index remain unchanged',
      },
      { name: 'timeout', type: 'string', description: 'Explicit operation timeout' },
    ],
  },
  {
    path: '/{index}/_open',
    methods: ['POST'],
    description: 'Open a closed index',
    docPath: 'operation-indices-open',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
      { name: 'timeout', type: 'string', description: 'Explicit operation timeout' },
      {
        name: 'wait_for_active_shards',
        type: 'string',
        description: 'Number of shard copies that must be active before proceeding',
      },
    ],
  },
  {
    path: '/{index}/_close',
    methods: ['POST'],
    description: 'Close an index',
    docPath: 'operation-indices-close',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
      { name: 'timeout', type: 'string', description: 'Explicit operation timeout' },
      {
        name: 'wait_for_active_shards',
        type: 'string',
        description: 'Number of shard copies that must be active before proceeding',
      },
    ],
  },
  {
    path: '/{index}/_refresh',
    methods: ['POST'],
    description: 'Refresh an index',
    docPath: 'operation-indices-refresh',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
    ],
  },
  {
    path: '/{index}/_flush',
    methods: ['POST'],
    description: 'Flush an index',
    docPath: 'operation-indices-flush',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'force',
        type: 'boolean',
        description: 'Force flush even if there are no changes to commit',
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
      {
        name: 'wait_if_ongoing',
        type: 'boolean',
        description: 'Block until flush completes if another flush is running',
      },
    ],
  },
  {
    path: '/{index}/_forcemerge',
    methods: ['POST'],
    description: 'Force merge an index',
    docPath: 'operation-indices-forcemerge',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      { name: 'max_num_segments', type: 'integer', description: 'Maximum number of segments' },
      { name: 'only_expunge_deletes', type: 'boolean', description: 'Only expunge deletes' },
      { name: 'flush', type: 'boolean', description: 'Flush after merge' },
    ],
  },

  // Alias APIs
  {
    path: '/_aliases',
    methods: ['GET', 'POST'],
    description: 'Manage index aliases',
    docPath: 'operation-indices-update-aliases',
    requestBody: {
      properties: {
        actions: {
          type: 'array',
          description: 'Actions to perform on aliases (add, remove, remove_index)',
          items: {
            type: 'object',
            properties: {
              add: { type: 'object', description: 'Add an alias to an index' },
              remove: { type: 'object', description: 'Remove an alias from an index' },
              remove_index: { type: 'object', description: 'Remove an index' },
            },
          },
        },
      },
    },
  },
  {
    path: '/{index}/_alias/{alias}',
    methods: ['GET', 'PUT', 'DELETE', 'HEAD'],
    description: 'Manage a specific alias',
    docPath: 'operation-indices-update-aliases',
    pathParams: [
      { name: 'index', type: 'string', description: 'Index name', required: true },
      { name: 'alias', type: 'string', description: 'Alias name', required: true },
    ],
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
    ],
  },
  {
    path: '/{index}/_alias',
    methods: ['GET'],
    description: 'Get all aliases for an index',
    docPath: 'operation-indices-update-aliases',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
    ],
  },

  // Cat APIs
  {
    path: '/_cat/indices',
    methods: ['GET'],
    description: 'List indices',
    docPath: 'operation-cat-indices',
    queryParams: [
      {
        name: 'format',
        type: 'string',
        description: 'Output format',
        enum: ['text', 'json', 'yaml', 'cbor', 'smile'],
      },
      { name: 'h', type: 'string', description: 'Columns to display' },
      { name: 's', type: 'string', description: 'Sort by column' },
      { name: 'v', type: 'boolean', description: 'Verbose output' },
      {
        name: 'health',
        type: 'string',
        description: 'Filter by health',
        enum: ['green', 'yellow', 'red'],
      },
    ],
  },
  {
    path: '/_cat/health',
    methods: ['GET'],
    description: 'Cluster health',
    docPath: 'operation-cat-health',
    queryParams: [
      {
        name: 'format',
        type: 'string',
        description: 'Output format',
        enum: ['text', 'json', 'yaml', 'cbor', 'smile'],
      },
      { name: 'v', type: 'boolean', description: 'Verbose output' },
    ],
  },
  {
    path: '/_cat/nodes',
    methods: ['GET'],
    description: 'List nodes',
    docPath: 'operation-cat-nodes',
    queryParams: [
      {
        name: 'format',
        type: 'string',
        description: 'Output format',
        enum: ['text', 'json', 'yaml', 'cbor', 'smile'],
      },
      { name: 'h', type: 'string', description: 'Columns to display' },
      { name: 'v', type: 'boolean', description: 'Verbose output' },
    ],
  },
  {
    path: '/_cat/shards',
    methods: ['GET'],
    description: 'List shards',
    docPath: 'operation-cat-shards',
    queryParams: [
      {
        name: 'format',
        type: 'string',
        description: 'Output format',
        enum: ['text', 'json', 'yaml', 'cbor', 'smile'],
      },
      { name: 'h', type: 'string', description: 'Columns to display' },
      { name: 'v', type: 'boolean', description: 'Verbose output' },
    ],
  },
  {
    path: '/_cat/aliases',
    methods: ['GET'],
    description: 'List aliases',
    docPath: 'operation-cat-aliases',
    queryParams: [
      {
        name: 'format',
        type: 'string',
        description: 'Output format',
        enum: ['text', 'json', 'yaml', 'cbor', 'smile'],
      },
      { name: 'v', type: 'boolean', description: 'Verbose output' },
    ],
  },
  {
    path: '/_cat/templates',
    methods: ['GET'],
    description: 'List templates',
    docPath: 'operation-cat-templates',
    queryParams: [
      {
        name: 'format',
        type: 'string',
        description: 'Output format',
        enum: ['text', 'json', 'yaml', 'cbor', 'smile'],
      },
      { name: 'v', type: 'boolean', description: 'Verbose output' },
    ],
  },
  {
    path: '/_cat/allocation',
    methods: ['GET'],
    description: 'Shard allocation',
    docPath: 'operation-cat-allocation',
    queryParams: [
      {
        name: 'format',
        type: 'string',
        description: 'Output format',
        enum: ['text', 'json', 'yaml', 'cbor', 'smile'],
      },
      { name: 'v', type: 'boolean', description: 'Verbose output' },
    ],
  },

  // Cluster APIs
  {
    path: '/_cluster/health',
    methods: ['GET'],
    description: 'Cluster health',
    docPath: 'operation-cluster-health',
    queryParams: [
      {
        name: 'wait_for_status',
        type: 'string',
        description: 'Wait for cluster status',
        enum: ['green', 'yellow', 'red'],
      },
      { name: 'timeout', type: 'string', description: 'Operation timeout' },
      {
        name: 'level',
        type: 'string',
        description: 'Detail level',
        enum: ['cluster', 'indices', 'shards'],
      },
    ],
  },
  {
    path: '/_cluster/state',
    methods: ['GET'],
    description: 'Cluster state',
    docPath: 'operation-cluster-state',
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      { name: 'flat_settings', type: 'boolean', description: 'Return settings in flat format' },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
      {
        name: 'local',
        type: 'boolean',
        description: 'Return local information, do not retrieve from master node',
      },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for waiting for new cluster state',
      },
      {
        name: 'wait_for_metadata_version',
        type: 'string',
        description: 'Wait for metadata version to be equal or greater than specified',
      },
      {
        name: 'wait_for_timeout',
        type: 'string',
        description: 'Maximum time to wait for wait_for_metadata_version before timing out',
      },
    ],
  },
  {
    path: '/_cluster/stats',
    methods: ['GET'],
    description: 'Cluster stats',
    docPath: 'operation-cluster-stats',
    queryParams: [
      {
        name: 'include_remotes',
        type: 'boolean',
        description: 'Include remote cluster data in response',
      },
      { name: 'timeout', type: 'string', description: 'Period to wait for each node to respond' },
    ],
  },
  {
    path: '/_cluster/settings',
    methods: ['GET', 'PUT'],
    description: 'Cluster settings',
    docPath: 'operation-cluster-update-settings',
    queryParams: [
      { name: 'flat_settings', type: 'boolean', description: 'Return settings in flat format' },
      {
        name: 'include_defaults',
        type: 'boolean',
        description: 'Return all default cluster setting values',
      },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
      { name: 'timeout', type: 'string', description: 'Explicit operation timeout' },
    ],
    requestBody: {
      properties: {
        persistent: { type: 'object', description: 'Persistent settings' },
        transient: { type: 'object', description: 'Transient settings' },
      },
    },
  },
  {
    path: '/_cluster/allocation/explain',
    methods: ['GET', 'POST'],
    description: 'Explain shard allocation',
    docPath: 'operation-cluster-allocation-explain',
    queryParams: [
      {
        name: 'include_disk_info',
        type: 'boolean',
        description: 'If true, returns information about disk usage and shard sizes',
      },
      {
        name: 'include_yes_decisions',
        type: 'boolean',
        description: 'If true, returns YES decisions in explanation',
      },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
    ],
  },
  {
    path: '/_cluster/reroute',
    methods: ['POST'],
    description: 'Reroute shards',
    docPath: 'operation-cluster-reroute',
    queryParams: [
      {
        name: 'dry_run',
        type: 'boolean',
        description: 'Simulate the operation without actually performing it',
      },
      {
        name: 'explain',
        type: 'boolean',
        description: 'Return explanation of why commands can or cannot run',
      },
      {
        name: 'metric',
        type: 'string',
        description: 'Limit information returned to specified metrics',
      },
      {
        name: 'retry_failed',
        type: 'boolean',
        description: 'Retry allocation of shards blocked due to too many failures',
      },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
      { name: 'timeout', type: 'string', description: 'Explicit operation timeout' },
    ],
  },

  // Nodes APIs
  {
    path: '/_nodes',
    methods: ['GET'],
    description: 'Node information',
    docPath: 'operation-nodes-info',
    queryParams: [
      { name: 'flat_settings', type: 'boolean', description: 'Return settings in flat format' },
      { name: 'timeout', type: 'string', description: 'Period to wait for a response' },
    ],
  },
  {
    path: '/_nodes/stats',
    methods: ['GET'],
    description: 'Node stats',
    docPath: 'operation-nodes-stats',
    queryParams: [
      {
        name: 'completion_fields',
        type: 'string',
        description:
          'Comma-separated list of fields to include in fielddata and suggest statistics',
      },
      {
        name: 'fielddata_fields',
        type: 'string',
        description: 'Comma-separated list of fields to include in fielddata statistics',
      },
      {
        name: 'fields',
        type: 'string',
        description: 'Comma-separated list of fields to include in statistics',
      },
      {
        name: 'groups',
        type: 'boolean',
        description: 'Comma-separated list of search groups to include in search statistics',
      },
      {
        name: 'include_segment_file_sizes',
        type: 'boolean',
        description: 'Report aggregated disk usage of each Lucene index file',
      },
      {
        name: 'level',
        type: 'string',
        description:
          'Indicates whether statistics are aggregated at the node, indices, or shards level',
      },
      { name: 'timeout', type: 'string', description: 'Period to wait for a response' },
      {
        name: 'types',
        type: 'string',
        description: 'Comma-separated list of document types for the indexing index metric',
      },
      {
        name: 'include_unloaded_segments',
        type: 'boolean',
        description: 'If true, response includes information from segments not loaded into memory',
      },
    ],
  },
  {
    path: '/_nodes/hot_threads',
    methods: ['GET'],
    description: 'Hot threads',
    docPath: 'operation-nodes-hot-threads',
    queryParams: [
      {
        name: 'ignore_idle_threads',
        type: 'boolean',
        description: 'Filter out known idle threads',
        default: true,
      },
      {
        name: 'interval',
        type: 'string',
        description: 'Interval between thread stacktrace samples',
        default: '500ms',
      },
      {
        name: 'snapshots',
        type: 'integer',
        description: 'Number of samples of thread stacktrace',
        default: 10,
      },
      {
        name: 'threads',
        type: 'integer',
        description: 'Number of hot threads to provide information for',
        default: 3,
      },
      { name: 'timeout', type: 'string', description: 'Period to wait for a response' },
      { name: 'type', type: 'string', description: 'The type to sample' },
      { name: 'sort', type: 'string', description: "Sort order for 'cpu' type" },
    ],
  },

  // Template APIs
  {
    path: '/_template/{template}',
    methods: ['GET', 'PUT', 'DELETE', 'HEAD'],
    description: 'Index templates (legacy)',
    docPath: 'operation-indices-templates-v1',
    pathParams: [
      { name: 'template', type: 'string', description: 'Template name', required: true },
    ],
    queryParams: [
      { name: 'flat_settings', type: 'boolean', description: 'Return settings in flat format' },
      { name: 'local', type: 'boolean', description: 'Return information from local node only' },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
    ],
  },
  {
    path: '/_index_template/{template}',
    methods: ['GET', 'PUT', 'DELETE', 'HEAD'],
    description: 'Index templates (composable)',
    docPath: 'operation-indices-put-template',
    pathParams: [
      { name: 'template', type: 'string', description: 'Template name', required: true },
    ],
    queryParams: [
      { name: 'local', type: 'boolean', description: 'Return information from local node only' },
      { name: 'flat_settings', type: 'boolean', description: 'Return settings in flat format' },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
      {
        name: 'include_defaults',
        type: 'boolean',
        description: 'Return all relevant default configurations for the index template',
      },
    ],
  },
  {
    path: '/_component_template/{template}',
    methods: ['GET', 'PUT', 'DELETE', 'HEAD'],
    description: 'Component templates',
    docPath: 'operation-indices-component-template',
    pathParams: [
      { name: 'template', type: 'string', description: 'Template name', required: true },
    ],
    queryParams: [
      { name: 'flat_settings', type: 'boolean', description: 'Return settings in flat format' },
      {
        name: 'include_defaults',
        type: 'boolean',
        description: 'Return all default configurations for the component template',
      },
      { name: 'local', type: 'boolean', description: 'Return information from local node only' },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
    ],
  },

  // Analyze API
  {
    path: '/_analyze',
    methods: ['GET', 'POST'],
    description: 'Analyze text',
    docPath: 'operation-indices-analyze',
    requestBody: {
      properties: {
        analyzer: { type: 'string', description: 'Analyzer name' },
        text: { type: 'string', description: 'Text to analyze' },
        tokenizer: { type: 'string', description: 'Tokenizer name' },
        filter: { type: 'array', description: 'Token filters' },
        char_filter: { type: 'array', description: 'Character filters' },
        field: { type: 'string', description: 'Field to derive analyzer from' },
      },
    },
  },
  {
    path: '/{index}/_analyze',
    methods: ['GET', 'POST'],
    description: 'Analyze text using index analyzer',
    docPath: 'operation-indices-analyze',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      { name: 'index', type: 'string', description: 'Index used to derive the analyzer' },
    ],
  },

  // Validate API
  {
    path: '/{index}/_validate/query',
    methods: ['GET', 'POST'],
    description: 'Validate a query',
    docPath: 'operation-indices-validate-query',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'all_shards',
        type: 'boolean',
        description: 'Execute validation on all shards instead of one random shard',
      },
      { name: 'analyzer', type: 'string', description: 'Analyzer to use for the query string' },
      {
        name: 'analyze_wildcard',
        type: 'boolean',
        description: 'If true, wildcard and prefix queries are analyzed',
      },
      {
        name: 'default_operator',
        type: 'string',
        description: 'Default operator for query string query',
        enum: ['AND', 'OR'],
      },
      {
        name: 'df',
        type: 'string',
        description: 'Field to use as default where no field prefix is given in query string',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'explain',
        type: 'boolean',
        description: 'Return detailed information if an error has occurred',
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
      {
        name: 'lenient',
        type: 'boolean',
        description: 'If true, format-based query failures in query string will be ignored',
      },
      {
        name: 'rewrite',
        type: 'boolean',
        description: 'Return a more detailed explanation showing the actual Lucene query',
      },
      { name: 'q', type: 'string', description: 'Query in the Lucene query string syntax' },
    ],
  },

  // Multi Search API
  {
    path: '/_msearch',
    methods: ['GET', 'POST'],
    description: 'Execute multiple searches in one request',
    docPath: 'operation-msearch',
    queryParams: [
      {
        name: 'max_concurrent_searches',
        type: 'integer',
        description:
          'Controls the maximum number of concurrent searches the multi search api will execute',
      },
      {
        name: 'max_concurrent_shard_requests',
        type: 'integer',
        description:
          'The number of concurrent shard requests each sub search executes concurrently',
        default: 5,
      },
      {
        name: 'pre_filter_shard_size',
        type: 'integer',
        description: 'Threshold that enforces a pre-filter roundtrip to prefilter search shards',
      },
      {
        name: 'rest_total_hits_as_int',
        type: 'boolean',
        description: 'Indicates whether hits.total should be rendered as an integer or an object',
        default: false,
      },
      {
        name: 'search_type',
        type: 'string',
        description: 'Search operation type',
        enum: ['query_then_fetch', 'dfs_query_then_fetch'],
      },
      {
        name: 'typed_keys',
        type: 'boolean',
        description:
          'Specify whether aggregation and suggester names should be prefixed by their respective types in the response',
      },
    ],
  },
  {
    path: '/{index}/_msearch',
    methods: ['GET', 'POST'],
    description: 'Multi search on specific index',
    docPath: 'operation-msearch',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'max_concurrent_searches',
        type: 'integer',
        description:
          'Controls the maximum number of concurrent searches the multi search api will execute',
      },
      {
        name: 'max_concurrent_shard_requests',
        type: 'integer',
        description:
          'The number of concurrent shard requests each sub search executes concurrently',
        default: 5,
      },
      {
        name: 'pre_filter_shard_size',
        type: 'integer',
        description: 'Threshold that enforces a pre-filter roundtrip to prefilter search shards',
      },
      {
        name: 'rest_total_hits_as_int',
        type: 'boolean',
        description: 'Indicates whether hits.total should be rendered as an integer or an object',
        default: false,
      },
      {
        name: 'search_type',
        type: 'string',
        description: 'Search operation type',
        enum: ['query_then_fetch', 'dfs_query_then_fetch'],
      },
      {
        name: 'typed_keys',
        type: 'boolean',
        description:
          'Specify whether aggregation and suggester names should be prefixed by their respective types in the response',
      },
    ],
  },

  // Explain API
  {
    path: '/{index}/_explain/{id}',
    methods: ['GET', 'POST'],
    description: 'Explain document scoring',
    docPath: 'operation-explain',
    pathParams: [
      { name: 'index', type: 'string', description: 'Index name', required: true },
      { name: 'id', type: 'string', description: 'Document ID', required: true },
    ],
    queryParams: [
      { name: 'analyzer', type: 'string', description: 'Analyzer to use for the query string' },
      {
        name: 'analyze_wildcard',
        type: 'boolean',
        description: 'If true, wildcard and prefix queries are analyzed',
      },
      {
        name: 'default_operator',
        type: 'string',
        description: 'Default operator for query string query',
        enum: ['AND', 'OR'],
      },
      { name: 'df', type: 'string', description: 'Default field for query string' },
      {
        name: 'lenient',
        type: 'boolean',
        description: 'If true, format-based query failures in query string will be ignored',
      },
      {
        name: 'preference',
        type: 'string',
        description: 'Node or shard to perform the operation on',
      },
      { name: 'routing', type: 'string', description: 'Custom routing value' },
      { name: '_source', type: 'string', description: 'Source fields to return' },
      {
        name: '_source_excludes',
        type: 'string',
        description: 'Source fields to exclude from response',
      },
      {
        name: '_source_includes',
        type: 'string',
        description: 'Source fields to include in response',
      },
      { name: 'stored_fields', type: 'string', description: 'Stored fields to return in response' },
      { name: 'q', type: 'string', description: 'Query in the Lucene query string syntax' },
    ],
  },

  // Terms Enum API
  {
    path: '/{index}/_terms_enum',
    methods: ['GET', 'POST'],
    description: 'Get matching terms from an index',
    docPath: 'operation-terms-enum',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    requestBody: {
      properties: {
        field: { type: 'string', description: 'Field to get terms from', required: true },
        string: { type: 'string', description: 'String to match' },
        size: { type: 'integer', description: 'Maximum number of terms' },
        timeout: { type: 'string', description: 'Operation timeout' },
        case_insensitive: { type: 'boolean', description: 'Case insensitive matching' },
        index_filter: { type: 'object', description: 'Filter query' },
        search_after: { type: 'string', description: 'Search after' },
      },
    },
  },

  // Reindex API
  {
    path: '/_reindex',
    methods: ['POST'],
    description: 'Reindex documents',
    docPath: 'operation-reindex',
    queryParams: [
      { name: 'refresh', type: 'boolean', description: 'Refresh after reindex' },
      { name: 'timeout', type: 'string', description: 'Operation timeout' },
      { name: 'wait_for_completion', type: 'boolean', description: 'Wait for completion' },
      { name: 'requests_per_second', type: 'number', description: 'Requests per second' },
      { name: 'slices', type: 'string', description: 'Number of slices' },
    ],
    requestBody: {
      properties: {
        source: { type: 'object', description: 'Source index configuration' },
        dest: { type: 'object', description: 'Destination index configuration' },
        script: { type: 'object', description: 'Reindex script' },
        max_docs: { type: 'integer', description: 'Maximum documents' },
        conflicts: { type: 'string', description: 'Conflict handling', enum: ['abort', 'proceed'] },
      },
    },
  },

  // Update by Query API
  {
    path: '/{index}/_update_by_query',
    methods: ['POST'],
    description: 'Update documents by query',
    docPath: 'operation-update-by-query',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      { name: 'refresh', type: 'boolean', description: 'Refresh after update' },
      { name: 'timeout', type: 'string', description: 'Operation timeout' },
      {
        name: 'conflicts',
        type: 'string',
        description: 'Conflict handling',
        enum: ['abort', 'proceed'],
      },
    ],
    requestBody: {
      properties: {
        query: { type: 'object', description: 'Query to match documents' },
        script: { type: 'object', description: 'Update script' },
      },
    },
  },

  // Delete by Query API
  {
    path: '/{index}/_delete_by_query',
    methods: ['POST'],
    description: 'Delete documents by query',
    docPath: 'operation-delete-by-query',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      { name: 'refresh', type: 'boolean', description: 'Refresh after delete' },
      { name: 'timeout', type: 'string', description: 'Operation timeout' },
      {
        name: 'conflicts',
        type: 'string',
        description: 'Conflict handling',
        enum: ['abort', 'proceed'],
      },
    ],
    requestBody: {
      properties: {
        query: { type: 'object', description: 'Query to match documents' },
      },
    },
  },

  // Snapshot APIs
  {
    path: '/_snapshot',
    methods: ['GET'],
    description: 'List snapshot repositories',
    docPath: 'operation-snapshot-get-repository',
    queryParams: [
      { name: 'local', type: 'boolean', description: 'Return information from local node only' },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
    ],
  },
  {
    path: '/_snapshot/{repository}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage snapshot repository',
    docPath: 'operation-snapshot-create-repository',
    pathParams: [
      { name: 'repository', type: 'string', description: 'Repository name', required: true },
    ],
    queryParams: [
      { name: 'local', type: 'boolean', description: 'Return information from local node only' },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
    ],
  },
  {
    path: '/_snapshot/{repository}/{snapshot}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage snapshot',
    docPath: 'operation-snapshot-create',
    pathParams: [
      { name: 'repository', type: 'string', description: 'Repository name', required: true },
      { name: 'snapshot', type: 'string', description: 'Snapshot name', required: true },
    ],
    queryParams: [
      { name: 'after', type: 'string', description: 'Offset identifier to start pagination from' },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'If false, request returns error for unavailable snapshots',
      },
      {
        name: 'index_details',
        type: 'boolean',
        description: 'If true, response includes additional index information',
      },
      {
        name: 'index_names',
        type: 'boolean',
        description: 'If true, response includes name of each index in each snapshot',
      },
      {
        name: 'include_repository',
        type: 'boolean',
        description: 'If true, response includes repository name in each snapshot',
      },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
      { name: 'order', type: 'string', description: 'Sort order', enum: ['asc', 'desc'] },
      { name: 'size', type: 'integer', description: 'Maximum number of snapshots to return' },
      { name: 'sort', type: 'string', description: 'Sort column for results' },
      {
        name: 'verbose',
        type: 'boolean',
        description: 'Return additional information about each snapshot',
      },
    ],
  },
  {
    path: '/_snapshot/{repository}/{snapshot}/_restore',
    methods: ['POST'],
    description: 'Restore snapshot',
    docPath: 'operation-snapshot-restore',
    pathParams: [
      { name: 'repository', type: 'string', description: 'Repository name', required: true },
      { name: 'snapshot', type: 'string', description: 'Snapshot name', required: true },
    ],
    queryParams: [
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
      {
        name: 'wait_for_completion',
        type: 'boolean',
        description: 'If true, request returns response when restore operation completes',
      },
    ],
  },

  // Task APIs
  {
    path: '/_tasks',
    methods: ['GET'],
    description: 'List tasks',
    docPath: 'operation-tasks-list',
    queryParams: [
      { name: 'actions', type: 'string', description: 'Action filter' },
      { name: 'detailed', type: 'boolean', description: 'Detailed output' },
      {
        name: 'group_by',
        type: 'string',
        description: 'Group by',
        enum: ['nodes', 'parents', 'none'],
      },
    ],
  },
  {
    path: '/_tasks/{task_id}',
    methods: ['GET'],
    description: 'Get task status',
    docPath: 'operation-tasks-get',
    pathParams: [{ name: 'task_id', type: 'string', description: 'Task ID', required: true }],
    queryParams: [
      { name: 'timeout', type: 'string', description: 'Period to wait for a response' },
      {
        name: 'wait_for_completion',
        type: 'boolean',
        description: 'If true, request blocks until the task has completed',
      },
    ],
  },
  {
    path: '/_tasks/{task_id}/_cancel',
    methods: ['POST'],
    description: 'Cancel task',
    docPath: 'operation-tasks-cancel',
    pathParams: [{ name: 'task_id', type: 'string', description: 'Task ID', required: true }],
    queryParams: [
      {
        name: 'actions',
        type: 'string',
        description: 'Comma-separated list of actions used to limit the request',
      },
      {
        name: 'nodes',
        type: 'string',
        description: 'Comma-separated list of node IDs or names used to limit the request',
      },
      {
        name: 'parent_task_id',
        type: 'string',
        description: 'Parent task ID used to limit the tasks',
      },
      {
        name: 'wait_for_completion',
        type: 'boolean',
        description: 'If true, request blocks until all found tasks are complete',
      },
    ],
  },

  // Ingest APIs
  {
    path: '/_ingest/pipeline',
    methods: ['GET'],
    description: 'List ingest pipelines',
    docPath: 'operation-ingest-get-pipeline',
    queryParams: [
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
      {
        name: 'summary',
        type: 'boolean',
        description: 'Return pipelines without their definitions',
      },
    ],
  },
  {
    path: '/_ingest/pipeline/{pipeline}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage ingest pipeline',
    docPath: 'operation-ingest-put-pipeline',
    pathParams: [{ name: 'pipeline', type: 'string', description: 'Pipeline ID', required: true }],
    queryParams: [
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
      { name: 'timeout', type: 'string', description: 'Explicit operation timeout' },
      {
        name: 'if_version',
        type: 'integer',
        description: 'Required version for optimistic concurrency control',
      },
      {
        name: 'summary',
        type: 'boolean',
        description: 'Return pipelines without their definitions',
      },
    ],
  },
  {
    path: '/_ingest/pipeline/_simulate',
    methods: ['GET', 'POST'],
    description: 'Simulate pipeline',
    docPath: 'operation-ingest-simulate',
    queryParams: [
      {
        name: 'verbose',
        type: 'boolean',
        description: 'If true, response includes output data for each processor',
      },
    ],
  },

  // Script APIs
  {
    path: '/_scripts/{id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage stored script',
    docPath: 'operation-get-script',
    pathParams: [{ name: 'id', type: 'string', description: 'Script ID', required: true }],
    queryParams: [
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
    ],
  },

  // Field Caps API
  {
    path: '/_field_caps',
    methods: ['GET', 'POST'],
    description: 'Field capabilities',
    docPath: 'operation-field-caps',
    queryParams: [
      { name: 'fields', type: 'string', description: 'Fields to retrieve', required: true },
    ],
  },
  {
    path: '/{index}/_field_caps',
    methods: ['GET', 'POST'],
    description: 'Field capabilities for index',
    docPath: 'operation-field-caps',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'fields',
        type: 'string',
        description: 'Comma-separated list of fields to retrieve capabilities for',
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
      {
        name: 'include_unmapped',
        type: 'boolean',
        description: 'If true, unmapped fields are included in response',
      },
      {
        name: 'filters',
        type: 'string',
        description: 'Comma-separated list of filters to apply to the response',
      },
      {
        name: 'types',
        type: 'string',
        description: 'Comma-separated list of field types to include',
      },
      {
        name: 'include_empty_fields',
        type: 'boolean',
        description: 'If false, empty fields are not included in response',
      },
    ],
  },

  // Scroll API
  {
    path: '/_search/scroll',
    methods: ['GET', 'POST', 'DELETE'],
    description: 'Scroll search results',
    docPath: 'operation-scroll',
    queryParams: [
      {
        name: 'scroll',
        type: 'string',
        description: 'Period to retain the search context for scrolling',
      },
      { name: 'scroll_id', type: 'string', description: 'Scroll ID' },
      {
        name: 'rest_total_hits_as_int',
        type: 'boolean',
        description: 'If true, hits.total is returned as an integer',
      },
    ],
    requestBody: {
      properties: {
        scroll_id: { type: 'string', description: 'Scroll ID' },
        scroll: { type: 'string', description: 'Scroll keep-alive time' },
      },
    },
  },

  // Clear Cache API
  {
    path: '/_cache/clear',
    methods: ['POST'],
    description: 'Clear cluster cache',
    docPath: 'operation-indices-clear-cache',
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      { name: 'fielddata', type: 'boolean', description: 'If true, clears the fields cache' },
      {
        name: 'fields',
        type: 'string',
        description: 'Comma-separated list of field names to limit fielddata cache clearing',
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
      { name: 'query', type: 'boolean', description: 'If true, clears the query cache' },
      { name: 'request', type: 'boolean', description: 'If true, clears the request cache' },
    ],
  },
  {
    path: '/{index}/_cache/clear',
    methods: ['POST'],
    description: 'Clear index cache',
    docPath: 'operation-indices-clear-cache',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      { name: 'fielddata', type: 'boolean', description: 'If true, clears the fields cache' },
      {
        name: 'fields',
        type: 'string',
        description: 'Comma-separated list of field names to limit fielddata cache clearing',
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
      { name: 'query', type: 'boolean', description: 'If true, clears the query cache' },
      { name: 'request', type: 'boolean', description: 'If true, clears the request cache' },
    ],
  },

  // Recovery API
  {
    path: '/{index}/_recovery',
    methods: ['GET'],
    description: 'Index recovery status',
    docPath: 'operation-indices-recovery',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'active_only',
        type: 'boolean',
        description: 'If true, response only includes ongoing shard recoveries',
      },
      {
        name: 'detailed',
        type: 'boolean',
        description: 'If true, response includes detailed information about shard recoveries',
      },
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
    ],
  },

  // Segments API
  {
    path: '/{index}/_segments',
    methods: ['GET'],
    description: 'Index segments',
    docPath: 'operation-indices-segments',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
    ],
  },

  // Stats APIs
  {
    path: '/_stats',
    methods: ['GET'],
    description: 'Cluster statistics',
    docPath: 'operation-indices-stats',
    queryParams: [
      {
        name: 'completion_fields',
        type: 'string',
        description:
          'Comma-separated list of fields to include in fielddata and suggest statistics',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'fielddata_fields',
        type: 'string',
        description: 'Comma-separated list of fields to include in fielddata statistics',
      },
      {
        name: 'fields',
        type: 'string',
        description: 'Comma-separated list of fields to include in statistics',
      },
      {
        name: 'forbid_closed_indices',
        type: 'boolean',
        description: 'If true, statistics are not collected from closed indices',
      },
      {
        name: 'groups',
        type: 'string',
        description: 'Comma-separated list of search groups to include in search statistics',
      },
      {
        name: 'include_segment_file_sizes',
        type: 'boolean',
        description: 'Report aggregated disk usage of each Lucene index file',
      },
      {
        name: 'include_unloaded_segments',
        type: 'boolean',
        description: 'If true, response includes information from segments not loaded into memory',
      },
      {
        name: 'level',
        type: 'string',
        description:
          'Indicates whether statistics are aggregated at cluster, indices, or shards level',
      },
    ],
  },
  {
    path: '/{index}/_stats',
    methods: ['GET'],
    description: 'Index statistics',
    docPath: 'operation-indices-stats',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'completion_fields',
        type: 'string',
        description:
          'Comma-separated list of fields to include in fielddata and suggest statistics',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'fielddata_fields',
        type: 'string',
        description: 'Comma-separated list of fields to include in fielddata statistics',
      },
      {
        name: 'fields',
        type: 'string',
        description: 'Comma-separated list of fields to include in statistics',
      },
      {
        name: 'forbid_closed_indices',
        type: 'boolean',
        description: 'If true, statistics are not collected from closed indices',
      },
      {
        name: 'groups',
        type: 'string',
        description: 'Comma-separated list of search groups to include in search statistics',
      },
      {
        name: 'include_segment_file_sizes',
        type: 'boolean',
        description: 'Report aggregated disk usage of each Lucene index file',
      },
      {
        name: 'include_unloaded_segments',
        type: 'boolean',
        description: 'If true, response includes information from segments not loaded into memory',
      },
      {
        name: 'level',
        type: 'string',
        description:
          'Indicates whether statistics are aggregated at cluster, indices, or shards level',
      },
    ],
  },

  // Search Shards API
  {
    path: '/{index}/_search_shards',
    methods: ['GET', 'POST'],
    description: 'Search shards routing',
    docPath: 'operation-search-shards',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
      { name: 'local', type: 'boolean', description: 'Return information from local node only' },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
      {
        name: 'preference',
        type: 'string',
        description: 'Node or shard to perform the operation on',
      },
      { name: 'routing', type: 'string', description: 'Custom routing value' },
    ],
  },
];

/**
 * Elasticsearch-specific endpoints
 */
const elasticsearchEndpoints: ApiEndpoint[] = [
  // EQL (Event Query Language)
  {
    path: '/{index}/_eql/search',
    methods: ['GET', 'POST'],
    description: 'EQL search',
    docPath: 'operation-eql-search',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.9.0' } },
    queryParams: [
      {
        name: 'allow_no_indices',
        type: 'boolean',
        description:
          'Whether to ignore if a wildcard indices expression resolves into no concrete indices',
      },
      {
        name: 'allow_partial_search_results',
        type: 'boolean',
        description: 'If true, returns partial results if there are shard failures',
      },
      {
        name: 'allow_partial_sequence_results',
        type: 'boolean',
        description: 'If true, sequence queries return partial results in case of shard failures',
      },
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Whether to expand wildcard expression to concrete indices',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'ccs_minimize_roundtrips',
        type: 'boolean',
        description: 'Minimize network round-trips for cross-cluster search',
      },
      {
        name: 'ignore_unavailable',
        type: 'boolean',
        description: 'Whether specified concrete indices should be ignored when unavailable',
      },
      {
        name: 'keep_alive',
        type: 'string',
        description: 'Period for which search and results are stored on cluster',
      },
      {
        name: 'keep_on_completion',
        type: 'boolean',
        description: 'If true, search and results are stored on cluster',
      },
      {
        name: 'wait_for_completion_timeout',
        type: 'string',
        description: 'Timeout to wait for request to finish',
      },
    ],
  },

  // SQL
  {
    path: '/_sql',
    methods: ['GET', 'POST'],
    description: 'SQL query',
    docPath: 'operation-sql-query',
    availability: { [BackendType.ELASTICSEARCH]: { min: '6.3.0' } },
    queryParams: [
      {
        name: 'format',
        type: 'string',
        description: 'Response format',
        enum: ['csv', 'json', 'tsv', 'txt', 'yaml'],
      },
    ],
    requestBody: {
      properties: {
        query: { type: 'string', description: 'SQL query' },
        fetch_size: { type: 'integer', description: 'Fetch size' },
        format: {
          type: 'string',
          description: 'Response format',
          enum: ['csv', 'json', 'tsv', 'txt', 'yaml'],
        },
      },
    },
  },

  // Transform APIs
  {
    path: '/_transform',
    methods: ['GET'],
    description: 'List transforms',
    docPath: 'operation-transform-get-transform',
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.2.0' } },
    queryParams: [
      {
        name: 'allow_no_match',
        type: 'boolean',
        description: 'If false, request returns 404 when no transforms match',
      },
      { name: 'from', type: 'integer', description: 'Skips the specified number of transforms' },
      { name: 'size', type: 'integer', description: 'Maximum number of transforms to obtain' },
      {
        name: 'exclude_generated',
        type: 'boolean',
        description: 'Exclude automatically added fields from configuration',
      },
    ],
  },
  {
    path: '/_transform/{transform_id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage transform',
    docPath: 'operation-transform-get-transform',
    pathParams: [
      { name: 'transform_id', type: 'string', description: 'Transform ID', required: true },
    ],
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.2.0' } },
    queryParams: [
      {
        name: 'allow_no_match',
        type: 'boolean',
        description: 'If false, request returns 404 when no transforms match',
      },
      { name: 'from', type: 'integer', description: 'Skips the specified number of transforms' },
      { name: 'size', type: 'integer', description: 'Maximum number of transforms to obtain' },
      {
        name: 'exclude_generated',
        type: 'boolean',
        description: 'Exclude automatically added fields from configuration',
      },
      {
        name: 'defer_validation',
        type: 'boolean',
        description: 'Skip validations during transform creation',
      },
      { name: 'timeout', type: 'string', description: 'Period to wait for a response' },
    ],
  },

  // Data Stream APIs
  {
    path: '/_data_stream',
    methods: ['GET'],
    description: 'List data streams',
    docPath: 'operation-indices-get-data-stream',
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.9.0' } },
    queryParams: [
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Type of data stream that wildcard patterns can match',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'include_defaults',
        type: 'boolean',
        description: 'If true, returns all relevant default configurations for the index template',
      },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
      {
        name: 'verbose',
        type: 'boolean',
        description:
          'Whether the maximum timestamp for each data stream should be calculated and returned',
      },
    ],
  },
  {
    path: '/_data_stream/{data_stream}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage data stream',
    docPath: 'operation-indices-get-data-stream',
    pathParams: [
      { name: 'data_stream', type: 'string', description: 'Data stream name', required: true },
    ],
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.9.0' } },
    queryParams: [
      {
        name: 'expand_wildcards',
        type: 'string',
        description: 'Type of data stream that wildcard patterns can match',
        enum: ['open', 'closed', 'hidden', 'none', 'all'],
      },
      {
        name: 'include_defaults',
        type: 'boolean',
        description: 'If true, returns all relevant default configurations for the index template',
      },
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
      {
        name: 'verbose',
        type: 'boolean',
        description:
          'Whether the maximum timestamp for each data stream should be calculated and returned',
      },
    ],
  },

  // ILM (Index Lifecycle Management)
  {
    path: '/_ilm/policy',
    methods: ['GET'],
    description: 'List ILM policies',
    docPath: 'operation-ilm-get-status',
    availability: { [BackendType.ELASTICSEARCH]: { min: '6.6.0' } },
    queryParams: [
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
      { name: 'timeout', type: 'string', description: 'Explicit operation timeout' },
    ],
  },
  {
    path: '/_ilm/policy/{policy}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage ILM policy',
    docPath: 'operation-ilm-put-lifecycle',
    pathParams: [{ name: 'policy', type: 'string', description: 'Policy name', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '6.6.0' } },
    queryParams: [
      {
        name: 'master_timeout',
        type: 'string',
        description: 'Timeout for connection to master node',
      },
      { name: 'timeout', type: 'string', description: 'Explicit operation timeout' },
    ],
  },

  // Rollup APIs
  {
    path: '/_rollup/job/{job_id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage rollup job',
    docPath: 'operation-rollup-get-jobs',
    pathParams: [{ name: 'job_id', type: 'string', description: 'Job ID', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '6.3.0' } },
    queryParams: [
      {
        name: 'allow_no_match',
        type: 'boolean',
        description: 'If false, request returns 404 when no rollup jobs match',
      },
      { name: 'from', type: 'integer', description: 'Skips the specified number of rollup jobs' },
      { name: 'size', type: 'integer', description: 'Maximum number of rollup jobs to obtain' },
    ],
  },

  // Watcher APIs
  {
    path: '/_watcher/watch/{watch_id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage watch',
    docPath: 'operation-watcher-get-watch',
    pathParams: [{ name: 'watch_id', type: 'string', description: 'Watch ID', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '5.0.0' } },
    queryParams: [
      {
        name: 'active',
        type: 'boolean',
        description: 'Whether the watch is in an active or inactive state',
      },
      {
        name: 'if_primary_term',
        type: 'integer',
        description: 'Primary term for optimistic concurrency control',
      },
      {
        name: 'if_seq_no',
        type: 'integer',
        description: 'Sequence number for optimistic concurrency control',
      },
      {
        name: 'version',
        type: 'integer',
        description: 'Expected version number for concurrency control',
      },
    ],
  },

  // Cross-Cluster Replication
  {
    path: '/_ccr/stats',
    methods: ['GET'],
    description: 'CCR stats',
    docPath: 'operation-ccr-stats',
    availability: { [BackendType.ELASTICSEARCH]: { min: '6.5.0' } },
  },

  // Autoscaling
  {
    path: '/_autoscaling/capacity',
    methods: ['GET'],
    description: 'Autoscaling capacity (deprecated in ES v9)',
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.11.0' } },
  },

  // ML APIs
  {
    path: '/_ml/anomaly_detectors',
    methods: ['GET'],
    description: 'List anomaly detection jobs',
    docPath: 'operation-ml-get-jobs',
    availability: { [BackendType.ELASTICSEARCH]: { min: '5.4.0' } },
    queryParams: [
      {
        name: 'allow_no_match',
        type: 'boolean',
        description: 'If false, request returns 404 when no jobs match',
      },
      { name: 'from', type: 'integer', description: 'Skips the specified number of jobs' },
      { name: 'size', type: 'integer', description: 'Maximum number of jobs to obtain' },
      {
        name: 'exclude_generated',
        type: 'boolean',
        description: 'Indicates if certain fields should be removed from the configuration',
      },
    ],
  },
  {
    path: '/_ml/anomaly_detectors/{job_id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage anomaly detection job',
    docPath: 'operation-ml-get-jobs',
    pathParams: [{ name: 'job_id', type: 'string', description: 'Job ID', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '5.4.0' } },
    queryParams: [
      {
        name: 'allow_no_match',
        type: 'boolean',
        description: 'If false, request returns 404 when no jobs match',
      },
      {
        name: 'exclude_generated',
        type: 'boolean',
        description: 'Indicates if certain fields should be removed from the configuration',
      },
      {
        name: 'force',
        type: 'boolean',
        description: 'If true, the job is deleted even if it is not stopped',
      },
      {
        name: 'wait_for_completion',
        type: 'boolean',
        description: 'If true, waits for job deletion to complete',
      },
    ],
  },
  {
    path: '/_ml/trained_models',
    methods: ['GET'],
    description: 'List trained models',
    docPath: 'operation-ml-get-trained-models',
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.10.0' } },
    queryParams: [
      {
        name: 'allow_no_match',
        type: 'boolean',
        description: 'If false, request returns 404 when no models match',
      },
      {
        name: 'decompress_definition',
        type: 'boolean',
        description: 'If true, the fields are decompress before returning',
      },
      {
        name: 'exclude_generated',
        type: 'boolean',
        description: 'Indicates if certain fields should be removed from the configuration',
      },
      { name: 'from', type: 'integer', description: 'Skips the specified number of models' },
      {
        name: 'include',
        type: 'string',
        description: 'Comma-separated list of fields to include in results',
      },
      {
        name: 'include_model_definition',
        type: 'boolean',
        description: 'If true, the definition field of the response is not base64 encoded',
      },
      { name: 'size', type: 'integer', description: 'Maximum number of models to obtain' },
      {
        name: 'tags',
        type: 'string',
        description: 'Comma-separated list of tags that the model must have',
      },
    ],
  },
  {
    path: '/_ml/trained_models/{model_id}',
    methods: ['GET', 'DELETE'],
    description: 'Get or delete trained model',
    docPath: 'operation-ml-get-trained-models',
    pathParams: [{ name: 'model_id', type: 'string', description: 'Model ID', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.10.0' } },
    queryParams: [
      {
        name: 'allow_no_match',
        type: 'boolean',
        description: 'If false, request returns 404 when no models match',
      },
      {
        name: 'decompress_definition',
        type: 'boolean',
        description: 'If true, the fields are decompress before returning',
      },
      {
        name: 'exclude_generated',
        type: 'boolean',
        description: 'Indicates if certain fields should be removed from the configuration',
      },
      {
        name: 'include',
        type: 'string',
        description: 'Comma-separated list of fields to include in results',
      },
      {
        name: 'include_model_definition',
        type: 'boolean',
        description: 'If true, the definition field of the response is not base64 encoded',
      },
      {
        name: 'tags',
        type: 'string',
        description: 'Comma-separated list of tags that the model must have',
      },
      {
        name: 'force',
        type: 'boolean',
        description: 'If true, forcefully deletes a model that is referenced by ingest pipelines',
      },
      { name: 'timeout', type: 'string', description: 'Period to wait for a response' },
    ],
  },
  {
    path: '/_ml/trained_models/{model_id}/_infer',
    methods: ['POST'],
    description: 'Infer using trained model',
    docPath: 'operation-ml-infer-trained-model',
    pathParams: [{ name: 'model_id', type: 'string', description: 'Model ID', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.10.0' } },
    queryParams: [
      {
        name: 'timeout',
        type: 'string',
        description: 'Controls the amount of time to wait for inference results',
      },
    ],
  },

  // Security APIs
  {
    path: '/_security/user',
    methods: ['GET'],
    description: 'List users',
    docPath: 'operation-security-get-user',
    availability: { [BackendType.ELASTICSEARCH]: { min: '5.0.0' } },
    queryParams: [
      {
        name: 'with_profile_uid',
        type: 'boolean',
        description: 'If true, retrieves the User Profile UID for the users',
      },
    ],
  },
  {
    path: '/_security/user/{username}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage user',
    docPath: 'operation-security-get-user',
    pathParams: [{ name: 'username', type: 'string', description: 'Username', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '5.0.0' } },
    queryParams: [
      {
        name: 'refresh',
        type: 'string',
        description: 'If true, refresh the affected shards after performing the operation',
        enum: ['true', 'false', 'wait_for'],
      },
      {
        name: 'with_profile_uid',
        type: 'boolean',
        description: 'If true, retrieves the User Profile UID for the users',
      },
    ],
  },
  {
    path: '/_security/role',
    methods: ['GET'],
    description: 'List roles',
    docPath: 'operation-security-get-role',
    availability: { [BackendType.ELASTICSEARCH]: { min: '5.0.0' } },
  },
  {
    path: '/_security/role/{role}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage role',
    docPath: 'operation-security-get-role',
    pathParams: [{ name: 'role', type: 'string', description: 'Role name', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '5.0.0' } },
    queryParams: [
      {
        name: 'refresh',
        type: 'string',
        description: 'If true, refresh the affected shards after performing the operation',
        enum: ['true', 'false', 'wait_for'],
      },
    ],
  },
  {
    path: '/_security/api_key',
    methods: ['GET', 'POST'],
    description: 'Manage API keys',
    docPath: 'operation-security-get-api-key',
    availability: { [BackendType.ELASTICSEARCH]: { min: '6.7.0' } },
    queryParams: [
      { name: 'id', type: 'string', description: 'API key id of the API key to be retrieved' },
      { name: 'name', type: 'string', description: 'API key name of the API key to be retrieved' },
      {
        name: 'owner',
        type: 'boolean',
        description: 'If true, only return API keys owned by the currently authenticated user',
      },
      {
        name: 'realm_name',
        type: 'string',
        description: 'Realm name of the user who created the API key',
      },
      {
        name: 'username',
        type: 'string',
        description: 'Username of the user who created the API key',
      },
      {
        name: 'with_limited_by',
        type: 'boolean',
        description: "Return the snapshot of the owner user's role descriptors",
      },
    ],
  },
];

/**
 * OpenSearch-specific endpoints
 */
const opensearchEndpoints: ApiEndpoint[] = [
  // SQL
  {
    path: '/_plugins/_sql',
    methods: ['POST'],
    description: 'SQL query',
    docPath: 'operation-sql-query',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
    requestBody: {
      properties: {
        query: { type: 'string', description: 'SQL query' },
        fetch_size: { type: 'integer', description: 'Fetch size' },
      },
    },
  },

  // PPL (Piped Processing Language)
  {
    path: '/_plugins/_ppl',
    methods: ['POST'],
    description: 'PPL query',
    docPath: 'operation-ppl-query',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
    requestBody: {
      properties: {
        query: { type: 'string', description: 'PPL query' },
      },
    },
  },

  // Anomaly Detection
  {
    path: '/_plugins/_anomaly_detection/detectors',
    methods: ['GET'],
    description: 'List anomaly detectors',
    docPath: 'operation-ad-get-detector',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
    queryParams: [
      { name: 'from', type: 'integer', description: 'The number of detectors to skip' },
      { name: 'size', type: 'integer', description: 'The number of detectors to return' },
    ],
  },
  {
    path: '/_plugins/_anomaly_detection/detectors/{detector_id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage anomaly detector',
    docPath: 'operation-ad-get-detector',
    pathParams: [
      { name: 'detector_id', type: 'string', description: 'Detector ID', required: true },
    ],
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
    queryParams: [
      {
        name: 'refresh',
        type: 'boolean',
        description: 'Whether to refresh the index after the operation',
      },
    ],
  },

  // Alerting
  {
    path: '/_plugins/_alerting/monitors',
    methods: ['GET'],
    description: 'List alerting monitors',
    docPath: 'operation-alerting-get-monitor',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
    queryParams: [
      { name: 'from', type: 'integer', description: 'The number of monitors to skip' },
      { name: 'size', type: 'integer', description: 'The number of monitors to return' },
      { name: 'sortField', type: 'string', description: 'The field to sort results on' },
      {
        name: 'sortOrder',
        type: 'string',
        description: 'The order to sort results in',
        enum: ['asc', 'desc'],
      },
      { name: 'search', type: 'string', description: 'Search string to filter monitors' },
    ],
  },
  {
    path: '/_plugins/_alerting/monitors/{monitor_id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage alerting monitor',
    docPath: 'operation-alerting-get-monitor',
    pathParams: [{ name: 'monitor_id', type: 'string', description: 'Monitor ID', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
    queryParams: [
      {
        name: 'refresh',
        type: 'boolean',
        description: 'Whether to refresh the index after the operation',
      },
      {
        name: 'if_seq_no',
        type: 'integer',
        description: 'Sequence number for optimistic concurrency control',
      },
      {
        name: 'if_primary_term',
        type: 'integer',
        description: 'Primary term for optimistic concurrency control',
      },
    ],
  },

  // Index State Management
  {
    path: '/_plugins/_ism/policies',
    methods: ['GET'],
    description: 'List ISM policies',
    docPath: 'operation-ism-get-policy',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
    queryParams: [
      { name: 'from', type: 'integer', description: 'The number of policies to skip' },
      { name: 'size', type: 'integer', description: 'The number of policies to return' },
    ],
  },
  {
    path: '/_plugins/_ism/policies/{policy}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage ISM policy',
    docPath: 'operation-ism-get-policy',
    pathParams: [{ name: 'policy', type: 'string', description: 'Policy name', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
    queryParams: [
      {
        name: 'if_seq_no',
        type: 'integer',
        description: 'Sequence number for optimistic concurrency control',
      },
      {
        name: 'if_primary_term',
        type: 'integer',
        description: 'Primary term for optimistic concurrency control',
      },
    ],
  },

  // Security
  {
    path: '/_plugins/_security/api/account',
    methods: ['GET', 'PUT'],
    description: 'Account information',
    docPath: 'operation-security-account',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },
  {
    path: '/_plugins/_security/api/internalusers',
    methods: ['GET'],
    description: 'List internal users',
    docPath: 'operation-security-get-user',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },
  {
    path: '/_plugins/_security/api/internalusers/{username}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage internal user',
    docPath: 'operation-security-get-user',
    pathParams: [{ name: 'username', type: 'string', description: 'Username', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },
  {
    path: '/_plugins/_security/api/roles',
    methods: ['GET'],
    description: 'List roles',
    docPath: 'operation-security-get-role',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },
  {
    path: '/_plugins/_security/api/roles/{role}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage role',
    docPath: 'operation-security-get-role',
    pathParams: [{ name: 'role', type: 'string', description: 'Role name', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },

  // k-NN
  {
    path: '/_plugins/_knn/stats',
    methods: ['GET'],
    description: 'k-NN plugin stats',
    docPath: 'operation-knn-stats',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },
  {
    path: '/{index}/_plugins/_knn/warmup',
    methods: ['GET'],
    description: 'Warm up k-NN index',
    docPath: 'operation-knn-warmup',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },

  // Asynchronous Search
  {
    path: '/_plugins/_asynchronous_search',
    methods: ['POST'],
    description: 'Create asynchronous search',
    docPath: 'operation-async-search',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
    queryParams: [
      { name: 'index', type: 'string', description: 'Index pattern to search' },
      { name: 'keep_alive', type: 'string', description: 'The interval to keep the results alive' },
      {
        name: 'keep_on_completion',
        type: 'boolean',
        description: 'If true, save results in the cluster after search completes',
      },
      {
        name: 'wait_for_completion_timeout',
        type: 'string',
        description: 'Time to wait for request completion',
      },
    ],
  },
  {
    path: '/_plugins/_asynchronous_search/{id}',
    methods: ['GET', 'DELETE'],
    description: 'Get or delete asynchronous search',
    docPath: 'operation-async-search',
    pathParams: [{ name: 'id', type: 'string', description: 'Search ID', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },

  // Notifications
  {
    path: '/_plugins/_notifications/channels',
    methods: ['GET'],
    description: 'List notification channels',
    docPath: 'operation-notifications-get-channel',
    availability: { [BackendType.OPENSEARCH]: { min: '2.0.0' } },
  },
  {
    path: '/_plugins/_notifications/channels/{channel_id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage notification channel',
    docPath: 'operation-notifications-get-channel',
    pathParams: [{ name: 'channel_id', type: 'string', description: 'Channel ID', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '2.0.0' } },
  },

  // Neural Search (ML)
  {
    path: '/_plugins/_ml/models',
    methods: ['GET'],
    description: 'List ML models',
    docPath: 'operation-ml-get-model',
    availability: { [BackendType.OPENSEARCH]: { min: '2.4.0' } },
  },
  {
    path: '/_plugins/_ml/models/{model_id}',
    methods: ['GET', 'DELETE'],
    description: 'Get or delete ML model',
    docPath: 'operation-ml-get-model',
    pathParams: [{ name: 'model_id', type: 'string', description: 'Model ID', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '2.4.0' } },
  },
  {
    path: '/_plugins/_ml/models/{model_id}/_load',
    methods: ['POST'],
    description: 'Load ML model',
    docPath: 'operation-ml-load-model',
    pathParams: [{ name: 'model_id', type: 'string', description: 'Model ID', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '2.4.0' } },
  },
  {
    path: '/_plugins/_ml/models/{model_id}/_unload',
    methods: ['POST'],
    description: 'Unload ML model',
    docPath: 'operation-ml-unload-model',
    pathParams: [{ name: 'model_id', type: 'string', description: 'Model ID', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '2.4.0' } },
  },
  {
    path: '/_plugins/_ml/models/{model_id}/_predict',
    methods: ['POST'],
    description: 'Predict using ML model',
    docPath: 'operation-ml-predict',
    pathParams: [{ name: 'model_id', type: 'string', description: 'Model ID', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '2.4.0' } },
  },
];

/**
 * API Specification provider class
 */
export class ApiSpecProvider {
  private endpoints: Map<BackendType, ApiEndpoint[]>;

  constructor() {
    this.endpoints = new Map();
    this.initializeEndpoints();
  }

  /**
   * Initialize endpoints for all backends
   */
  private initializeEndpoints(): void {
    // Initialize with common endpoints for both backends
    this.endpoints.set(BackendType.ELASTICSEARCH, [...commonEndpoints, ...elasticsearchEndpoints]);

    this.endpoints.set(BackendType.OPENSEARCH, [...commonEndpoints, ...opensearchEndpoints]);
  }

  /**
   * Get all endpoints for a backend
   */
  getEndpoints(backend: BackendType, version?: string): ApiEndpoint[] {
    const endpoints = this.endpoints.get(backend) || [];

    if (!version) {
      return endpoints;
    }

    return endpoints.filter(endpoint => {
      if (!endpoint.availability) return true;
      const availability = endpoint.availability[backend];
      if (!availability) return true;
      return isVersionInRange(version, availability);
    });
  }

  /**
   * Find endpoint by path pattern
   */
  findEndpoint(
    backend: BackendType,
    path: string,
    method?: HttpMethod,
    version?: string,
  ): ApiEndpoint | undefined {
    const endpoints = this.getEndpoints(backend, version);

    const matches = endpoints.filter(endpoint => {
      if (method && !endpoint.methods.includes(method)) {
        return false;
      }
      return this.matchPath(endpoint.path, path);
    });

    return matches.sort((a, b) => this.pathSpecificity(b.path) - this.pathSpecificity(a.path))[0];
  }

  private pathSpecificity(pattern: string): number {
    return pattern
      .split('/')
      .filter(Boolean)
      .reduce((score, part) => {
        return score + (part.startsWith('{') && part.endsWith('}') ? 0 : 1);
      }, 0);
  }

  /**
   * Match a path against an endpoint pattern
   */
  private matchPath(pattern: string, path: string): boolean {
    const normalize = (p: string) => p.replace(/^\//, '');
    const regexPattern = normalize(pattern)
      .replace(/\{[^}]+\}/g, '[^/]+')
      .replace(/\//g, '\\/');
    return new RegExp(`^${regexPattern}$`).test(normalize(path));
  }

  /**
   * Get completion paths for a backend
   */
  getPathCompletions(backend: BackendType, version?: string, prefix?: string): string[] {
    const endpoints = this.getEndpoints(backend, version);
    const paths = endpoints.map(e => e.path);

    if (!prefix) {
      return [...new Set(paths)];
    }

    // Filter and generate completions based on prefix
    const uniquePaths = endpoints
      .filter(
        endpoint =>
          endpoint.path.startsWith(prefix) || this.pathMatchesPrefix(endpoint.path, prefix),
      )
      .map(endpoint => this.getNextPathSegment(endpoint.path, prefix))
      .filter((segment): segment is string => segment !== undefined);

    return [...new Set(uniquePaths)];
  }

  /**
   * Check if a path pattern matches a prefix
   */
  private pathMatchesPrefix(pattern: string, prefix: string): boolean {
    const patternParts = pattern.split('/');
    const prefixParts = prefix.split('/');

    return prefixParts
      .slice(0, -1)
      .every((prefixPart, i) => patternParts[i] === prefixPart || patternParts[i]?.startsWith('{'));
  }

  /**
   * Get the next path segment after a prefix
   */
  private getNextPathSegment(path: string, prefix: string): string | undefined {
    const pathParts = path.split('/');
    const prefixParts = prefix.split('/');

    if (pathParts.length <= prefixParts.length) {
      return undefined;
    }

    return pathParts[prefixParts.length];
  }
}

// Export singleton instance
export const apiSpecProvider = new ApiSpecProvider();
