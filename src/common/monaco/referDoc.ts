import { ActionType, EngineType, SearchAction } from './';

export const defaultCodeSnippet = `
// Cluster Health
GET _cluster/health

// Cluster State
GET _cluster/stats
// Nodes Info
GET _nodes
// Nodes Info
GET _nodes/event-es-8-node

// Nodes Info
GET _nodes

// Create Index
PUT dockit_sample_index

// Delete Index
DELETE dockit_sample_index


// Get Mapping
GET dockit_sample_index/_mapping

GET dockit_sample_index/_search
{
  query: {
    // support comments
    match_all: {}
  }
}

// Put Mapping

PUT dockit_sample_index/_mapping
{
  properties: {
    name: {
      type: 'text',
    }
  }
}
// Aliases
POST _aliases
{
  actions: [
    {
      add: {
        index: 'dockit_sample_index',
        alias: 'dockit_sample_index_alias'
      }
    }
  ]
}

// Indexing Documents
POST dockit_sample_index/_doc/1
{
  name: 'Elasticsearch',
  category: 'Search Engine'
}

// Searching
POST dockit_sample_index/_search
{
  query: {
    match: {
      name: 'Elasticsearch'
    }
  }
}

// Count
POST dockit_sample_index/_count
{
  query: {
    term: {
      'category.keyword': 'Search Engine'
    }
  }
}

// Get Document
GET dockit_sample_index/_doc/1

// Update Document
POST dockit_sample_index/_update/1
{
  doc: {
    category: 'Search Engine'
  },
}

// Delete Document
DELETE dockit_sample_index/_doc/1

GET _cat/indices

// Bulk API
POST _bulk
{index:{_index:'dockit_sample_index',_id:'1'}}
{name:'Document 1'}
{delete:{_index:'dockit_sample_index',_id:'2'}}

`;

const actionRegexMap: { [key in ActionType]: RegExp } = {
  POST_INDEX: /POST \/_doc\/\d+/,
  POST_SEARCH: /POST \/_search/,
  POST_COUNT: /POST \/_count/,
  GET_SEARCH: /GET \/_doc\/\d+/,
  POST_UPDATE: /POST \/_update\/\d+/,
  DELETE_DOC: /DELETE \/_doc\/\d+/,
  PUT_INDEX: /PUT /,
  DELETE_INDEX: /DELETE /,
  POST_BULK: /POST \/_bulk/,
  PUT_PUT_INDEX: /PUT /,
  PUT_MAPPING: /PUT \/_mapping/,
  GET_MAPPING: /GET \/_mapping/,
  POST_ALIAS: /POST \/_aliases/,
  GET_HEALTH: /GET \/_cluster\/health/,
  GET_STATE: /GET \/_cluster\/state/,
  GET_INFO: /GET \/_nodes\/info/,
  HEAD_INDEX: /HEAD /,
  PUT_AUTO_FOLLOW: /PUT \/_ccr\/auto_follow\/\w+/,
  PUT_CCR_FOLLOW: /PUT \/_ccr\/follow/,
  PUT_SLM_POLICY: /PUT \/_slm\/policy\/\w+/,
  PUT_SECURITY_ROLE_MAPPING: /PUT \/_security\/role_mapping\/\w+/,
  PUT_ROLLUP_JOB: /PUT \/_rollup\/job\/\w+/,
  PUT_SECURITY_API_KEY: /PUT \/_security\/api_key/,
  PUT_INGEST_PIPELINE: /PUT \/_ingest\/pipeline\/\w+/,
  PUT_TRANSFORM: /PUT \/_transform\/\w+/,
  POST_ML_INFER: /POST \/_ml\/infer\/\w+/,
  POST_MULTI_SEARCH: /POST \/_msearch/,
  POST_OPEN_INDEX: /POST \/_open/,
  PUT_COMPONENT_TEMPLATE: /PUT \/_component_template\/\w+/,
  PUT_ENRICH_POLICY: /PUT \/_enrich\/policy\/\w+/,
  PUT_TEMPLATE: /PUT \/_template\/\w+/,
};

