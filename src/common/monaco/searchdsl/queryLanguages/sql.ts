import { BackendType } from '../types';
import { QueryLanguageDef, BodyFieldDef } from './types';

// Common body fields shared by ES and OS SQL endpoints
const commonSqlBodyFields: BodyFieldDef[] = [
  {
    label: 'query',
    snippet: 'query: "${1:SELECT * FROM index}"',
    description: 'SQL query string',
    sortOrder: 1,
  },
  {
    label: 'fetch_size',
    snippet: 'fetch_size: ${1:1000}',
    description: 'Fetch size for pagination',
    sortOrder: 2,
  },
];

// ES SQL also supports format and filter in the body
const esSqlBodyFields: BodyFieldDef[] = [
  ...commonSqlBodyFields,
  {
    label: 'format',
    snippet: 'format: "${1|json,csv,tsv,txt,yaml|}"',
    description: 'Response format',
    sortOrder: 3,
  },
  {
    label: 'filter',
    snippet: 'filter: {\n\t$0\n}',
    description: 'Query DSL filter',
    sortOrder: 4,
  },
];

// OS SQL only supports query and fetch_size in the body; format is a URL param
const osSqlBodyFields: BodyFieldDef[] = [...commonSqlBodyFields];

export const sqlLanguage: QueryLanguageDef = {
  id: 'sql',
  endpointPaths: ['/_sql', '/_plugins/_sql'],
  backends: [BackendType.ELASTICSEARCH, BackendType.OPENSEARCH],
  queryFieldKey: 'query',

  bodyFields: (backend: BackendType) =>
    backend === BackendType.ELASTICSEARCH ? esSqlBodyFields : osSqlBodyFields,

  syntax: {
    commands: [
      { label: 'SELECT', insertText: 'SELECT $0', description: 'Select columns', sortOrder: 1 },
      { label: 'FROM', insertText: 'FROM $0', description: 'From table or index', sortOrder: 2 },
      { label: 'WHERE', insertText: 'WHERE $0', description: 'Filter condition', sortOrder: 3 },
      { label: 'GROUP BY', insertText: 'GROUP BY $0', description: 'Group results', sortOrder: 4 },
      { label: 'ORDER BY', insertText: 'ORDER BY $0', description: 'Sort results', sortOrder: 5 },
      { label: 'LIMIT', insertText: 'LIMIT $0', description: 'Limit number of rows', sortOrder: 6 },
      { label: 'OFFSET', insertText: 'OFFSET $0', description: 'Offset rows', sortOrder: 7 },
      { label: 'AS', insertText: 'AS $0', description: 'Alias', sortOrder: 8 },
      {
        label: 'DISTINCT',
        insertText: 'DISTINCT $0',
        description: 'Select distinct values',
        sortOrder: 9,
      },
      { label: 'JOIN', insertText: 'JOIN $0 ON $1', description: 'Join tables', sortOrder: 10 },
      {
        label: 'LEFT JOIN',
        insertText: 'LEFT JOIN $0 ON $1',
        description: 'Left outer join',
        sortOrder: 11,
      },
      {
        label: 'RIGHT JOIN',
        insertText: 'RIGHT JOIN $0 ON $1',
        description: 'Right outer join',
        sortOrder: 12,
      },
      {
        label: 'INNER JOIN',
        insertText: 'INNER JOIN $0 ON $1',
        description: 'Inner join',
        sortOrder: 13,
      },
      {
        label: 'OUTER JOIN',
        insertText: 'OUTER JOIN $0 ON $1',
        description: 'Full outer join',
        sortOrder: 14,
      },
      {
        label: 'NATURAL JOIN',
        insertText: 'NATURAL JOIN $0',
        description: 'Natural join',
        sortOrder: 15,
      },
      { label: 'ON', insertText: 'ON $0', description: 'Join condition', sortOrder: 16 },
      { label: 'UNION', insertText: 'UNION $0', description: 'Union queries', sortOrder: 17 },
      {
        label: 'HAVING',
        insertText: 'HAVING $0',
        description: 'Filter grouped results',
        sortOrder: 18,
      },
      { label: 'AND', insertText: 'AND $0', description: 'Logical AND', sortOrder: 19 },
      { label: 'OR', insertText: 'OR $0', description: 'Logical OR', sortOrder: 20 },
      { label: 'NOT', insertText: 'NOT $0', description: 'Logical NOT', sortOrder: 21 },
      { label: 'IN', insertText: 'IN ($0)', description: 'IN clause', sortOrder: 22 },
      {
        label: 'BETWEEN',
        insertText: 'BETWEEN $0 AND $1',
        description: 'Between range',
        sortOrder: 23,
      },
      { label: 'LIKE', insertText: 'LIKE $0', description: 'Pattern match', sortOrder: 24 },
      { label: 'IS NULL', insertText: 'IS NULL', description: 'NULL test', sortOrder: 25 },
      {
        label: 'IS NOT NULL',
        insertText: 'IS NOT NULL',
        description: 'Not NULL test',
        sortOrder: 26,
      },
      {
        label: 'CROSS JOIN',
        insertText: 'CROSS JOIN $0',
        description: 'Cross join',
        sortOrder: 27,
      },
      { label: 'DESC', insertText: 'DESC', description: 'Descending order', sortOrder: 28 },
      { label: 'ASC', insertText: 'ASC', description: 'Ascending order', sortOrder: 29 },
      { label: 'EXISTS', insertText: 'EXISTS ($0)', description: 'Exists subquery', sortOrder: 30 },
      {
        label: 'CASE',
        insertText: 'CASE WHEN $0 THEN $1 ELSE $2 END',
        description: 'Case expression',
        sortOrder: 31,
      },
      { label: 'WHEN', insertText: 'WHEN $0 THEN $1', description: 'Case when', sortOrder: 32 },
      { label: 'THEN', insertText: 'THEN $0', description: 'Then result', sortOrder: 33 },
      { label: 'ELSE', insertText: 'ELSE $0', description: 'Else result', sortOrder: 34 },
      { label: 'END', insertText: 'END', description: 'End case', sortOrder: 35 },
      {
        label: 'FULL OUTER JOIN',
        insertText: 'FULL OUTER JOIN $0 ON $1',
        description: 'Full outer join',
        sortOrder: 36,
      },
    ],

    functions: [
      { label: 'COUNT', insertText: 'COUNT($0)', description: 'Count rows' },
      { label: 'SUM', insertText: 'SUM($0)', description: 'Sum of values' },
      { label: 'AVG', insertText: 'AVG($0)', description: 'Average value' },
      { label: 'MIN', insertText: 'MIN($0)', description: 'Minimum value' },
      { label: 'MAX', insertText: 'MAX($0)', description: 'Maximum value' },
      { label: 'COALESCE', insertText: 'COALESCE($0)', description: 'First non-null value' },
      { label: 'CAST', insertText: 'CAST($0 AS $1)', description: 'Type cast' },
      {
        label: 'CURRENT_TIMESTAMP',
        insertText: 'CURRENT_TIMESTAMP',
        description: 'Current timestamp',
      },
      { label: 'NOW', insertText: 'NOW()', description: 'Current timestamp' },
      { label: 'SCORE', insertText: 'SCORE()', description: 'Relevance score' },
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
      'BETWEEN',
      'IS',
      'NULL',
    ],

    dataTypes: [
      'integer',
      'long',
      'short',
      'byte',
      'double',
      'float',
      'half_float',
      'text',
      'keyword',
      'date',
      'boolean',
      'ip',
      'binary',
      'geo_point',
    ],
  },

  monarchTokens: [
    [/--.*$/, { token: 'comment' }],
    [/\/\*[\s\S]*?\*\//, { token: 'comment' }],
    [/\d+(?:\.\d+)?/, { token: 'number' }],
    [/'(?:[^'\\]|\\.)*'/, { token: 'string' }],
    [/"(?:[^"\\]|\\.)*"/, { token: 'string' }],
    [/,/, { token: 'delimiter' }],
    [
      /\b(SELECT|FROM|WHERE|GROUP\s+BY|ORDER\s+BY|LIMIT|OFFSET|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|OUTER\s+JOIN|NATURAL\s+JOIN|FULL\s+OUTER\s+JOIN|CROSS\s+JOIN|ON|AS|DISTINCT|HAVING|UNION|AND|OR|NOT|IN|BETWEEN|LIKE|IS|NULL|EXISTS|CASE|WHEN|THEN|ELSE|END|DESC|ASC)\b/i,
      { token: 'keyword' },
    ],
    [/\b(COUNT|SUM|AVG|MIN|MAX|COALESCE|CAST|CURRENT_TIMESTAMP|NOW|SCORE)\b/i, { token: 'type' }],
    [/\b(true|false)\b/i, { token: 'constant.boolean' }],
  ],
};
