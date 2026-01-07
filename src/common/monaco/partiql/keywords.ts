const dmlKeywords = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'FROM',
  'WHERE',
  'SET',
  'REMOVE',
  'INTO',
  'VALUE',
  'VALUES',
];

const clauseKeywords = [
  'AND',
  'OR',
  'NOT',
  'BETWEEN',
  'IN',
  'IS',
  'LIKE',
  'MISSING',
  'EXISTS',
  'AS',
  'BY',
  'ORDER',
  'ASC',
  'DESC',
  'LIMIT',
  'OFFSET',
  'NULL',
  'TRUE',
  'FALSE',
];

const functions = [
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'SIZE',
  'ATTRIBUTE_EXISTS',
  'ATTRIBUTE_NOT_EXISTS',
  'ATTRIBUTE_TYPE',
  'BEGINS_WITH',
  'CONTAINS',
];

const dynamoSpecific = [
  'RETURNING',
  'ALL_OLD',
  'ALL_NEW',
  'MODIFIED_OLD',
  'MODIFIED_NEW',
];

const dataTypes = ['STRING', 'NUMBER', 'BINARY', 'BOOLEAN', 'LIST', 'MAP', 'SS', 'NS', 'BS'];

export const partiqlKeywords = [
  ...dmlKeywords,
  ...clauseKeywords,
  ...functions,
  ...dynamoSpecific,
  ...dataTypes,
].map(k => k.toUpperCase());

export const partiqlKeywordCategories = {
  dml: dmlKeywords,
  clauses: clauseKeywords,
  functions,
  dynamoSpecific,
  dataTypes,
};

export const partiqlOperators = ['=', '<>', '!=', '<', '>', '<=', '>=', '+', '-', '*', '/', '||'];

export const partiqlBrackets = ['{', '}', '[', ']', '(', ')'];
