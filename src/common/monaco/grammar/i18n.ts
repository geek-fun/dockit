/**
 * Internationalization helper for grammar module
 * Provides translation support for API descriptions
 * 
 * This module defines English descriptions that serve as:
 * 1. Fallback descriptions for the grammar-driven completion engine
 * 2. Reference for the i18n translation keys in src/lang/enUS.ts and src/lang/zhCN.ts
 * 
 * For multi-language support in Vue components, use:
 *   lang.global.t(endpoint.descriptionKey)
 * where descriptionKey comes from ApiEndpoint.descriptionKey
 */

/**
 * Grammar description translations
 * Keys are used as fallback English descriptions
 * The lang module will be used for actual translations when available
 */
export const grammarDescriptions = {
  // Search APIs
  search: 'Execute a search query',
  searchIndex: 'Execute a search query on a specific index',
  count: 'Count documents matching a query',
  countIndex: 'Count documents in a specific index',

  // Document APIs
  indexDoc: 'Index a document',
  getDoc: 'Get, index, or delete a document by ID',
  updateDoc: 'Update a document',
  bulk: 'Perform multiple index/delete/update operations in a single request',
  bulkIndex: 'Perform bulk operations on a specific index',

  // Index APIs
  manageIndex: 'Manage an index',
  indexMapping: 'Get or update index mappings',
  indexSettings: 'Get or update index settings',
  openIndex: 'Open a closed index',
  closeIndex: 'Close an index',
  refreshIndex: 'Refresh an index',
  flushIndex: 'Flush an index',
  forcemergeIndex: 'Force merge an index',

  // Alias APIs
  manageAliases: 'Manage index aliases',
  manageAlias: 'Manage a specific alias',

  // Cat APIs
  catIndices: 'List indices',
  catHealth: 'Cluster health',
  catNodes: 'List nodes',
  catShards: 'List shards',
  catAliases: 'List aliases',
  catTemplates: 'List templates',
  catAllocation: 'Shard allocation',

  // Cluster APIs
  clusterHealth: 'Cluster health',
  clusterState: 'Cluster state',
  clusterStats: 'Cluster stats',
  clusterSettings: 'Cluster settings',
  clusterAllocationExplain: 'Explain shard allocation',
  clusterReroute: 'Reroute shards',

  // Nodes APIs
  nodesInfo: 'Node information',
  nodesStats: 'Node stats',
  nodesHotThreads: 'Hot threads',

  // Template APIs
  indexTemplate: 'Index templates (legacy)',
  indexTemplateComposable: 'Index templates (composable)',
  componentTemplate: 'Component templates',

  // Analyze API
  analyze: 'Analyze text',
  analyzeIndex: 'Analyze text using index analyzer',

  // Validate API
  validateQuery: 'Validate a query',

  // Multi Search API
  multiSearch: 'Execute multiple searches in one request',
  multiSearchIndex: 'Multi search on specific index',

  // Explain API
  explainDoc: 'Explain document scoring',

  // Terms Enum API
  termsEnum: 'Get matching terms from an index',

  // Reindex API
  reindex: 'Reindex documents',

  // Update by Query API
  updateByQuery: 'Update documents by query',

  // Delete by Query API
  deleteByQuery: 'Delete documents by query',

  // Snapshot APIs
  listSnapshots: 'List snapshot repositories',
  manageRepository: 'Manage snapshot repository',
  manageSnapshot: 'Manage snapshot',
  restoreSnapshot: 'Restore snapshot',

  // Task APIs
  listTasks: 'List tasks',
  getTask: 'Get task status',
  cancelTask: 'Cancel task',

  // Ingest APIs
  listPipelines: 'List ingest pipelines',
  managePipeline: 'Manage ingest pipeline',
  simulatePipeline: 'Simulate pipeline',

  // Script APIs
  manageScript: 'Manage stored script',

  // Field Caps API
  fieldCaps: 'Field capabilities',
  fieldCapsIndex: 'Field capabilities for index',

  // Scroll API
  scroll: 'Scroll search results',

  // Clear Cache API
  clearCache: 'Clear cluster cache',
  clearCacheIndex: 'Clear index cache',

  // Recovery API
  recovery: 'Index recovery status',

  // Segments API
  segments: 'Index segments',

  // Stats APIs
  clusterStatsAll: 'Cluster statistics',
  indexStats: 'Index statistics',

  // Search Shards API
  searchShards: 'Search shards routing',

  // Elasticsearch-specific
  eqlSearch: 'EQL search',
  sql: 'SQL query',
  listTransforms: 'List transforms',
  manageTransform: 'Manage transform',
  listDataStreams: 'List data streams',
  manageDataStream: 'Manage data stream',
  listIlmPolicies: 'List ILM policies',
  manageIlmPolicy: 'Manage ILM policy',
  manageRollupJob: 'Manage rollup job',
  manageWatch: 'Manage watch',
  ccrStats: 'CCR stats',
  autoscalingCapacity: 'Autoscaling capacity',
  listAnomalyDetectors: 'List anomaly detection jobs',
  manageAnomalyDetector: 'Manage anomaly detection job',
  listTrainedModels: 'List trained models',
  manageTrainedModel: 'Get or delete trained model',
  inferTrainedModel: 'Infer using trained model',
  listUsers: 'List users',
  manageUser: 'Manage user',
  listRoles: 'List roles',
  manageRole: 'Manage role',
  manageApiKeys: 'Manage API keys',

  // OpenSearch-specific
  pplQuery: 'PPL query',
  listOsAnomalyDetectors: 'List anomaly detectors',
  manageOsAnomalyDetector: 'Manage anomaly detector',
  listAlertingMonitors: 'List alerting monitors',
  manageAlertingMonitor: 'Manage alerting monitor',
  listIsmPolicies: 'List ISM policies',
  manageIsmPolicy: 'Manage ISM policy',
  securityAccount: 'Account information',
  listInternalUsers: 'List internal users',
  manageInternalUser: 'Manage internal user',
  listOsRoles: 'List roles',
  manageOsRole: 'Manage role',
  knnStats: 'k-NN plugin stats',
  knnWarmup: 'Warm up k-NN index',
  asyncSearch: 'Create asynchronous search',
  manageAsyncSearch: 'Get or delete asynchronous search',
  listNotificationChannels: 'List notification channels',
  manageNotificationChannel: 'Manage notification channel',
  listMlModels: 'List ML models',
  manageMlModel: 'Get or delete ML model',
  loadMlModel: 'Load ML model',
  unloadMlModel: 'Unload ML model',
  predictMlModel: 'Predict using ML model',

  // Query parameters
  queryParam: {
    q: 'Query in the Lucene query string syntax',
    df: 'Default field for query string',
    analyzer: 'Analyzer to use for query string',
    defaultOperator: 'Default operator for query string',
    from: 'Starting offset',
    size: 'Number of hits to return',
    sort: 'Sort order',
    timeout: 'Search timeout',
    terminateAfter: 'Maximum number of documents to collect',
    trackTotalHits: 'Track total number of hits',
    searchType: 'Search type',
    requestCache: 'Enable request cache',
    routing: 'Routing value',
    preference: 'Execution preference',
    refresh: 'Refresh policy',
    pipeline: 'Ingest pipeline',
    format: 'Output format',
    h: 'Columns to display',
    s: 'Sort by column',
    v: 'Verbose output',
    health: 'Filter by health',
    waitForStatus: 'Wait for cluster status',
    level: 'Detail level',
    explain: 'Explain query validation',
    rewrite: 'Rewrite query',
    maxNumSegments: 'Maximum number of segments',
    onlyExpungeDeletes: 'Only expunge deletes',
    flush: 'Flush after merge',
    actions: 'Action filter',
    detailed: 'Detailed output',
    groupBy: 'Group by',
    fields: 'Fields to retrieve',
    waitForCompletion: 'Wait for completion',
    requestsPerSecond: 'Requests per second',
    slices: 'Number of slices',
    conflicts: 'Conflict handling',
  },

  // Request body properties
  bodyProp: {
    query: 'Query DSL',
    source: 'Source filtering',
    aggs: 'Aggregations',
    aggregations: 'Aggregations',
    highlight: 'Highlighting',
    postFilter: 'Post filter',
    trackTotalHits: 'Track total hits',
    explain: 'Explain scoring',
    profile: 'Profile query execution',
    minScore: 'Minimum score threshold',
    suggest: 'Suggest queries',
    scriptFields: 'Script fields',
    storedFields: 'Stored fields to retrieve',
    docvalueFields: 'Doc value fields to retrieve',
    indicesBoost: 'Index boosting',
    rescore: 'Query rescoring',
    searchAfter: 'Search after for pagination',
    pit: 'Point in time',
    runtimeMappings: 'Runtime mappings',
    seqNoPrimaryTerm: 'Return sequence number and primary term',
    version: 'Return version number',
    collapse: 'Field collapsing',
    slice: 'Sliced scroll',
    doc: 'Partial document',
    script: 'Update script',
    upsert: 'Document to upsert',
    docAsUpsert: 'Use doc as upsert',
    detectNoop: 'Detect noop updates',
    persistent: 'Persistent settings',
    transient: 'Transient settings',
    text: 'Text to analyze',
    tokenizer: 'Tokenizer name',
    filter: 'Token filters',
    charFilter: 'Character filters',
    field: 'Field to derive analyzer from',
    scrollId: 'Scroll ID',
    scroll: 'Scroll keep-alive time',
    dest: 'Destination index configuration',
    maxDocs: 'Maximum documents',
    fetchSize: 'Fetch size',
  },
};

/**
 * Type for the grammar descriptions object
 */
export type GrammarDescriptions = typeof grammarDescriptions;

/**
 * Get a description by key from the grammar descriptions
 * This returns the English description as a fallback
 * For multi-language support, use lang.global.t(descriptionKey) in Vue components
 * 
 * @param key - The key to look up in grammarDescriptions
 * @returns The English description or the key if not found
 */
export const getDescription = (key: keyof typeof grammarDescriptions): string => {
  if (key in grammarDescriptions) {
    const desc = grammarDescriptions[key];
    return typeof desc === 'string' ? desc : key;
  }
  return key;
};
