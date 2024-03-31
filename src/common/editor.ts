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

export type SearchToken = {
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
      .join('\n');

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
    } as SearchToken;
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
