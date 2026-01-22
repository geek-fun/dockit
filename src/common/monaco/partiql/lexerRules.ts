/* eslint-disable no-useless-escape */
import { partiqlKeywords } from './keywords';

export const partiql = {
  id: 'partiql',
  rules: {
    defaultToken: '',
    tokenPostfix: '.partiql',

    keywords: partiqlKeywords,

    typeKeywords: ['STRING', 'NUMBER', 'BINARY', 'BOOLEAN', 'LIST', 'MAP', 'SS', 'NS', 'BS'],

    operators: ['=', '<>', '!=', '<', '>', '<=', '>=', '+', '-', '*', '/', '||', '.', ','],

    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    digits: /\d+(_+\d+)*/,

    tokenizer: {
      root: [
        { include: '@whitespace' },

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

        [/(@digits)\.(@digits)?([eE][+-]?(@digits))?/, 'number.float'],
        [/(@digits)/, 'number'],

        [/[{}()\[\]]/, '@brackets'],
        [/[,.]/, 'delimiter'],
        [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],

        [/'([^'\\]|\\.)*$/, 'string.invalid'],
        [/'/, { token: 'string.quote', bracket: '@open', next: '@string' }],

        [/"/, { token: 'string.delimiter', bracket: '@open', next: '@doubleQuotedIdentifier' }],
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
        [/"/, { token: 'string.delimiter', bracket: '@close', next: '@pop' }],
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
