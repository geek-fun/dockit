/**
 * PartiQL Keywords and Constants
 * Based on AWS PartiQL specification for DynamoDB
 * https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ql-reference.html
 */

// DML statements
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

// Clauses
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

// Aggregate and built-in functions
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

// DynamoDB specific
const dynamoSpecific = [
  'RETURNING',
  'ALL_OLD',
  'ALL_NEW',
  'MODIFIED_OLD',
  'MODIFIED_NEW',
];

// Data types
const dataTypes = ['STRING', 'NUMBER', 'BINARY', 'BOOLEAN', 'LIST', 'MAP', 'SS', 'NS', 'BS'];

export const partiqlKeywords = [
  ...dmlKeywords,
  ...clauseKeywords,
  ...functions,
  ...dynamoSpecific,
  ...dataTypes,
].map(k => k.toUpperCase());

// Export categories for structured autocompletion
export const partiqlKeywordCategories = {
  dml: dmlKeywords,
  clauses: clauseKeywords,
  functions,
  dynamoSpecific,
  dataTypes,
};

export const partiqlOperators = ['=', '<>', '!=', '<', '>', '<=', '>=', '+', '-', '*', '/', '||'];

export const partiqlBrackets = ['{', '}', '[', ']', '(', ')'];
