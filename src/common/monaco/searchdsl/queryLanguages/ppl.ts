import { BackendType } from '../types';
import { QueryLanguageDef } from './types';

export const pplLanguage: QueryLanguageDef = {
  id: 'ppl',
  endpointPaths: ['/_plugins/_ppl'],
  backends: [BackendType.OPENSEARCH],
  queryFieldKey: 'query',

  bodyFields: [
    {
      label: 'query',
      snippet: 'query: "${1:source=index | where field > 1}"',
      description: 'PPL query string',
      sortOrder: 1,
    },
    {
      label: 'filter',
      snippet: 'filter: {\n\t$0\n}',
      description: 'Query DSL filter',
      sortOrder: 2,
    },
    {
      label: 'fetch_size',
      snippet: 'fetch_size: ${1:1000}',
      description: 'Fetch size for pagination',
      sortOrder: 3,
    },
  ],

  syntax: {
    commands: [
      { label: 'source', insertText: 'source=$0', description: 'Source index', sortOrder: 1 },
      { label: 'where', insertText: 'where $0', description: 'Filter results', sortOrder: 2 },
      { label: 'fields', insertText: 'fields $0', description: 'Select fields', sortOrder: 3 },
      { label: 'stats', insertText: 'stats $0', description: 'Compute statistics', sortOrder: 4 },
      {
        label: 'rename',
        insertText: 'rename $1 as $0',
        description: 'Rename a field',
        sortOrder: 5,
      },
      { label: 'eval', insertText: 'eval $0', description: 'Evaluate expression', sortOrder: 6 },
      { label: 'sort', insertText: 'sort $0', description: 'Sort results', sortOrder: 7 },
      { label: 'head', insertText: 'head $0', description: 'Limit results', sortOrder: 8 },
      { label: 'dedup', insertText: 'dedup $0', description: 'Remove duplicates', sortOrder: 9 },
      { label: 'parse', insertText: 'parse $0', description: 'Parse field', sortOrder: 10 },
      { label: 'grok', insertText: 'grok $0', description: 'Pattern extraction', sortOrder: 11 },
      { label: 'top', insertText: 'top $0', description: 'Top N results', sortOrder: 12 },
      { label: 'rare', insertText: 'rare $0', description: 'Least common values', sortOrder: 13 },
      {
        label: 'trendline',
        insertText: 'trendline $0',
        description: 'Compute trend line',
        sortOrder: 14,
      },
      { label: 'ad', insertText: 'ad $0', description: 'Anomaly detection', sortOrder: 15 },
      { label: 'ml', insertText: 'ml $0', description: 'Machine learning', sortOrder: 16 },
      {
        label: 'kmeans',
        insertText: 'kmeans $0',
        description: 'K-means clustering',
        sortOrder: 17,
      },
    ],

    functions: [
      { label: 'COUNT', insertText: 'COUNT($0)', description: 'Count' },
      { label: 'SUM', insertText: 'SUM($0)', description: 'Sum' },
      { label: 'AVG', insertText: 'AVG($0)', description: 'Average' },
      { label: 'MIN', insertText: 'MIN($0)', description: 'Minimum' },
      { label: 'MAX', insertText: 'MAX($0)', description: 'Maximum' },
      { label: 'DISTINCT_COUNT', insertText: 'DISTINCT_COUNT($0)', description: 'Distinct count' },
      { label: 'PERCENTILE', insertText: 'PERCENTILE($0)', description: 'Percentile' },
      {
        label: 'STDDEV_SAMP',
        insertText: 'STDDEV_SAMP($0)',
        description: 'Sample standard deviation',
      },
      { label: 'VAR_SAMP', insertText: 'VAR_SAMP($0)', description: 'Sample variance' },
    ],

    operators: [
      '=',
      '!=',
      '<',
      '<=',
      '>',
      '>=',
      '+',
      '-',
      '*',
      '/',
      '%',
      'AND',
      'OR',
      'NOT',
      'IN',
      'LIKE',
      'REGEXP',
    ],

    dataTypes: [
      'integer',
      'long',
      'double',
      'float',
      'string',
      'keyword',
      'text',
      'date',
      'boolean',
      'ip',
      'geo_point',
    ],
  },

  monarchTokens: [
    [/\d+(?:\.\d+)?/, { token: 'number' }],
    [/'(?:[^'\\]|\\.)*'/, { token: 'string' }],
    [/"(?:[^"\\]|\\.)*"/, { token: 'string' }],
    [/\|/, { token: 'keyword' }],
    [/,/, { token: 'delimiter' }],
    [/=/, { token: 'delimiter' }],
    [
      /\b(source|where|fields|stats|rename|eval|sort|head|dedup|parse|grok|top|rare|trendline|ad|ml|kmeans|as|by|and|or|not|in|like|regexp)\b/i,
      { token: 'keyword' },
    ],
    [
      /\b(COUNT|SUM|AVG|MIN|MAX|DISTINCT_COUNT|PERCENTILE|STDDEV_SAMP|VAR_SAMP)\b/i,
      { token: 'type' },
    ],
    [/\b(true|false)\b/i, { token: 'constant.boolean' }],
  ],
};
