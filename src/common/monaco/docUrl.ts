/**
 * Shared doc URL building utilities
 * Extracted from referDoc.ts and completionProvider.ts to eliminate duplication
 */
import { BackendType } from './searchdsl/types';

export type DocLanguage = 'en' | 'cn';

export const ES_NEW_API_BASE = 'https://www.elastic.co/docs/api/doc/elasticsearch';
export const ES_OLD_GUIDE_BASE = 'https://www.elastic.co/guide/en/elasticsearch/reference';

export const DOC_BASE_URLS: Record<BackendType, Record<DocLanguage, string>> = {
  [BackendType.ELASTICSEARCH]: {
    en: ES_NEW_API_BASE,
    cn: ES_NEW_API_BASE,
  },
  [BackendType.OPENSEARCH]: {
    en: 'https://docs.opensearch.org/latest',
    cn: 'https://docs.opensearch.org/latest',
  },
};

export const AVAILABLE_ES_VERSIONS: Record<number, number[]> = {
  0: [90],
  1: [3, 4, 5, 6, 7],
  2: [0, 1, 2, 3, 4],
  5: [0, 1, 2, 3, 4, 5, 6],
  6: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  7: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
  8: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
};

export const findClosestAvailableVersion = (version: string): string => {
  if (!version || version === 'current') return '';
  const parts = version.split('.');
  if (parts.length < 1) return '';
  const major = parseInt(parts[0], 10);
  const minor = parts.length >= 2 ? parseInt(parts[1], 10) : 0;

  if (major >= 9) return '';

  const availableMajor = AVAILABLE_ES_VERSIONS[major];
  if (availableMajor) {
    const closestMinor =
      availableMajor.find(m => m >= minor) ?? availableMajor[availableMajor.length - 1];
    return `${major}.${closestMinor}`;
  }

  const sortedMajors = Object.keys(AVAILABLE_ES_VERSIONS)
    .map(Number)
    .sort((a, b) => a - b);

  const closestMajor = sortedMajors.find(m => m >= major);
  if (closestMajor) {
    return `${closestMajor}.${AVAILABLE_ES_VERSIONS[closestMajor][0]}`;
  }

  return '8.19';
};

export const shouldUseNewApiDocs = (version: string): boolean => {
  if (!version || version === 'current') return true;
  const parts = version.split('.');
  if (parts.length < 1) return false;
  const major = parseInt(parts[0], 10);
  return major >= 9;
};

export const normalizeVersionForNewDocs = (version: string): string => {
  if (!version || version === 'current') return '';
  const parts = version.split('.');
  if (parts.length < 1) return '';
  const major = parseInt(parts[0], 10);
  if (major >= 9) return `v${major}`;
  return '';
};

