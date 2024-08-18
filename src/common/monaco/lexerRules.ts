export const executeActions = {
  regexp: /^(GET|DELETE|POST|PUT)\s\w+/,
  decorationClassName: 'action-execute-decoration',
};

export const keywords = [
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
  '_cat',
  '_count',
  '_mapping',
  '_cluster',
  '_nodes',
  '_aliases',
  '_doc',
  '_update',
  '_bulk',
];
export const search = {
  id: 'search',
  rules: {
    // Set defaultToken to invalid to see what you do not tokenize yet
    defaultToken: 'invalid',
    tokenPostfix: '.search',

    // keywords of elasticsearch
    keywords,

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
        [/^(GET|POST|PUT|DELETE)(\s+[a-zA-Z0-9_\/-?\-&,]*)/, ['operators', 'regexp']],
        {
          regex: '{',
          action: {
            token: 'paren.lparen',
            next: 'xjson',
          },
        },
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
        { include: '@xjson' },
      ],
      xjson: [
        [
          /("(?:[^"]*_)?script"|"inline"|"source")(\s*?)(:)(\s*?)(""")/,
          [
            'variable',
            'whitespace',
            'delimiter',
            'whitespace',
            {
              token: 'punctuation.start_triple_quote',
              nextEmbedded: 'painless',
              next: 'search_painless',
            },
          ],
        ],
        [
          /(:)(\s*?)(""")(sql)/,
          [
            'delimiter',
            'whitespace',
            'punctuation.start_triple_quote',
            {
              token: 'punctuation.start_triple_quote.lang_marker',
              nextEmbedded: 'opensearchql',
              next: 'search_sql',
            },
          ],
        ],
        [/{/, { token: 'paren.lparen', next: '@push' }],
        [/}/, { token: 'paren.rparen', next: '@pop' }],
        [/[[(]/, { token: 'paren.lparen' }],
        [/[\])]/, { token: 'paren.rparen' }],
        [/,/, { token: 'delimiter' }],
        [/:/, { token: 'delimiter' }],
        [/\s+/, { token: 'whitespace' }],
        [/["](?:(?:\\.)|(?:[^"\\]))*?["]\s*(?=:)/, { token: 'variable' }],
        [/"""/, { token: 'string_literal', next: 'string_literal' }],
        [/0[xX][0-9a-fA-F]+\b/, { token: 'constant.numeric' }],
        [/[+-]?\d+(?:(?:\.\d*)?(?:[eE][+-]?\d+)?)?\b/, { token: 'constant.numeric' }],
        [/(?:true|false)\b/, { token: 'constant.language.boolean' }],
        // strings
        [/"([^"\\]|\\.)*$/, 'string.invalid'], // non-teminated string
        [
          /"/,
          {
            token: 'string.quote',
            bracket: '@open',
            next: '@string',
          },
        ],
        [/['](?:(?:\\.)|(?:[^'\\]))*?[']/, { token: 'invalid' }],
        [/.+?/, { token: 'text' }],
        [/\/\/.*$/, { token: 'invalid' }],
      ],

      search_painless: [
        [
          /"""/,
          {
            token: 'punctuation.end_triple_quote',
            nextEmbedded: '@pop',
            next: '@pop',
          },
        ],
      ],

      search_sql: [
        [
          /"""/,
          {
            token: 'punctuation.end_triple_quote',
            nextEmbedded: '@pop',
            next: '@pop',
          },
        ],
      ],

      string: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],

      string_literal: [
        [/"""/, { token: 'punctuation.end_triple_quote', next: '@pop' }],
        [/./, { token: 'multi_string' }],
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
  },
  languageConfiguration: {
    brackets: [
      ['{', '}'],
      ['(', ')'],
      ['[', ']'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: `'`, close: `'` },
      { open: '"', close: '"' },
    ],
    surroundingPairs: [
      { open: '(', close: ')' },
      { open: `'`, close: `'` },
      { open: '"', close: '"' },
    ],
  },
};
