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
      [/^(GET|DELETE|POST|PUT)\s\w+/, 'action-execute-decoration'],
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