export const METHOD_TO_NEW_DOCS_OPERATION: Record<string, Record<string, string>> = {
  'operation-indices-update-settings': {
    GET: 'operation-indices-get-settings',
    PUT: 'operation-indices-put-settings',
  },
  'operation-cluster-update-settings': {
    GET: 'operation-cluster-get-settings',
    PUT: 'operation-cluster-put-settings',
  },
  'operation-indices-templates-v1': {
    GET: 'operation-indices-get-template',
    PUT: 'operation-indices-put-template',
    DELETE: 'operation-indices-delete-template',
    HEAD: 'operation-indices-exists-template',
  },
  'operation-indices-component-template': {
    GET: 'operation-cluster-get-component-template',
    PUT: 'operation-cluster-put-component-template',
    DELETE: 'operation-cluster-delete-component-template',
    HEAD: 'operation-cluster-exists-component-template',
  },
  'operation-indices-create': {
    GET: 'operation-indices-get',
    PUT: 'operation-indices-create',
    DELETE: 'operation-indices-delete',
    HEAD: 'operation-indices-exists',
  },
  'operation-create': {
    PUT: 'operation-create',
    POST: 'operation-create',
  },
  'operation-get': {
    GET: 'operation-get',
    PUT: 'operation-index',
    DELETE: 'operation-delete',
  },
  'operation-indices-put-template': {
    GET: 'operation-indices-get-index-template',
    PUT: 'operation-indices-put-index-template',
    DELETE: 'operation-indices-delete-index-template',
    HEAD: 'operation-indices-exists-index-template',
  },
  'operation-indices-put-mapping': {
    GET: 'operation-indices-get-mapping',
  },
  'operation-indices-update-aliases': {
    GET: 'operation-indices-get-alias',
    PUT: 'operation-indices-put-alias',
    DELETE: 'operation-indices-remove-alias',
    HEAD: 'operation-indices-exists-alias',
  },
  'operation-scroll': {
    GET: 'operation-scroll',
    POST: 'operation-scroll',
    DELETE: 'operation-clear-scroll',
  },
  'operation-ingest-put-pipeline': {
    GET: 'operation-ingest-get-pipeline',
    PUT: 'operation-ingest-put-pipeline',
    DELETE: 'operation-ingest-delete-pipeline',
  },
  'operation-get-script': {
    PUT: 'operation-put-script',
    DELETE: 'operation-delete-script',
  },
  'operation-transform-get-transform': {
    PUT: 'operation-transform-put-transform',
    DELETE: 'operation-transform-delete-transform',
  },
  'operation-snapshot-create-repository': {
    GET: 'operation-snapshot-get-repository',
    PUT: 'operation-snapshot-create-repository',
    DELETE: 'operation-snapshot-delete-repository',
  },
  'operation-snapshot-create': {
    GET: 'operation-snapshot-get',
    PUT: 'operation-snapshot-create',
    DELETE: 'operation-snapshot-delete',
  },
  'operation-ilm-put-lifecycle': {
    GET: 'operation-ilm-get-lifecycle',
    PUT: 'operation-ilm-put-lifecycle',
    DELETE: 'operation-ilm-delete-lifecycle',
  },
  'operation-ml-get-jobs': {
    PUT: 'operation-ml-put-job',
    DELETE: 'operation-ml-delete-job',
  },
  'operation-security-get-user': {
    PUT: 'operation-security-put-user',
    DELETE: 'operation-security-delete-user',
  },
  'operation-security-get-role': {
    PUT: 'operation-security-put-role',
    DELETE: 'operation-security-delete-role',
  },
  'operation-security-get-api-key': {
    POST: 'operation-security-create-api-key',
  },
  'operation-watcher-get-watch': {
    PUT: 'operation-watcher-put-watch',
    DELETE: 'operation-watcher-delete-watch',
  },
  'operation-indices-get-data-stream': {
    POST: 'operation-indices-modify-data-stream',
    PUT: 'operation-indices-create-data-stream',
    DELETE: 'operation-indices-delete-data-stream',
  },
  'operation-rollup-get-jobs': {
    PUT: 'operation-rollup-put-job',
    DELETE: 'operation-rollup-delete-job',
  },
  'operation-ml-get-trained-models': {
    DELETE: 'operation-ml-delete-trained-model',
  },
};

