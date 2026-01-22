import { MarkerSeverity, editor } from 'monaco-editor';
import { ValidationError, ValidationResult } from '../type';
import {
  setValidationMarkers,
  clearValidationMarkers,
  createValidationHoverProvider,
} from '../monacoUtils';
import { partiql } from './lexerRules';

// =======================
// PartiQL Validation
// =======================

const PARTIQL_VALIDATION_OWNER = 'partiql-validation';

// PartiQL keywords for validation
const PARTIQL_STATEMENT_KEYWORDS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
const PARTIQL_CLAUSES = [
  'FROM',
  'WHERE',
  'SET',
  'VALUE',
  'VALUES',
  'INTO',
  'AND',
  'OR',
  'NOT',
  'LIKE',
  'BETWEEN',
  'IN',
  'IS',
  'NULL',
  'ORDER',
  'BY',
  'ASC',
  'DESC',
  'LIMIT',
  'OFFSET',
];

/**
 * Validate a single PartiQL statement
 */
const validatePartiqlStatement = (statement: string, startLine: number): ValidationError[] => {
  const errors: ValidationError[] = [];
  const trimmed = statement.trim();

  if (!trimmed) {
    return errors;
  }

  // Check for basic statement structure
  const upperStatement = trimmed.toUpperCase();
  const firstWord = upperStatement.split(/\s+/)[0];

  // Skip comments
  if (trimmed.startsWith('--') || trimmed.startsWith('//')) {
    return errors;
  }

  // Check if statement starts with a valid keyword
  if (!PARTIQL_STATEMENT_KEYWORDS.includes(firstWord)) {
    // Check if it might be a continuation of a multi-line statement
    const isClause = PARTIQL_CLAUSES.includes(firstWord);
    if (!isClause) {
      errors.push({
        message: `Statement must start with SELECT, INSERT, UPDATE, or DELETE`,
        startLineNumber: startLine,
        endLineNumber: startLine,
        startColumn: 1,
        endColumn: trimmed.length + 1,
        severity: MarkerSeverity.Error,
      });
    }
    return errors;
  }

  // SELECT validation
  if (firstWord === 'SELECT') {
    if (!upperStatement.includes('FROM')) {
      errors.push({
        message: 'SELECT statement requires FROM clause',
        startLineNumber: startLine,
        endLineNumber: startLine + statement.split('\n').length - 1,
        startColumn: 1,
        endColumn: statement.split('\n').pop()?.length ?? trimmed.length + 1,
        severity: MarkerSeverity.Error,
      });
    }
  }

  // INSERT validation
  if (firstWord === 'INSERT') {
    if (!upperStatement.includes('INTO')) {
      errors.push({
        message: 'INSERT statement requires INTO clause',
        startLineNumber: startLine,
        endLineNumber: startLine + statement.split('\n').length - 1,
        startColumn: 1,
        endColumn: statement.split('\n').pop()?.length ?? trimmed.length + 1,
        severity: MarkerSeverity.Error,
      });
    }
    if (!upperStatement.includes('VALUE') && !upperStatement.includes('VALUES')) {
      errors.push({
        message: 'INSERT statement requires VALUE clause',
        startLineNumber: startLine,
        endLineNumber: startLine + statement.split('\n').length - 1,
        startColumn: 1,
        endColumn: statement.split('\n').pop()?.length ?? trimmed.length + 1,
        severity: MarkerSeverity.Error,
      });
    }
  }

  // UPDATE validation
  if (firstWord === 'UPDATE') {
    if (!upperStatement.includes('SET')) {
      errors.push({
        message: 'UPDATE statement requires SET clause',
        startLineNumber: startLine,
        endLineNumber: startLine + statement.split('\n').length - 1,
        startColumn: 1,
        endColumn: statement.split('\n').pop()?.length ?? trimmed.length + 1,
        severity: MarkerSeverity.Error,
      });
    }
  }

  // DELETE validation
  if (firstWord === 'DELETE') {
    if (!upperStatement.includes('FROM')) {
      errors.push({
        message: 'DELETE statement requires FROM clause',
        startLineNumber: startLine,
        endLineNumber: startLine + statement.split('\n').length - 1,
        startColumn: 1,
        endColumn: statement.split('\n').pop()?.length ?? trimmed.length + 1,
        severity: MarkerSeverity.Error,
      });
    }
  }

  // Check for unclosed quotes
  const singleQuotes = (trimmed.match(/'/g) || []).length;
  const doubleQuotes = (trimmed.match(/"/g) || []).length;

  if (singleQuotes % 2 !== 0) {
    errors.push({
      message: 'Unclosed single quote',
      startLineNumber: startLine,
      endLineNumber: startLine + statement.split('\n').length - 1,
      startColumn: 1,
      endColumn: statement.split('\n').pop()?.length ?? trimmed.length + 1,
      severity: MarkerSeverity.Error,
    });
  }

  if (doubleQuotes % 2 !== 0) {
    errors.push({
      message: 'Unclosed double quote',
      startLineNumber: startLine,
      endLineNumber: startLine + statement.split('\n').length - 1,
      startColumn: 1,
      endColumn: statement.split('\n').pop()?.length ?? trimmed.length + 1,
      severity: MarkerSeverity.Error,
    });
  }

  // Check for unclosed parentheses
  const openParens = (trimmed.match(/\(/g) || []).length;
  const closeParens = (trimmed.match(/\)/g) || []).length;

  if (openParens !== closeParens) {
    errors.push({
      message: `Mismatched parentheses: ${openParens} open, ${closeParens} close`,
      startLineNumber: startLine,
      endLineNumber: startLine + statement.split('\n').length - 1,
      startColumn: 1,
      endColumn: statement.split('\n').pop()?.length ?? trimmed.length + 1,
      severity: MarkerSeverity.Error,
    });
  }

  // Check for unclosed braces (for JSON objects in INSERT VALUE)
  const openBraces = (trimmed.match(/{/g) || []).length;
  const closeBraces = (trimmed.match(/}/g) || []).length;

  if (openBraces !== closeBraces) {
    errors.push({
      message: `Mismatched braces: ${openBraces} open, ${closeBraces} close`,
      startLineNumber: startLine,
      endLineNumber: startLine + statement.split('\n').length - 1,
      startColumn: 1,
      endColumn: statement.split('\n').pop()?.length ?? trimmed.length + 1,
      severity: MarkerSeverity.Error,
    });
  }

  // Check for unclosed brackets
  const openBrackets = (trimmed.match(/\[/g) || []).length;
  const closeBrackets = (trimmed.match(/\]/g) || []).length;

  if (openBrackets !== closeBrackets) {
    errors.push({
      message: `Mismatched brackets: ${openBrackets} open, ${closeBrackets} close`,
      startLineNumber: startLine,
      endLineNumber: startLine + statement.split('\n').length - 1,
      startColumn: 1,
      endColumn: statement.split('\n').pop()?.length ?? trimmed.length + 1,
      severity: MarkerSeverity.Error,
    });
  }

  return errors;
};

/**
 * Validate PartiQL content
 */
export const validatePartiql = (content: string): ValidationResult => {
  const errors: ValidationError[] = [];
  const lines = content.split('\n');

  let currentStatement = '';
  let statementStartLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const lineNumber = i + 1;

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('--') || trimmedLine.startsWith('//')) {
      // If we have accumulated a statement, validate it
      if (currentStatement.trim()) {
        errors.push(...validatePartiqlStatement(currentStatement, statementStartLine));
        currentStatement = '';
      }
      continue;
    }

    // Check if this line starts a new statement
    const upperLine = trimmedLine.toUpperCase();
    const startsNewStatement = PARTIQL_STATEMENT_KEYWORDS.some(
      keyword => upperLine.startsWith(keyword + ' ') || upperLine === keyword,
    );

    if (startsNewStatement && currentStatement.trim()) {
      // Validate the previous statement
      errors.push(...validatePartiqlStatement(currentStatement, statementStartLine));
      currentStatement = '';
      statementStartLine = lineNumber;
    }

    if (!currentStatement.trim()) {
      statementStartLine = lineNumber;
    }

    // Append the line to current statement
    currentStatement += (currentStatement ? '\n' : '') + line;

    // Check if statement ends with semicolon
    if (trimmedLine.endsWith(';')) {
      // Remove the semicolon and validate
      const statementWithoutSemi = currentStatement.replace(/;[\s]*$/, '');
      errors.push(...validatePartiqlStatement(statementWithoutSemi, statementStartLine));
      currentStatement = '';
    }
  }

  // Validate any remaining statement
  if (currentStatement.trim()) {
    errors.push(...validatePartiqlStatement(currentStatement, statementStartLine));
  }

  return { errors };
};

/**
 * Validate PartiQL model and set markers
 */
export const validatePartiqlModel = (model: editor.ITextModel): ValidationResult => {
  const content = model.getValue();
  const result = validatePartiql(content);
  setValidationMarkers(model, result.errors, PARTIQL_VALIDATION_OWNER);
  return result;
};

/**
 * Clear PartiQL validation markers
 */
export const clearPartiqlValidation = (model: editor.ITextModel): void => {
  clearValidationMarkers(model, PARTIQL_VALIDATION_OWNER);
};

/**
 * Register hover provider for PartiQL
 */
export const registerValidationHoverProvider = (monaco: typeof import('monaco-editor')): void => {
  monaco.languages.registerHoverProvider(partiql.id, createValidationHoverProvider());
};

/**
 * Validation owner constant
 */
export const PARTIQL_VALIDATION_OWNER_CONST = PARTIQL_VALIDATION_OWNER;

// Re-export common utilities
export { createDebouncedValidator } from '../monacoUtils';
export type { ValidationError, ValidationResult } from '../type';
