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

const DOC_BASE_URLS: Record<BackendType, Record<DocLanguage, string>> = {
  [BackendType.ELASTICSEARCH]: {
    en: 'https://www.elastic.co/guide/en/elasticsearch/reference',
    cn: 'https://www.elastic.co/guide/cn/elasticsearch/reference',
  },
  [BackendType.OPENSEARCH]: {
    en: 'https://opensearch.org/docs/latest',
    cn: 'https://opensearch.org/docs/latest',
  },
};

const normalizeVersion = (version: string): string => {
  if (!version || version === 'current') return 'current';
  const parts = version.split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return version;
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

  return `${baseUrl}/${normalizedVersion}/${endpoint.docPath}`;
};
