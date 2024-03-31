type Range = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};
export type Decoration = {
  id: number;
  range: Range;
  options: { isWholeLine: boolean; linesDecorationsClassName: string };
};

export const executeActions = {
  regexp: /^(GET|DELETE|POST|PUT)\s\w+/,
  decorationClassName: 'action-execute-decoration',
};

export type SearchAction = {
  qdsl: string;
  actionPosition: Range;
  qdslPosition: Range;
  method: string;
  index: string;
  path: string;
};

export const searchTokensProvider = {
  // Set defaultToken to invalid to see what you do not tokenize yet
  defaultToken: 'invalid',
  tokenPostfix: '.search',

  // keywords of elasticsearch
  keywords: [
    'GET',
    'POST',
    'PUT',
    'DELETE',
    'HEAD',
    'OPTIONS',
    'PATCH',
    'TRACE',
    'index',
    'indices',
    'type',
    'types',
    'from',
    'size',
    'explain',
    'analyze',
    'default_operator',
    'df',
    'analyzer',
    'lenient',
    'lowercase_expanded_terms',
    'analyze_wildcard',
    'all_shards',
    'allow_no_indices',
    'expand_wildcards',
    'preference',
    'routing',
    'ignore_unavailable',
    'allow_no_indices',
    'ignore_throttled',
    'search_type',
    'batched_reduce_size',
    'ccs_minimize_roundtrips',
    'max_concurrent_shard_requests',
    'pre_filter_shard_size',
    'rest_total_hits_as_int',
    'scroll',
    'search_type',
    'typed_keys',
    'wait_for_active_shards',
    'wait_for_completion',
    'requests_per_second',
    'slices',
    'timeout',
    'terminate_after',
    'stats',
    'version',
    'version_type',
    'if_seq_no',
    'if_primary_term',
    'refresh',
    'routing',
    'parent',
    'preference',
    'realtime',
    'refresh',
    'retry_on_conflict',
    'timeout',
    'version',
    'version_type',
    'if_seq_no',
    'if_primary_term',
    'pipeline',
    'wait_for_active_shards',
    'wait_for_completion',
    'requests_per_second',
    'slices',
    'timeout',
    'terminate_after',
    'stats',
    'version',
    'version_type',
    'if_seq_no',
    'if_primary_term',
    'refresh',
    'routing',
    'parent',
    'preference',
    'realtime',
    'refresh',
    'retry_on_conflict',
    'timeout',
    'version',
    'version_type',
    'if_seq_no',
    'if_primary_term',
    'pipeline',
    'wait_for_active_shards',
    'wait_for_completion',
    'requests_per_second',
    'slices',
    'timeout',
    'terminate_after',
    'stats',
    'version',
    'version_type',
    '_search',
  ],

  typeKeywords: ['any', 'boolean', 'number', 'object', 'string', 'undefined'],

  // we include these common regular expressions
  symbols: /[=><!~?:&|+\-*\\^%]+/,
  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
  digits: /\d+(_+\d+)*/,
  octaldigits: /[0-7]+(_+[0-7]+)*/,
  binarydigits: /[0-1]+(_+[0-1]+)*/,
  hexdigits: /[[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,

  // The main tokenizer for our languages
  tokenizer: {
    root: [
      [executeActions.regexp, executeActions.decorationClassName],
      [/[{}]/, 'delimiter.bracket'],
      { include: 'common' },
    ],

    common: [
      // identifiers and keywords
      [
        /[a-z_$][\w$]*/,
        {
          cases: {
            '@typeKeywords': 'keyword',
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        },
      ],

      // whitespace
      { include: '@whitespace' },
      // json block
      { include: '@json' },
    ],

    json: [
      // JSON strings
      [/"(?:\\.|[^\\"])*"/, 'string'],

      // JSON numbers
      [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],

      // JSON booleans
      [/\b(?:true|false)\b/, 'keyword'],

      // JSON null
      [/\bnull\b/, 'keyword'],

      // JSON property names
      [/"(?:\\.|[^\\"])*"(?=\s*:)/, 'key'],

      // JSON punctuation
      [/[{}[\],:]/, 'delimiter'],

      // JSON whitespace
      { include: '@whitespace' },
    ],

    whitespace: [
      [/[ \t\r\n]+/, ''],
      [/\/\*\*(?!\/)/, 'comment.doc'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment'],
    ],

    comment: [
      [/[^/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],
  },
};

export const buildSearchToken = (lines: Array<{ lineNumber: number; lineContent: string }>) => {
  const commands = lines.filter(({ lineContent }) => executeActions.regexp.test(lineContent));

  return commands.map(({ lineContent, lineNumber }, index, commands) => {
    const rawCmd = lineContent.split(/[/\s]+/);
    const method = rawCmd[0]?.toUpperCase();
    const indexName = rawCmd[1]?.startsWith('_') ? undefined : rawCmd[1];
    const path = rawCmd.slice(indexName ? 2 : 1, rawCmd.length).join('/');
    const nexCommandLineNumber = commands[index + 1]?.lineNumber
      ? commands[index + 1]?.lineNumber - 1
      : lines.length;

    const endLineNumber =
      lines
        .slice(lineNumber, nexCommandLineNumber)
        .reverse()
        .find(({ lineContent }) => lineContent.trim().endsWith('}'))?.lineNumber || lineNumber;

    const qdsl = lines
      .slice(lineNumber, endLineNumber)
      .map(({ lineContent }) => lineContent)
      .join('');

    return {
      qdsl,
      method,
      index: indexName,
      path,
      actionPosition: {
        startLineNumber: lineNumber,
        endLineNumber: lineNumber,
        startColumn: 1,
        endColumn: lineContent.length,
      },
      qdslPosition: qdsl
        ? {
            startLineNumber: lineNumber + 1,
            startColumn: 1,
            endLineNumber,
            endColumn: lines[endLineNumber].lineContent.length,
          }
        : null,
    } as SearchAction;
  });
};

export const defaultCodeSnippet = `
// Cluster Health
GET _cluster/health

// Cluster State
GET _cluster/state

// Nodes Info
GET _nodes/info

// Create Index
PUT dockit_sample_index

// Delete Index
DELETE dockit_sample_index


// Get Mapping
GET dockit_sample_index/_mapping


// Put Mapping
PUT dockit_sample_index/_mapping
{
  "properties": {
    "name": {
      "type": "text"
    }
  }
}

// Aliases
POST _aliases
{
  "actions": [
    {
      "add": {
        "index": "dockit_sample_index",
        "alias": "dockit_sample_index_alias"
      }
    }
  ]
}

// Indexing Documents
POST dockit_sample_index/_doc/1
{
  "name": "Elasticsearch",
  "category": "Search Engine"
}

// Searching
POST dockit_sample_index/_search
{
  "query": {
    "match": {
      "name": "Elasticsearch"
    }
  }
}

// Count
POST dockit_sample_index/_count
{
  "query": {
    "term": {
      "category.keyword": "Search Engine"
    }
  }
}

// Get Document
GET dockit_sample_index/_doc/1

// Update Document
POST dockit_sample_index/_update/1
{
  "doc": {
    "category": "Search Engine"
  }
}

// Delete Document
DELETE dockit_sample_index/_doc/1


// Bulk API
POST _bulk
{"index": {"_index": "dockit_sample_index", "_id": "1"}}
{"name": "Document 1"}
{"delete": {"_index": "dockit_sample_index", "_id": "2"}}
`;
export enum ActionType {
  POST_INDEX = 'POST_INDEX',
  POST_SEARCH = 'POST_SEARCH',
  POST_COUNT = 'POST_COUNT',
  GET_SEARCH = 'GET_SEARCH',
  POST_UPDATE = 'POST_UPDATE',
  DELETE_DOC = 'DELETE_DOC',
  PUT_INDEX = 'PUT_INDEX',
  DELETE_INDEX = 'DELETE_INDEX',
  POST_BULK = 'POST_BULK',
  PUT_PUT_INDEX = 'PUT_PUT_INDEX',
  PUT_MAPPING = 'PUT_MAPPING',
  GET_MAPPING = 'GET_MAPPING',
  POST_ALIAS = 'POST_ALIAS',
  GET_HEALTH = 'GET_HEALTH',
  GET_STATE = 'GET_STATE',
  GET_INFO = 'GET_INFO',
  HEAD_INDEX = 'HEAD_INDEX',
  PUT_AUTO_FOLLOW = 'PUT_AUTO_FOLLOW',
  PUT_CCR_FOLLOW = 'PUT_CCR_FOLLOW',
  PUT_SLM_POLICY = 'PUT_SLM_POLICY',
  PUT_SECURITY_ROLE_MAPPING = 'PUT_SECURITY_ROLE_MAPPING',
  PUT_ROLLUP_JOB = 'PUT_ROLLUP_JOB',
  PUT_SECURITY_API_KEY = 'PUT_SECURITY_API_KEY',
  PUT_INGEST_PIPELINE = 'PUT_INGEST_PIPELINE',
  PUT_TRANSFORM = 'PUT_TRANSFORM',
  POST_ML_INFER = 'POST_ML_INFER',
  POST_MULTI_SEARCH = 'POST_MULTI_SEARCH',
  POST_OPEN_INDEX = 'POST_OPEN_INDEX',
  PUT_COMPONENT_TEMPLATE = 'PUT_COMPONENT_TEMPLATE',
  PUT_ENRICH_POLICY = 'PUT_ENRICH_POLICY',
  PUT_TEMPLATE = 'PUT_TEMPLATE',
}

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
export enum EngineType {
  ELASTICSEARCH = 'ELASTICSEARCH',
  OPENSEARCH = 'OPENSEARCH',
}

export const getActionApiDoc = (engine: EngineType, version: string, action: SearchAction) => {
  const { APIS } = getDocLinks(engine, version);
  const matchedAction = Object.entries(actionRegexMap).find(([, regex]: [ActionType, RegExp]) =>
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
