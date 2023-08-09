<template>
  <div id="editor" ref="editor"></div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import * as monaco from 'monaco-editor';

/**
 * refer https://github.com/wobsoriano/codeplayground
 * https://github.com/wobsoriano/codeplayground/blob/master/src/components/MonacoEditor.vue
 */
monaco.languages.register({ id: 'search' });
monaco.languages.setMonarchTokensProvider('search', {
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

  operators: [
    '<=',
    '>=',
    '==',
    '!=',
    '===',
    '!==',
    '=>',
    '+',
    '-',
    '**',
    '*',
    '/',
    '%',
    '++',
    '--',
    '<<',
    '</',
    '>>',
    '>>>',
    '&',
    '|',
    '^',
    '!',
    '~',
    '&&',
    '||',
    '?',
    ':',
    '=',
    '+=',
    '-=',
    '*=',
    '**=',
    '/=',
    '%=',
    '<<=',
    '>>=',
    '>>>=',
    '&=',
    '|=',
    '^=',
    '@',
  ],

  // we include these common regular expressions
  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
  digits: /\d+(_+\d+)*/,
  octaldigits: /[0-7]+(_+[0-7]+)*/,
  binarydigits: /[0-1]+(_+[0-1]+)*/,
  hexdigits: /[[0-9a-fA-F]+(_+[0-9a-fA-F]+)*/,

  regexpctl: /[(){}\[\]\$\^|\-*+?\.]/,
  regexpesc: /\\(?:[bBdDfnrstvwWn0\\\/]|@regexpctl|c[A-Z]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4})/,

  // The main tokenizer for our languages
  tokenizer: {
    root: [[/[{}]/, 'delimiter.bracket'], { include: 'common' }],

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
      [/[A-Z][\w\$]*/, 'type.identifier'], // to show class names nicely
      // [/[A-Z][\w\$]*/, 'identifier'],

      // whitespace
      { include: '@whitespace' },

      // regular expression: ensure it is terminated before beginning (otherwise it is an opeator)
      [
        /\/(?=([^\\\/]|\\.)+\/([gimsuy]*)(\s*)(\.|;|\/|,|\)|\]|\}|$))/,
        { token: 'regexp', bracket: '@open', next: '@regexp' },
      ],

      // delimiters and operators
      [/[()\[\]]/, '@brackets'],
      [/[<>](?!@symbols)/, '@brackets'],
      [
        /@symbols/,
        {
          cases: {
            '@operators': 'delimiter',
            '@default': '',
          },
        },
      ],

      // numbers
      [/(@digits)[eE]([\-+]?(@digits))?/, 'number.float'],
      [/(@digits)\.(@digits)([eE][\-+]?(@digits))?/, 'number.float'],
      [/0[xX](@hexdigits)/, 'number.hex'],
      [/0[oO]?(@octaldigits)/, 'number.octal'],
      [/0[bB](@binarydigits)/, 'number.binary'],
      [/(@digits)/, 'number'],

      // delimiter: after number because of .\d floats
      [/[;,.]/, 'delimiter'],

      // strings
      [/"([^"\\]|\\.)*$/, 'string.invalid'], // non-teminated string
      [/'([^'\\]|\\.)*$/, 'string.invalid'], // non-teminated string
      [/"/, 'string', '@string_double'],
      [/'/, 'string', '@string_single'],
      [/`/, 'string', '@string_backtick'],
    ],

    whitespace: [
      [/[ \t\r\n]+/, ''],
      [/\/\*\*(?!\/)/, 'comment.doc', '@jsdoc'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment'],
    ],

    comment: [
      [/[^\/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[\/*]/, 'comment'],
    ],

    jsdoc: [
      [/[^\/*]+/, 'comment.doc'],
      [/\*\//, 'comment.doc', '@pop'],
      [/[\/*]/, 'comment.doc'],
    ],

    // We match regular expression quite precisely
    regexp: [
      [
        /(\{)(\d+(?:,\d*)?)(\})/,
        ['regexp.escape.control', 'regexp.escape.control', 'regexp.escape.control'],
      ],
      [
        /(\[)(\^?)(?=(?:[^\]\\\/]|\\.)+)/,
        ['regexp.escape.control', { token: 'regexp.escape.control', next: '@regexrange' }],
      ],
      [/(\()(\?:|\?=|\?!)/, ['regexp.escape.control', 'regexp.escape.control']],
      [/[()]/, 'regexp.escape.control'],
      [/@regexpctl/, 'regexp.escape.control'],
      [/[^\\\/]/, 'regexp'],
      [/@regexpesc/, 'regexp.escape'],
      [/\\\./, 'regexp.invalid'],
      [/(\/)([gimsuy]*)/, [{ token: 'regexp', bracket: '@close', next: '@pop' }, 'keyword.other']],
    ],

    regexrange: [
      [/-/, 'regexp.escape.control'],
      [/\^/, 'regexp.invalid'],
      [/@regexpesc/, 'regexp.escape'],
      [/[^\]]/, 'regexp'],
      [/\]/, { token: 'regexp.escape.control', next: '@pop', bracket: '@close' }],
    ],

    string_double: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, 'string', '@pop'],
    ],

    string_single: [
      [/[^\\']+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/'/, 'string', '@pop'],
    ],

    string_backtick: [
      [/\$\{/, { token: 'delimiter.bracket', next: '@bracketCounting' }],
      [/[^\\`$]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/`/, 'string', '@pop'],
    ],

    bracketCounting: [
      [/\{/, 'delimiter.bracket', '@bracketCounting'],
      [/\}/, 'delimiter.bracket', '@pop'],
      { include: 'common' },
    ],
  },
});
const editor = ref();

onMounted(() => {
  monaco.editor.create(editor.value, {
    value: `// Type source code in your language here...
GET students/_search
{
  "query": {
    "bool": {
      "filter": [
        { "term":  { "honors": true }},
        { "range": { "graduation_year": { "gte": 2020, "lte": 2022 }}}
      ]
    }
  }
}
`,
    language: 'search',
  });
});
</script>

<style scoped>
#editor {
  width: 100vw;
  height: 100vh;
}
</style>