export const OPERATION_TO_GUIDE_PAGE: Record<string, string> = {
  'operation-search': 'search-search',
  'operation-count': 'search-count',
  'operation-field-caps': 'search-field-caps',
  'operation-scroll': 'search-request-scroll',
  'operation-search-shards': 'search-shards',
  'operation-validate': 'search-validate',
  'operation-indices-validate-query': 'search-validate',
  'operation-msearch': 'search-multi-search',
  'operation-explain': 'search-explain',
  'operation-terms-enum': 'search-terms-enum',
  'operation-create': 'docs-index_',
  'operation-index': 'docs-index_',
  'operation-get': 'docs-get',
  'operation-delete': 'docs-delete',
  'operation-update': 'docs-update',
  'operation-bulk': 'docs-bulk',
  'operation-reindex': 'docs-reindex',
  'operation-update-by-query': 'docs-update-by-query',
  'operation-delete-by-query': 'docs-delete-by-query',
  'operation-indices-create': 'indices-create-index',
  'operation-indices-get': 'indices-get-index',
  'operation-indices-delete': 'indices-delete-index',
  'operation-indices-exists': 'indices-exists',
  'operation-indices-put-mapping': 'indices-put-mapping',
  'operation-indices-get-mapping': 'indices-get-mapping',
  'operation-indices-get-settings': 'indices-get-settings',
  'operation-indices-put-settings': 'indices-update-settings',
  'operation-indices-open': 'indices-open-close',
  'operation-indices-close': 'indices-open-close',
  'operation-indices-refresh': 'indices-refresh',
  'operation-indices-flush': 'indices-flush',
  'operation-indices-forcemerge': 'indices-forcemerge',
  'operation-indices-update-aliases': 'indices-aliases',
  'operation-indices-get-alias': 'indices-get-alias',
  'operation-indices-put-alias': 'indices-add-alias',
  'operation-indices-remove-alias': 'indices-remove-alias',
  'operation-indices-exists-alias': 'indices-exists-alias',
  'operation-indices-clone': 'indices-clone-index',
  'operation-indices-get-template': 'indices-templates',
  'operation-indices-put-template': 'indices-templates',
  'operation-indices-delete-template': 'indices-templates',
  'operation-indices-exists-template': 'indices-templates',
  'operation-indices-put-index-template': 'indices-put-template',
  'operation-indices-get-index-template': 'indices-put-template',
  'operation-indices-delete-index-template': 'indices-put-template',
  'operation-indices-exists-index-template': 'indices-put-template',
  'operation-clear-scroll': 'search-request-scroll',
  'operation-cluster-get-component-template': 'indices-component-template',
  'operation-cluster-put-component-template': 'indices-component-template',
  'operation-cluster-delete-component-template': 'indices-component-template',
  'operation-cluster-exists-component-template': 'indices-component-template',
  'operation-indices-analyze': 'indices-analyze',
  'operation-indices-clear-cache': 'indices-clearcache',
  'operation-indices-recovery': 'indices-recovery',
  'operation-indices-segments': 'indices-segments',
  'operation-indices-stats': 'indices-stats',
  'operation-cat-indices': 'cat-indices',
  'operation-cat-health': 'cat-health',
  'operation-cat-nodes': 'cat-nodes',
  'operation-cat-shards': 'cat-shards',
  'operation-cat-aliases': 'cat-alias',
  'operation-cat-templates': 'cat-templates',
  'operation-cat-allocation': 'cat-allocation',
  'operation-cluster-health': 'cluster-health',
  'operation-cluster-state': 'cluster-state',
  'operation-cluster-stats': 'cluster-stats',
  'operation-cluster-get-settings': 'cluster-update-settings',
  'operation-cluster-put-settings': 'cluster-update-settings',
  'operation-cluster-allocation-explain': 'cluster-allocation-explain',
  'operation-cluster-reroute': 'cluster-reroute',
  'operation-nodes-info': 'cluster-nodes-info',
  'operation-nodes-stats': 'cluster-nodes-stats',
  'operation-nodes-hot-threads': 'cluster-nodes-hot-threads',
  'operation-tasks-list': 'tasks',
  'operation-tasks-get': 'tasks',
  'operation-tasks-cancel': 'tasks',
  'operation-ingest-get-pipeline': 'ingest-apis',
  'operation-ingest-put-pipeline': 'ingest-apis',
  'operation-ingest-simulate': 'ingest-apis',
  'operation-ingest-delete-pipeline': 'delete-pipeline-api',
  'operation-get-script': 'modules-scripting',
  'operation-put-script': 'modules-scripting',
  'operation-delete-script': 'modules-scripting',
  'operation-snapshot-get-repository': 'modules-snapshots',
  'operation-snapshot-create-repository': 'snapshots-register-repository',
  'operation-snapshot-delete-repository': 'snapshots-repositories',
  'operation-snapshot-create': 'modules-snapshots',
  'operation-snapshot-get': 'get-snapshot-api',
  'operation-snapshot-delete': 'delete-snapshot-api',
  'operation-snapshot-restore': 'snapshot-restore',
  // EQL
  'operation-eql-search': 'eql-search-api',
  // SQL
  'operation-sql-query': 'sql-search-api',
  // Transform
  'operation-transform-get-transform': 'transform-apis',
  'operation-transform-put-transform': 'transform-apis',
  'operation-transform-delete-transform': 'transform-apis',
  // Data Stream
  'operation-indices-get-data-stream': 'data-stream-apis',
  'operation-indices-create-data-stream': 'data-stream-apis',
  'operation-indices-delete-data-stream': 'data-stream-apis',
  // ILM
  'operation-ilm-put-lifecycle': 'index-lifecycle-management',
  'operation-ilm-get-lifecycle': 'index-lifecycle-management',
  'operation-ilm-get-status': 'index-lifecycle-management',
  'operation-ilm-delete-lifecycle': 'index-lifecycle-management',
  // Rollup
  'operation-rollup-get-jobs': 'rollup-apis',
  'operation-rollup-put-job': 'rollup-apis',
  'operation-rollup-delete-job': 'rollup-apis',
  // CCR
  'operation-ccr-stats': 'ccr-apis',
  // ML
  'operation-ml-get-jobs': 'ml-apis',
  'operation-ml-get-trained-models': 'ml-apis',
  'operation-ml-put-trained-model': 'ml-apis',
  'operation-ml-delete-trained-model': 'ml-apis',
  'operation-ml-infer-trained-model': 'ml-apis',
  'operation-ml-put-job': 'ml-put-job',
  'operation-ml-delete-job': 'ml-delete-job',
  // Watcher
  'operation-watcher-get-watch': 'watcher-api',
  'operation-watcher-put-watch': 'watcher-api-put-watch',
  'operation-watcher-delete-watch': 'watcher-api-delete-watch',
  // Security
  'operation-security-get-user': 'security-api',
  'operation-security-put-user': 'security-api-put-user',
  'operation-security-delete-user': 'security-api-delete-user',
  'operation-security-get-role': 'security-api',
  'operation-security-put-role': 'security-api-put-role',
  'operation-security-delete-role': 'security-api-delete-role',
  'operation-security-get-api-key': 'security-api-get-api-key',
  'operation-security-create-api-key': 'security-api-create-api-key',
};

