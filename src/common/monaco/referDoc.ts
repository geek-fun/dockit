import { EngineType, SearchAction } from './type';
import { apiSpecProvider } from './searchdsl/apiSpec';
import { BackendType, HttpMethod } from './searchdsl/types';
import { getDocLanguage } from '../../lang';

export const defaultCodeSnippet = '';

export const esSampleQueries = {
  clusterHealth: `GET _cluster/health`,
  clusterStats: `GET _cluster/stats`,
  catIndices: `GET _cat/indices`,
  nodesInfo: `GET _nodes`,
  search: `GET {index}/_search
{
  "query": {
    "match_all": {}
  }
}`,
  matchSearch: `POST {index}/_search
{
  "query": {
    "match": {
      "field_name": "search_text"
    }
  }
}`,
  createIndex: `PUT {index}`,
  deleteIndex: `DELETE {index}`,
  getMapping: `GET {index}/_mapping`,
  putMapping: `PUT {index}/_mapping
{
  "properties": {
    "field_name": {
      "type": "text"
    }
  }
}`,
  indexDocument: `POST {index}/_doc/1
{
  "field_name": "value"
}`,
  getDocument: `GET {index}/_doc/1`,
  updateDocument: `POST {index}/_update/1
{
  "doc": {
    "field_name": "new_value"
  }
}`,
  deleteDocument: `DELETE {index}/_doc/1`,
  bulkOperation: `POST _bulk
{ "index": { "_index": "dockit_sample_index", "_id": "1" } }
{ "name": "Document 1" }
{ "delete": { "_index": "dockit_sample_index", "_id": "2" } }`,
  count: `POST {index}/_count
{
  "query": {
    "match_all": {}
  }
}`,
};

type DocLanguage = 'en' | 'cn';

const ES_NEW_API_BASE = 'https://www.elastic.co/docs/api/doc/elasticsearch';
const DOC_BASE_URLS: Record<BackendType, Record<DocLanguage, string>> = {
  [BackendType.ELASTICSEARCH]: {
    en: ES_NEW_API_BASE,
    cn: ES_NEW_API_BASE,
  },
  [BackendType.OPENSEARCH]: {
    en: 'https://docs.opensearch.org/latest',
    cn: 'https://docs.opensearch.org/latest',
  },
};

const normalizeVersion = (version: string): string => {
  if (!version || version === 'current') return '';
  const parts = version.split('.');
  if (parts.length < 1) return '';
  const major = parseInt(parts[0], 10);
  if (major < 7) return 'v8';
  if (major === 7) return 'v8';
  if (major === 8) return 'v8';
  if (major >= 9) return 'v9';
  return 'v8';
};

export const getActionApiDoc = (
  engine: EngineType,
  version: string,
  action: SearchAction,
): string | undefined => {
  const backend =
    engine === EngineType.ELASTICSEARCH ? BackendType.ELASTICSEARCH : BackendType.OPENSEARCH;

  const endpoint = apiSpecProvider.findEndpoint(
    backend,
    action.path,
    action.method as HttpMethod,
    version,
  );

  if (!endpoint?.docPath) return undefined;

  const lang = getDocLanguage();
  const baseUrl = DOC_BASE_URLS[backend][lang];
  const normalizedVersion = normalizeVersion(version);

  if (backend === BackendType.OPENSEARCH) {
    const osPath = transformDocPathForOpenSearch(endpoint.docPath);
    return `${baseUrl}/${osPath}`;
  }

  const versionPath = normalizedVersion ? `/${normalizedVersion}` : '';
  return `${baseUrl}${versionPath}/operation/${endpoint.docPath}`;
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
};

const transformDocPathForOpenSearch = (docPath: string): string => {
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
