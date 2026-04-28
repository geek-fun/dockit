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
    return `${baseUrl}/${endpoint.docPath}`;
  }

  const versionPath = normalizedVersion ? `/${normalizedVersion}` : '';
  return `${baseUrl}${versionPath}/operation/${endpoint.docPath}`;
};
