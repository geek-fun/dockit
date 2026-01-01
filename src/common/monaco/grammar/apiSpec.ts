/**
 * API Specification Provider
 * Provides endpoint and Query DSL definitions for Elasticsearch and OpenSearch
 * 
 * This module serves as the foundation for spec-driven completions.
 * In the future, this can be extended to load from elasticsearch-specification
 * and opensearch-api-specification repositories.
 */

import { ApiEndpoint, BackendType, HttpMethod } from './types';
import { isVersionInRange } from './utils';

/**
 * Base endpoints available in both Elasticsearch and OpenSearch
 */
const commonEndpoints: ApiEndpoint[] = [
  // Search APIs
  {
    path: '/_search',
    methods: ['GET', 'POST'],
    description: 'Execute a search query',
    docUrl: 'https://www.elastic.co/guide/en/elasticsearch/reference/current/search-search.html',
    queryParams: [
      { name: 'q', type: 'string', description: 'Query in the Lucene query string syntax' },
      { name: 'df', type: 'string', description: 'Default field for query string' },
      { name: 'analyzer', type: 'string', description: 'Analyzer to use for query string' },
      { name: 'default_operator', type: 'string', description: 'Default operator for query string', enum: ['AND', 'OR'] },
      { name: 'from', type: 'integer', description: 'Starting offset', default: 0 },
      { name: 'size', type: 'integer', description: 'Number of hits to return', default: 10 },
      { name: 'sort', type: 'string', description: 'Sort order' },
      { name: 'timeout', type: 'string', description: 'Search timeout' },
      { name: 'terminate_after', type: 'integer', description: 'Maximum number of documents to collect' },
      { name: 'track_total_hits', type: 'boolean', description: 'Track total number of hits' },
      { name: 'search_type', type: 'string', description: 'Search type', enum: ['query_then_fetch', 'dfs_query_then_fetch'] },
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
        seq_no_primary_term: { type: 'boolean', description: 'Return sequence number and primary term' },
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
    pathParams: [{ name: 'index', type: 'string', description: 'Index name(s)', required: true }],
  },
  
  // Count API
  {
    path: '/_count',
    methods: ['GET', 'POST'],
    description: 'Count documents matching a query',
    queryParams: [
      { name: 'q', type: 'string', description: 'Query in the Lucene query string syntax' },
      { name: 'df', type: 'string', description: 'Default field for query string' },
      { name: 'analyzer', type: 'string', description: 'Analyzer to use for query string' },
      { name: 'default_operator', type: 'string', description: 'Default operator', enum: ['AND', 'OR'] },
      { name: 'routing', type: 'string', description: 'Routing value' },
    ],
  },
  {
    path: '/{index}/_count',
    methods: ['GET', 'POST'],
    description: 'Count documents in a specific index',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name(s)', required: true }],
  },

  // Document APIs
  {
    path: '/{index}/_doc',
    methods: ['POST'],
    description: 'Index a document',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      { name: 'routing', type: 'string', description: 'Routing value' },
      { name: 'refresh', type: 'string', description: 'Refresh policy', enum: ['true', 'false', 'wait_for'] },
      { name: 'timeout', type: 'string', description: 'Operation timeout' },
      { name: 'pipeline', type: 'string', description: 'Ingest pipeline' },
    ],
  },
  {
    path: '/{index}/_doc/{id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Get, index, or delete a document by ID',
    pathParams: [
      { name: 'index', type: 'string', description: 'Index name', required: true },
      { name: 'id', type: 'string', description: 'Document ID', required: true },
    ],
  },
  {
    path: '/{index}/_update/{id}',
    methods: ['POST'],
    description: 'Update a document',
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
    queryParams: [
      { name: 'refresh', type: 'string', description: 'Refresh policy', enum: ['true', 'false', 'wait_for'] },
      { name: 'routing', type: 'string', description: 'Default routing' },
      { name: 'timeout', type: 'string', description: 'Operation timeout' },
      { name: 'pipeline', type: 'string', description: 'Default ingest pipeline' },
    ],
  },
  {
    path: '/{index}/_bulk',
    methods: ['POST'],
    description: 'Perform bulk operations on a specific index',
    pathParams: [{ name: 'index', type: 'string', description: 'Default index name', required: true }],
  },

  // Index APIs
  {
    path: '/{index}',
    methods: ['GET', 'PUT', 'DELETE', 'HEAD'],
    description: 'Manage an index',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },
  {
    path: '/{index}/_mapping',
    methods: ['GET', 'PUT'],
    description: 'Get or update index mappings',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },
  {
    path: '/{index}/_settings',
    methods: ['GET', 'PUT'],
    description: 'Get or update index settings',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },
  {
    path: '/{index}/_open',
    methods: ['POST'],
    description: 'Open a closed index',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },
  {
    path: '/{index}/_close',
    methods: ['POST'],
    description: 'Close an index',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },
  {
    path: '/{index}/_refresh',
    methods: ['POST'],
    description: 'Refresh an index',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },
  {
    path: '/{index}/_flush',
    methods: ['POST'],
    description: 'Flush an index',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },
  {
    path: '/{index}/_forcemerge',
    methods: ['POST'],
    description: 'Force merge an index',
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
  },
  {
    path: '/{index}/_alias/{alias}',
    methods: ['GET', 'PUT', 'DELETE', 'HEAD'],
    description: 'Manage a specific alias',
    pathParams: [
      { name: 'index', type: 'string', description: 'Index name', required: true },
      { name: 'alias', type: 'string', description: 'Alias name', required: true },
    ],
  },

  // Cat APIs
  {
    path: '/_cat/indices',
    methods: ['GET'],
    description: 'List indices',
    queryParams: [
      { name: 'format', type: 'string', description: 'Output format', enum: ['text', 'json'] },
      { name: 'h', type: 'string', description: 'Columns to display' },
      { name: 's', type: 'string', description: 'Sort by column' },
      { name: 'v', type: 'boolean', description: 'Verbose output' },
      { name: 'health', type: 'string', description: 'Filter by health', enum: ['green', 'yellow', 'red'] },
    ],
  },
  {
    path: '/_cat/health',
    methods: ['GET'],
    description: 'Cluster health',
    queryParams: [
      { name: 'format', type: 'string', description: 'Output format', enum: ['text', 'json'] },
      { name: 'v', type: 'boolean', description: 'Verbose output' },
    ],
  },
  {
    path: '/_cat/nodes',
    methods: ['GET'],
    description: 'List nodes',
    queryParams: [
      { name: 'format', type: 'string', description: 'Output format', enum: ['text', 'json'] },
      { name: 'h', type: 'string', description: 'Columns to display' },
      { name: 'v', type: 'boolean', description: 'Verbose output' },
    ],
  },
  {
    path: '/_cat/shards',
    methods: ['GET'],
    description: 'List shards',
    queryParams: [
      { name: 'format', type: 'string', description: 'Output format', enum: ['text', 'json'] },
      { name: 'h', type: 'string', description: 'Columns to display' },
      { name: 'v', type: 'boolean', description: 'Verbose output' },
    ],
  },
  {
    path: '/_cat/aliases',
    methods: ['GET'],
    description: 'List aliases',
    queryParams: [
      { name: 'format', type: 'string', description: 'Output format', enum: ['text', 'json'] },
      { name: 'v', type: 'boolean', description: 'Verbose output' },
    ],
  },
  {
    path: '/_cat/templates',
    methods: ['GET'],
    description: 'List templates',
    queryParams: [
      { name: 'format', type: 'string', description: 'Output format', enum: ['text', 'json'] },
      { name: 'v', type: 'boolean', description: 'Verbose output' },
    ],
  },
  {
    path: '/_cat/allocation',
    methods: ['GET'],
    description: 'Shard allocation',
    queryParams: [
      { name: 'format', type: 'string', description: 'Output format', enum: ['text', 'json'] },
      { name: 'v', type: 'boolean', description: 'Verbose output' },
    ],
  },

  // Cluster APIs
  {
    path: '/_cluster/health',
    methods: ['GET'],
    description: 'Cluster health',
    queryParams: [
      { name: 'wait_for_status', type: 'string', description: 'Wait for cluster status', enum: ['green', 'yellow', 'red'] },
      { name: 'timeout', type: 'string', description: 'Operation timeout' },
      { name: 'level', type: 'string', description: 'Detail level', enum: ['cluster', 'indices', 'shards'] },
    ],
  },
  {
    path: '/_cluster/state',
    methods: ['GET'],
    description: 'Cluster state',
  },
  {
    path: '/_cluster/stats',
    methods: ['GET'],
    description: 'Cluster stats',
  },
  {
    path: '/_cluster/settings',
    methods: ['GET', 'PUT'],
    description: 'Cluster settings',
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
  },
  {
    path: '/_cluster/reroute',
    methods: ['POST'],
    description: 'Reroute shards',
  },

  // Nodes APIs
  {
    path: '/_nodes',
    methods: ['GET'],
    description: 'Node information',
  },
  {
    path: '/_nodes/stats',
    methods: ['GET'],
    description: 'Node stats',
  },
  {
    path: '/_nodes/hot_threads',
    methods: ['GET'],
    description: 'Hot threads',
  },

  // Template APIs
  {
    path: '/_template/{template}',
    methods: ['GET', 'PUT', 'DELETE', 'HEAD'],
    description: 'Index templates (legacy)',
    pathParams: [{ name: 'template', type: 'string', description: 'Template name', required: true }],
  },
  {
    path: '/_index_template/{template}',
    methods: ['GET', 'PUT', 'DELETE', 'HEAD'],
    description: 'Index templates (composable)',
    pathParams: [{ name: 'template', type: 'string', description: 'Template name', required: true }],
  },
  {
    path: '/_component_template/{template}',
    methods: ['GET', 'PUT', 'DELETE', 'HEAD'],
    description: 'Component templates',
    pathParams: [{ name: 'template', type: 'string', description: 'Template name', required: true }],
  },

  // Analyze API
  {
    path: '/_analyze',
    methods: ['GET', 'POST'],
    description: 'Analyze text',
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
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },

  // Validate API
  {
    path: '/{index}/_validate/query',
    methods: ['GET', 'POST'],
    description: 'Validate a query',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      { name: 'explain', type: 'boolean', description: 'Explain query validation' },
      { name: 'rewrite', type: 'boolean', description: 'Rewrite query' },
    ],
  },

  // Multi Search API
  {
    path: '/_msearch',
    methods: ['GET', 'POST'],
    description: 'Execute multiple searches in one request',
  },
  {
    path: '/{index}/_msearch',
    methods: ['GET', 'POST'],
    description: 'Multi search on specific index',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },

  // Explain API
  {
    path: '/{index}/_explain/{id}',
    methods: ['GET', 'POST'],
    description: 'Explain document scoring',
    pathParams: [
      { name: 'index', type: 'string', description: 'Index name', required: true },
      { name: 'id', type: 'string', description: 'Document ID', required: true },
    ],
  },

  // Terms Enum API
  {
    path: '/{index}/_terms_enum',
    methods: ['GET', 'POST'],
    description: 'Get matching terms from an index',
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
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      { name: 'refresh', type: 'boolean', description: 'Refresh after update' },
      { name: 'timeout', type: 'string', description: 'Operation timeout' },
      { name: 'conflicts', type: 'string', description: 'Conflict handling', enum: ['abort', 'proceed'] },
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
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    queryParams: [
      { name: 'refresh', type: 'boolean', description: 'Refresh after delete' },
      { name: 'timeout', type: 'string', description: 'Operation timeout' },
      { name: 'conflicts', type: 'string', description: 'Conflict handling', enum: ['abort', 'proceed'] },
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
  },
  {
    path: '/_snapshot/{repository}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage snapshot repository',
    pathParams: [{ name: 'repository', type: 'string', description: 'Repository name', required: true }],
  },
  {
    path: '/_snapshot/{repository}/{snapshot}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage snapshot',
    pathParams: [
      { name: 'repository', type: 'string', description: 'Repository name', required: true },
      { name: 'snapshot', type: 'string', description: 'Snapshot name', required: true },
    ],
  },
  {
    path: '/_snapshot/{repository}/{snapshot}/_restore',
    methods: ['POST'],
    description: 'Restore snapshot',
    pathParams: [
      { name: 'repository', type: 'string', description: 'Repository name', required: true },
      { name: 'snapshot', type: 'string', description: 'Snapshot name', required: true },
    ],
  },

  // Task APIs
  {
    path: '/_tasks',
    methods: ['GET'],
    description: 'List tasks',
    queryParams: [
      { name: 'actions', type: 'string', description: 'Action filter' },
      { name: 'detailed', type: 'boolean', description: 'Detailed output' },
      { name: 'group_by', type: 'string', description: 'Group by', enum: ['nodes', 'parents', 'none'] },
    ],
  },
  {
    path: '/_tasks/{task_id}',
    methods: ['GET'],
    description: 'Get task status',
    pathParams: [{ name: 'task_id', type: 'string', description: 'Task ID', required: true }],
  },
  {
    path: '/_tasks/{task_id}/_cancel',
    methods: ['POST'],
    description: 'Cancel task',
    pathParams: [{ name: 'task_id', type: 'string', description: 'Task ID', required: true }],
  },

  // Ingest APIs
  {
    path: '/_ingest/pipeline',
    methods: ['GET'],
    description: 'List ingest pipelines',
  },
  {
    path: '/_ingest/pipeline/{pipeline}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage ingest pipeline',
    pathParams: [{ name: 'pipeline', type: 'string', description: 'Pipeline ID', required: true }],
  },
  {
    path: '/_ingest/pipeline/_simulate',
    methods: ['GET', 'POST'],
    description: 'Simulate pipeline',
  },

  // Script APIs
  {
    path: '/_scripts/{id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage stored script',
    pathParams: [{ name: 'id', type: 'string', description: 'Script ID', required: true }],
  },

  // Field Caps API
  {
    path: '/_field_caps',
    methods: ['GET', 'POST'],
    description: 'Field capabilities',
    queryParams: [
      { name: 'fields', type: 'string', description: 'Fields to retrieve', required: true },
    ],
  },
  {
    path: '/{index}/_field_caps',
    methods: ['GET', 'POST'],
    description: 'Field capabilities for index',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },

  // Scroll API
  {
    path: '/_search/scroll',
    methods: ['GET', 'POST', 'DELETE'],
    description: 'Scroll search results',
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
  },
  {
    path: '/{index}/_cache/clear',
    methods: ['POST'],
    description: 'Clear index cache',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },

  // Recovery API
  {
    path: '/{index}/_recovery',
    methods: ['GET'],
    description: 'Index recovery status',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },

  // Segments API
  {
    path: '/{index}/_segments',
    methods: ['GET'],
    description: 'Index segments',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },

  // Stats APIs
  {
    path: '/_stats',
    methods: ['GET'],
    description: 'Cluster statistics',
  },
  {
    path: '/{index}/_stats',
    methods: ['GET'],
    description: 'Index statistics',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
  },

  // Search Shards API
  {
    path: '/{index}/_search_shards',
    methods: ['GET', 'POST'],
    description: 'Search shards routing',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
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
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.9.0' } },
  },

  // SQL
  {
    path: '/_sql',
    methods: ['GET', 'POST'],
    description: 'SQL query',
    availability: { [BackendType.ELASTICSEARCH]: { min: '6.3.0' } },
    requestBody: {
      properties: {
        query: { type: 'string', description: 'SQL query' },
        fetch_size: { type: 'integer', description: 'Fetch size' },
        format: { type: 'string', description: 'Response format', enum: ['csv', 'json', 'tsv', 'txt', 'yaml'] },
      },
    },
  },

  // Transform APIs
  {
    path: '/_transform',
    methods: ['GET'],
    description: 'List transforms',
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.2.0' } },
  },
  {
    path: '/_transform/{transform_id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage transform',
    pathParams: [{ name: 'transform_id', type: 'string', description: 'Transform ID', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.2.0' } },
  },

  // Data Stream APIs
  {
    path: '/_data_stream',
    methods: ['GET'],
    description: 'List data streams',
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.9.0' } },
  },
  {
    path: '/_data_stream/{data_stream}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage data stream',
    pathParams: [{ name: 'data_stream', type: 'string', description: 'Data stream name', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.9.0' } },
  },

  // ILM (Index Lifecycle Management)
  {
    path: '/_ilm/policy',
    methods: ['GET'],
    description: 'List ILM policies',
    availability: { [BackendType.ELASTICSEARCH]: { min: '6.6.0' } },
  },
  {
    path: '/_ilm/policy/{policy}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage ILM policy',
    pathParams: [{ name: 'policy', type: 'string', description: 'Policy name', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '6.6.0' } },
  },

  // Rollup APIs
  {
    path: '/_rollup/job/{job_id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage rollup job',
    pathParams: [{ name: 'job_id', type: 'string', description: 'Job ID', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '6.3.0' } },
  },

  // Watcher APIs
  {
    path: '/_watcher/watch/{watch_id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage watch',
    pathParams: [{ name: 'watch_id', type: 'string', description: 'Watch ID', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '5.0.0' } },
  },

  // Cross-Cluster Replication
  {
    path: '/_ccr/stats',
    methods: ['GET'],
    description: 'CCR stats',
    availability: { [BackendType.ELASTICSEARCH]: { min: '6.5.0' } },
  },

  // Autoscaling
  {
    path: '/_autoscaling/capacity',
    methods: ['GET'],
    description: 'Autoscaling capacity',
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.11.0' } },
  },

  // ML APIs
  {
    path: '/_ml/anomaly_detectors',
    methods: ['GET'],
    description: 'List anomaly detection jobs',
    availability: { [BackendType.ELASTICSEARCH]: { min: '5.4.0' } },
  },
  {
    path: '/_ml/anomaly_detectors/{job_id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage anomaly detection job',
    pathParams: [{ name: 'job_id', type: 'string', description: 'Job ID', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '5.4.0' } },
  },
  {
    path: '/_ml/trained_models',
    methods: ['GET'],
    description: 'List trained models',
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.10.0' } },
  },
  {
    path: '/_ml/trained_models/{model_id}',
    methods: ['GET', 'DELETE'],
    description: 'Get or delete trained model',
    pathParams: [{ name: 'model_id', type: 'string', description: 'Model ID', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.10.0' } },
  },
  {
    path: '/_ml/trained_models/{model_id}/_infer',
    methods: ['POST'],
    description: 'Infer using trained model',
    pathParams: [{ name: 'model_id', type: 'string', description: 'Model ID', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '7.10.0' } },
  },

  // Security APIs
  {
    path: '/_security/user',
    methods: ['GET'],
    description: 'List users',
    availability: { [BackendType.ELASTICSEARCH]: { min: '5.0.0' } },
  },
  {
    path: '/_security/user/{username}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage user',
    pathParams: [{ name: 'username', type: 'string', description: 'Username', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '5.0.0' } },
  },
  {
    path: '/_security/role',
    methods: ['GET'],
    description: 'List roles',
    availability: { [BackendType.ELASTICSEARCH]: { min: '5.0.0' } },
  },
  {
    path: '/_security/role/{role}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage role',
    pathParams: [{ name: 'role', type: 'string', description: 'Role name', required: true }],
    availability: { [BackendType.ELASTICSEARCH]: { min: '5.0.0' } },
  },
  {
    path: '/_security/api_key',
    methods: ['GET', 'POST'],
    description: 'Manage API keys',
    availability: { [BackendType.ELASTICSEARCH]: { min: '6.7.0' } },
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
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },
  {
    path: '/_plugins/_anomaly_detection/detectors/{detector_id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage anomaly detector',
    pathParams: [{ name: 'detector_id', type: 'string', description: 'Detector ID', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },

  // Alerting
  {
    path: '/_plugins/_alerting/monitors',
    methods: ['GET'],
    description: 'List alerting monitors',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },
  {
    path: '/_plugins/_alerting/monitors/{monitor_id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage alerting monitor',
    pathParams: [{ name: 'monitor_id', type: 'string', description: 'Monitor ID', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },

  // Index State Management
  {
    path: '/_plugins/_ism/policies',
    methods: ['GET'],
    description: 'List ISM policies',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },
  {
    path: '/_plugins/_ism/policies/{policy}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage ISM policy',
    pathParams: [{ name: 'policy', type: 'string', description: 'Policy name', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },

  // Security
  {
    path: '/_plugins/_security/api/account',
    methods: ['GET', 'PUT'],
    description: 'Account information',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },
  {
    path: '/_plugins/_security/api/internalusers',
    methods: ['GET'],
    description: 'List internal users',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },
  {
    path: '/_plugins/_security/api/internalusers/{username}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage internal user',
    pathParams: [{ name: 'username', type: 'string', description: 'Username', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },
  {
    path: '/_plugins/_security/api/roles',
    methods: ['GET'],
    description: 'List roles',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },
  {
    path: '/_plugins/_security/api/roles/{role}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage role',
    pathParams: [{ name: 'role', type: 'string', description: 'Role name', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },

  // k-NN
  {
    path: '/_plugins/_knn/stats',
    methods: ['GET'],
    description: 'k-NN plugin stats',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },
  {
    path: '/{index}/_plugins/_knn/warmup',
    methods: ['GET'],
    description: 'Warm up k-NN index',
    pathParams: [{ name: 'index', type: 'string', description: 'Index name', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },

  // Asynchronous Search
  {
    path: '/_plugins/_asynchronous_search',
    methods: ['POST'],
    description: 'Create asynchronous search',
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },
  {
    path: '/_plugins/_asynchronous_search/{id}',
    methods: ['GET', 'DELETE'],
    description: 'Get or delete asynchronous search',
    pathParams: [{ name: 'id', type: 'string', description: 'Search ID', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '1.0.0' } },
  },

  // Notifications
  {
    path: '/_plugins/_notifications/channels',
    methods: ['GET'],
    description: 'List notification channels',
    availability: { [BackendType.OPENSEARCH]: { min: '2.0.0' } },
  },
  {
    path: '/_plugins/_notifications/channels/{channel_id}',
    methods: ['GET', 'PUT', 'DELETE'],
    description: 'Manage notification channel',
    pathParams: [{ name: 'channel_id', type: 'string', description: 'Channel ID', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '2.0.0' } },
  },

  // Neural Search (ML)
  {
    path: '/_plugins/_ml/models',
    methods: ['GET'],
    description: 'List ML models',
    availability: { [BackendType.OPENSEARCH]: { min: '2.4.0' } },
  },
  {
    path: '/_plugins/_ml/models/{model_id}',
    methods: ['GET', 'DELETE'],
    description: 'Get or delete ML model',
    pathParams: [{ name: 'model_id', type: 'string', description: 'Model ID', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '2.4.0' } },
  },
  {
    path: '/_plugins/_ml/models/{model_id}/_load',
    methods: ['POST'],
    description: 'Load ML model',
    pathParams: [{ name: 'model_id', type: 'string', description: 'Model ID', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '2.4.0' } },
  },
  {
    path: '/_plugins/_ml/models/{model_id}/_unload',
    methods: ['POST'],
    description: 'Unload ML model',
    pathParams: [{ name: 'model_id', type: 'string', description: 'Model ID', required: true }],
    availability: { [BackendType.OPENSEARCH]: { min: '2.4.0' } },
  },
  {
    path: '/_plugins/_ml/models/{model_id}/_predict',
    methods: ['POST'],
    description: 'Predict using ML model',
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
    this.endpoints.set(BackendType.ELASTICSEARCH, [
      ...commonEndpoints,
      ...elasticsearchEndpoints,
    ]);
    
    this.endpoints.set(BackendType.OPENSEARCH, [
      ...commonEndpoints,
      ...opensearchEndpoints,
    ]);
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
  findEndpoint(backend: BackendType, path: string, method?: HttpMethod, version?: string): ApiEndpoint | undefined {
    const endpoints = this.getEndpoints(backend, version);
    
    return endpoints.find(endpoint => {
      if (method && !endpoint.methods.includes(method)) {
        return false;
      }
      return this.matchPath(endpoint.path, path);
    });
  }

  /**
   * Match a path against an endpoint pattern
   */
  private matchPath(pattern: string, path: string): boolean {
    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/\{[^}]+\}/g, '[^/]+') // Replace {param} with [^/]+
      .replace(/\//g, '\\/'); // Escape slashes
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
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
    const uniquePaths = new Set<string>();
    endpoints.forEach(endpoint => {
      const path = endpoint.path;
      if (path.startsWith(prefix) || this.pathMatchesPrefix(path, prefix)) {
        // Get the next segment after prefix
        const nextSegment = this.getNextPathSegment(path, prefix);
        if (nextSegment) {
          uniquePaths.add(nextSegment);
        }
      }
    });

    return [...uniquePaths];
  }

  /**
   * Check if a path pattern matches a prefix
   */
  private pathMatchesPrefix(pattern: string, prefix: string): boolean {
    const patternParts = pattern.split('/');
    const prefixParts = prefix.split('/');
    
    for (let i = 0; i < prefixParts.length - 1; i++) {
      if (patternParts[i] !== prefixParts[i] && !patternParts[i]?.startsWith('{')) {
        return false;
      }
    }
    return true;
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