export const getActionApiDoc = (engine: EngineType, version: string, action: SearchAction) => {
  const { APIS } = getDocLinks(engine, version);
  const matchedAction = Object.entries(actionRegexMap).find(([, regex]) =>
    `${action.method} /${action.path}`.match(regex),
  );

  return matchedAction ? APIS[matchedAction[0] as ActionType] : undefined;
};

const getDocLinks = (engine: EngineType, version: string) => {
  const DOCS_LINK = `https://www.elastic.co/guide/en/elasticsearch/reference/${version}`;
  const linksMap: {
    [key in EngineType]: {
      APIS: {
        [key in ActionType]: string;
      };
    };
  } = {
    [EngineType.ELASTICSEARCH]: {
      APIS: {
        POST_INDEX: `${DOCS_LINK}/indices-create-index.html`,
        POST_SEARCH: `${DOCS_LINK}/search-search.html`,
        POST_COUNT: `${DOCS_LINK}/search-count.html`,
        GET_SEARCH: `${DOCS_LINK}/docs-get.html`,
        POST_UPDATE: `${DOCS_LINK}/docs-update.html`,
        DELETE_DOC: `${DOCS_LINK}/docs-delete.html`,
        PUT_INDEX: `${DOCS_LINK}/indices-create-index.html`,
        DELETE_INDEX: `${DOCS_LINK}/indices-delete-index.html`,
        POST_BULK: `${DOCS_LINK}/docs-bulk.html`,
        PUT_PUT_INDEX: `${DOCS_LINK}/indices-create-index.html`,
        PUT_MAPPING: `${DOCS_LINK}/indices-put-mapping.html`,
        GET_MAPPING: `${DOCS_LINK}/indices-get-mapping.html`,
        POST_ALIAS: `${DOCS_LINK}/indices-aliases.html`,
        GET_HEALTH: `${DOCS_LINK}/cluster-health.html`,
        GET_STATE: `${DOCS_LINK}/indices-stats.html`,
        GET_INFO: '',
        HEAD_INDEX: `${DOCS_LINK}/indices-exists.html`,
        PUT_AUTO_FOLLOW: `${DOCS_LINK}/ccr-put-auto-follow-pattern.html`,
        PUT_CCR_FOLLOW: `${DOCS_LINK}/ccr-put-follow.html`,
        PUT_SLM_POLICY: `${DOCS_LINK}/slm-api-put-policy.html`,
        PUT_SECURITY_ROLE_MAPPING: `${DOCS_LINK}/security-api-put-role-mapping.html`,
        PUT_ROLLUP_JOB: `${DOCS_LINK}/rollup-put-job.html#rollup-put-job-api-request-body`,
        PUT_SECURITY_API_KEY: `${DOCS_LINK}/security-api-create-api-key.html`,
        PUT_INGEST_PIPELINE: `${DOCS_LINK}/put-pipeline-api.html`,
        PUT_TRANSFORM: `${DOCS_LINK}/put-transform.html#put-transform-request-body`,
        POST_ML_INFER: `${DOCS_LINK}/infer-trained-model.html`,
        POST_MULTI_SEARCH: `${DOCS_LINK}/search-multi-search.html`,
        POST_OPEN_INDEX: `${DOCS_LINK}/indices-open-close.html`,
        PUT_COMPONENT_TEMPLATE: `${DOCS_LINK}/indices-component-template.html`,
        PUT_ENRICH_POLICY: `${DOCS_LINK}/put-enrich-policy-api.html`,
        PUT_TEMPLATE: `${DOCS_LINK}/indices-templates-v1.html`,
      },
    },
    // @TODO docs link for OpenSearch
    [EngineType.OPENSEARCH]: { APIS: {} } as { APIS: { [key in ActionType]: string } },
  };

  return linksMap[engine];
};
