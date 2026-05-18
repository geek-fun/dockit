import {
  jsKeywords,
  mongoGlobalObjects,
  allCollectionMethods,
  aggregationStages,
  aggregationOperators,
  queryOperators,
  updateOperators,
  shellCommands,
  showSubcommands,
} from './keywords';

export const mongodb = {
  id: 'mongodb',
  rules: {
    defaultToken: '',
    tokenPostfix: '.mongodb',

    keywords: jsKeywords,
    mongoGlobals: mongoGlobalObjects,
    mongoMethods: allCollectionMethods,
    aggregationStages: aggregationStages,
    aggregationOperators: Array.from(
      new Set([...aggregationOperators, ...queryOperators, ...updateOperators]),
    ),
    shellCommands: shellCommands,
    showSubcommands: showSubcommands,

    operators: [
      '=',
      '>',
      '<',
      '!',
      '~',
      '?',
      ':',
      '==',
      '<=',
      '>=',
      '!=',
      '&&',
      '||',
      '++',
      '--',
      '+',
      '-',
      '*',
      '/',
      '&',
      '|',
      '^',
      '%',
      '<<',
      '>>',
      '>>>',
      '+=',
      '-=',
      '*=',
      '/=',
      '&=',
      '|=',
      '^=',
      '%=',
      '<<=',
      '>>=',
      '>>>=',
      '=>',
    ],

    symbols: /[=><!~?:&|+\-*/^%]+/,
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    digits: /\d+(_+\d+)*/,

    tokenizer: {
      root: [
        { include: '@whitespace' },
        { include: '@numbers' },
        { include: '@strings' },

        [/[{}()[\]]/, '@brackets'],
        [/[;,.]/, 'delimiter'],

        [
          /[a-zA-Z_$][\w$]*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@mongoGlobals': 'type.identifier',
              '@mongoMethods': 'entity.name.function',
              '@aggregationStages': 'constant.language',
              '@aggregationOperators': 'constant.language',
              '@shellCommands': 'keyword.control',
              '@default': 'identifier',
            },
          },
        ],

        [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
      ],

      whitespace: [
        [/[ \t\r\n]+/, 'white'],
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
      ],

      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/ *]/, 'comment'],
      ],

      numbers: [
        [/0[xX][0-9a-fA-F_]*[0-9a-fA-F]/, 'number.hex'],
        [/0[oO][0-7_]*[0-7]/, 'number.octal'],
        [/0[bB][01_]*[01]/, 'number.binary'],
        [/(@digits).(@digits)([eE][-+]?(@digits))?/, 'number.float'],
        [/(@digits)/, 'number'],
      ],

      strings: [
        [/R#"/, 'string', '@rawString'],
        [/'/, 'string', '@singleQuotedString'],
        [/"/, 'string', '@doubleQuotedString'],
        [/`/, 'string', '@backtickString'],
      ],

      rawString: [
        [/[^"#]+/, 'string'],
        [/""/, 'string.escape'],
        [/"#/, 'string', '@pop'],
        [/["#]/, 'string'],
      ],

      singleQuotedString: [
        [/[^\\']+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/'/, 'string', '@pop'],
      ],

      doubleQuotedString: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, 'string', '@pop'],
      ],

      backtickString: [
        [/[^\\`]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/`/, 'string', '@pop'],
      ],
    },
  },
  languageConfiguration: {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
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
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '"', close: '"', notIn: ['string'] },
      { open: '`', close: '`', notIn: ['string', 'comment'] },
      { open: '/*', close: '*/', notIn: ['comment'] },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: "'", close: "'" },
      { open: '"', close: '"' },
      { open: '`', close: '`' },
    ],
    folding: {
      markers: {
        start: /^\s*\/\/\s*#?region\b/,
        end: /^\s*\/\/\s*#?endregion\b/,
      },
    },
    indentationRules: {
      increaseIndentPattern: /({|\(|\[)\s*$/,
      decreaseIndentPattern: /^\s*(}|\)|\])/,
    },
  },
};
