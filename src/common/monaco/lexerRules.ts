import { keywords } from './keywords.ts';

export const executeActions = {
  regexp: /^(GET|DELETE|POST|PUT)\s+[a-zA-Z0-9_\/-?\-&,.]*/,
  decorationClassName: 'action-execute-decoration',
};

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
        [/^(GET|POST|PUT|DELETE)(\s+[a-zA-Z0-9_\/-?\-&,.]*)/, ['type', 'regexp']],
        {
          regex: '{',
          action: {
            token: 'paren.lparen',
            next: 'json5',
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
        { include: '@json5' },
      ],
      json5: [
        // @TODO add painless highlighting & tokenization support
        // [
        //   /["']?(.*_?script|inline|source)["']?(\s*?)(:)(\s*?)("""|''')/,
        //   [
        //     'variable',
        //     'whitespace',
        //     'delimiter',
        //     'whitespace',
        //     {
        //       token: 'punctuation.start_triple_quote',
        //       nextEmbedded: 'painless',
        //       next: 'search_painless',
        //     },
        //   ],
        // ],
        [
          /(:)(\s*?)("""|''')(sql)/,
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
        [/['](?:(?:\\.)|(?:[^'\\]))*?[']\s*(?=:)/, { token: 'variable' }],
        [/[^"'.\\/]*?\s*(?=:)/, { token: 'variable' }],
        [/"""|'''/, { token: 'string_literal', next: 'string_literal' }],
        [/0[xX][0-9a-fA-F]+\b/, { token: 'constant.numeric' }],
        [/[+-]?\d+(?:(?:\.\d*)?(?:[eE][+-]?\d+)?)?\b/, { token: 'constant.numeric' }],
        [/(?:true|false)\b/, { token: 'constant.boolean' }],
        // strings
        [/["']([^'"\\]|\\.)*$/, 'string.invalid'], // non-teminated string
        [
          /["']/,
          {
            token: 'string.quote',
            bracket: '@open',
            next: '@string',
          },
        ],
        { include: '@whitespace' },
        [/\/\/.*$/, { token: 'invalid' }],
      ],

      search_painless: [
        [
          /"""|'''/,
          {
            token: 'punctuation.end_triple_quote',
            nextEmbedded: '@pop',
            next: '@pop',
          },
        ],
      ],

      search_sql: [
        [
          /"""|'''/,
          {
            token: 'punctuation.end_triple_quote',
            nextEmbedded: '@pop',
            next: '@pop',
          },
        ],
      ],

      string: [
        [/[^\\"']+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/["']/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],

      string_literal: [
        [/"""|'''/, { token: 'punctuation.end_triple_quote', next: '@pop' }],
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
