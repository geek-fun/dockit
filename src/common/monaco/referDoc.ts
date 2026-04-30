import { EngineType, SearchAction } from './type';
import { apiSpecProvider } from './searchdsl/apiSpec';
import { BackendType, HttpMethod } from './searchdsl/types';
import { getDocLanguage } from '../../lang';
import {
  DOC_BASE_URLS,
  ES_NEW_API_BASE,
  ES_OLD_GUIDE_BASE,
  findClosestAvailableVersion,
  shouldUseNewApiDocs,
  normalizeVersionForNewDocs,
  transformDocPathForMethod,
  transformOperationToGuidePage,
  transformDocPathForOpenSearch,
} from './docUrl';

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

export const getActionApiDoc = (
  engine: EngineType,
  version: string,
  action: SearchAction,
): string | undefined => {
  const backend =
    engine === EngineType.ELASTICSEARCH ? BackendType.ELASTICSEARCH : BackendType.OPENSEARCH;

  const fullPath = action.index ? `/${action.index}/${action.path}` : `/${action.path}`;

  const endpoint = apiSpecProvider.findEndpoint(
    backend,
    fullPath,
    action.method as HttpMethod,
    version,
  );

  if (!endpoint?.docPath) return undefined;

  const lang = getDocLanguage();

  if (backend === BackendType.OPENSEARCH) {
    const baseUrl = DOC_BASE_URLS[backend][lang];
    const osPath = transformDocPathForOpenSearch(endpoint.docPath);
    return `${baseUrl}/${osPath}`;
  }

  if (shouldUseNewApiDocs(version)) {
    const normalizedVersion = normalizeVersionForNewDocs(version);
    const versionPath = normalizedVersion ? `/${normalizedVersion}` : '';
    const newDocsOperation = transformDocPathForMethod(endpoint.docPath, action.method);
    return `${ES_NEW_API_BASE}${versionPath}/operation/${newDocsOperation}`;
  }

  const guideVersion = findClosestAvailableVersion(version);
  const oldGuideOperation = transformDocPathForMethod(endpoint.docPath, action.method);
  const guidePage = transformOperationToGuidePage(oldGuideOperation);
  return `${ES_OLD_GUIDE_BASE}/${guideVersion}/${guidePage}.html`;
};