export const transformDocPathForMethod = (docPath: string, method: string): string => {
  const methodMap = METHOD_TO_NEW_DOCS_OPERATION[docPath];
  if (methodMap && methodMap[method]) {
    return methodMap[method];
  }
  return docPath;
};

export const transformOperationToGuidePage = (docPath: string): string => {
  const guidePage = OPERATION_TO_GUIDE_PAGE[docPath];
  if (guidePage) return guidePage;

  const name = docPath.replace(/^operation-/, '');
  if (!name.includes('-')) {
    return `${name}-${name}`;
  }
  return name;
};

const OPENSEARCH_API_CATEGORIES: Record<string, string> = {
  search: 'search-apis',
  count: 'search-apis',
  msearch: 'search-apis',
  explain: 'search-apis',
  validate: 'search-apis',
  indices: 'index-apis',
  docs: 'document-apis',
  bulk: 'document-apis',
  reindex: 'document-apis',
  update: 'document-apis',
  delete: 'document-apis',
  cluster: 'cluster-api',
  nodes: 'cluster-api',
  cat: 'cat',
  aliases: 'alias',
  templates: 'index-apis',
  settings: 'index-apis',
  mapping: 'index-apis',
  analyze: 'index-apis',
  sql: 'search-apis',
  ppl: 'search-apis',
  ad: 'anomaly-detection',
  alerting: 'alerting',
  ism: 'index-management',
  security: 'security',
  knn: 'knn',
  async: 'asynchronous-search',
  notifications: 'notifications',
  ml: 'ml-commons',
};

const OPENSEARCH_API_NAME_FIXES: Record<string, string> = {
  'indices-put-mapping': 'put-mapping',
  'indices-update-settings': 'update-settings',
  'indices-update-aliases': 'aliases-api',
  'indices-create': 'create-index',
  get: 'get-documents',
  update: 'update-document',
  'search-validate': 'validate',
  'search-multi-search': 'multi-search',
  'search-explain': 'explain',
  'search-terms-enum': 'terms-enum',
  'cluster-health': 'cluster-health',
  'cluster-state': 'cluster-state',
  'cluster-stats': 'cluster-stats',
  'cluster-update-settings': 'cluster-settings',
  'cluster-allocation-explain': 'cluster-allocation',
  'cluster-reroute': 'cluster-reroute',
  'cluster-nodes-info': 'nodes-info',
  'cluster-nodes-stats': 'nodes-stats',
  'cluster-nodes-hot-threads': 'nodes-hot-threads',
  'indices-templates-v1': 'templates',
  'indices-put-template': 'put-template',
  'indices-component-template': 'component-templates',
  'indices-analyze': 'analyze',
  'snapshot-get-repository': 'snapshot-repository',
  nodes: 'nodes-info',
  'sql-query': 'sql',
  'ppl-query': 'ppl',
  'ad-get-detector': 'get-detector',
  'alerting-get-monitor': 'get-monitor',
  'ism-get-policy': 'get-policy',
  'security-account': 'account',
  'security-get-user': 'get-user',
  'security-get-role': 'get-role',
  'knn-stats': 'stats',
  'knn-warmup': 'warmup',
  'async-search': 'asynchronous-search',
  'notifications-get-channel': 'get-channel',
  'ml-get-model': 'get-model',
  'ml-load-model': 'load-model',
  'ml-unload-model': 'unload-model',
  'ml-predict': 'predict',
};

export const transformDocPathForOpenSearch = (docPath: string): string => {
  const name = docPath.replace(/^operation-/, '');
  const parts = name.split('-');
  const categoryKey = parts[0];

  let category = OPENSEARCH_API_CATEGORIES[categoryKey] || `${categoryKey}-apis`;

  const apiName = OPENSEARCH_API_NAME_FIXES[name] || name;

  if (name === 'indices-update-aliases') {
    category = 'alias';
  }

  return `api-reference/${category}/${apiName}/`;
};
