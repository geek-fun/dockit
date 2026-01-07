/**
 * PartiQL Language Definition for Monaco Editor
 * Provides syntax highlighting and language configuration for PartiQL queries
 */

import { partiqlKeywords } from './keywords';

export const partiql = {
  id: 'partiql',
  rules: {
    defaultToken: '',
    tokenPostfix: '.partiql',

    // PartiQL keywords (case-insensitive)
    keywords: partiqlKeywords,

    typeKeywords: ['STRING', 'NUMBER', 'BINARY', 'BOOLEAN', 'LIST', 'MAP', 'SS', 'NS', 'BS'],

    operators: ['=', '<>', '!=', '<', '>', '<=', '>=', '+', '-', '*', '/', '||', '.', ','],

    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    digits: /\d+(_+\d+)*/,

    // The main tokenizer
    tokenizer: {
      root: [
        // Whitespace
        { include: '@whitespace' },

        // Keywords and identifiers (case-insensitive matching)
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@typeKeywords': 'type',
              '@default': 'identifier',
            },
          },
        ],

        // Numbers
        [/(@digits)\.(@digits)?([eE][+-]?(@digits))?/, 'number.float'],
        [/(@digits)/, 'number'],

        // Delimiters and operators
        [/[{}()\[\]]/, '@brackets'],
        [/[,.]/, 'delimiter'],
        [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],

        // Strings
        [/'([^'\\]|\\.)*$/, 'string.invalid'], // non-terminated string
        [/'/, { token: 'string.quote', bracket: '@open', next: '@string' }],

        // Double-quoted identifiers
        [/"/, { token: 'string.delimeter', bracket: '@open', next: '@doubleQuotedIdentifier' }],
      ],

      string: [
        [/[^\\']+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/'/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
      ],

      doubleQuotedIdentifier: [
        [/[^\\"]+/, 'identifier'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, { token: 'string.delimeter', bracket: '@close', next: '@pop' }],
      ],

      whitespace: [
        [/[ \t\r\n]+/, 'white'],
        [/--.*$/, 'comment'],
      ],
    },
  },
  languageConfiguration: {
    comments: {
      lineComment: '--',
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: "'", close: "'", notIn: ['string'] },
      { open: '"', close: '"', notIn: ['string'] },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: "'", close: "'" },
      { open: '"', close: '"' },
    ],
  },
};
