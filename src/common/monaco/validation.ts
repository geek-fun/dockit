/**
 * Monaco editor syntax validation module
 * Provides real-time syntax validation and error highlighting for PartiQL and ES editors
 */
import * as monaco from 'monaco-editor';
import { partiql } from './partiql/lexerRules';
import { search, executeActions } from './searchdsl/lexerRules';
import { jsonify } from '../jsonify';

/**
 * Validation error with position and message
 */
export type ValidationError = {
  message: string;
  startLineNumber: number;
  endLineNumber: number;
  startColumn: number;
  endColumn: number;
  severity: monaco.MarkerSeverity;
};

/**
 * Validation result containing errors
 */
export type ValidationResult = {
  errors: ValidationError[];
};

// Store for error markers per editor instance for hover provider
const errorMarkersStore = new Map<string, ValidationError[]>();

/**
 * Set model markers and store errors for hover provider
 */
export const setValidationMarkers = (
  model: monaco.editor.ITextModel,
  errors: ValidationError[],
  owner: string,
): void => {
  // Store errors for hover provider
  errorMarkersStore.set(model.uri.toString(), errors);
  
  // Create Monaco markers
  const markers: monaco.editor.IMarkerData[] = errors.map(error => ({
    severity: error.severity,
    message: error.message,
    startLineNumber: error.startLineNumber,
    startColumn: error.startColumn,
    endLineNumber: error.endLineNumber,
    endColumn: error.endColumn,
  }));
  
  monaco.editor.setModelMarkers(model, owner, markers);
};

/**
 * Get stored errors for a model URI
 */
export const getValidationErrors = (uri: string): ValidationError[] => {
  return errorMarkersStore.get(uri) || [];
};

/**
 * Clear validation markers for a model
 */
export const clearValidationMarkers = (
  model: monaco.editor.ITextModel,
  owner: string,
): void => {
  errorMarkersStore.delete(model.uri.toString());
  monaco.editor.setModelMarkers(model, owner, []);
};

// =======================
// PartiQL Validation
// =======================

const PARTIQL_VALIDATION_OWNER = 'partiql-validation';

// PartiQL keywords for validation
const PARTIQL_STATEMENT_KEYWORDS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
const PARTIQL_CLAUSES = ['FROM', 'WHERE', 'SET', 'VALUE', 'VALUES', 'INTO', 'AND', 'OR', 'NOT', 'LIKE', 'BETWEEN', 'IN', 'IS', 'NULL', 'ORDER', 'BY', 'ASC', 'DESC', 'LIMIT', 'OFFSET'];

/**
 * Validate a single PartiQL statement
 */
const validatePartiqlStatement = (
  statement: string,
  startLine: number,
): ValidationError[] => {
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
        severity: monaco.MarkerSeverity.Error,
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
        severity: monaco.MarkerSeverity.Error,
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
        severity: monaco.MarkerSeverity.Error,
      });
    }
    if (!upperStatement.includes('VALUE') && !upperStatement.includes('VALUES')) {
      errors.push({
        message: 'INSERT statement requires VALUE clause',
        startLineNumber: startLine,
        endLineNumber: startLine + statement.split('\n').length - 1,
        startColumn: 1,
        endColumn: statement.split('\n').pop()?.length ?? trimmed.length + 1,
        severity: monaco.MarkerSeverity.Error,
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
        severity: monaco.MarkerSeverity.Error,
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
        severity: monaco.MarkerSeverity.Error,
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
      severity: monaco.MarkerSeverity.Error,
    });
  }
  
  if (doubleQuotes % 2 !== 0) {
    errors.push({
      message: 'Unclosed double quote',
      startLineNumber: startLine,
      endLineNumber: startLine + statement.split('\n').length - 1,
      startColumn: 1,
      endColumn: statement.split('\n').pop()?.length ?? trimmed.length + 1,
      severity: monaco.MarkerSeverity.Error,
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
      severity: monaco.MarkerSeverity.Error,
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
      severity: monaco.MarkerSeverity.Error,
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
      severity: monaco.MarkerSeverity.Error,
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
    const startsNewStatement = PARTIQL_STATEMENT_KEYWORDS.some(keyword => 
      upperLine.startsWith(keyword + ' ') || upperLine === keyword
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
export const validatePartiqlModel = (model: monaco.editor.ITextModel): ValidationResult => {
  const content = model.getValue();
  const result = validatePartiql(content);
  setValidationMarkers(model, result.errors, PARTIQL_VALIDATION_OWNER);
  return result;
};

/**
 * Clear PartiQL validation markers
 */
export const clearPartiqlValidation = (model: monaco.editor.ITextModel): void => {
  clearValidationMarkers(model, PARTIQL_VALIDATION_OWNER);
};

// =======================
// ES/OpenSearch Validation
// =======================

const ES_VALIDATION_OWNER = 'es-validation';

// Valid HTTP methods for ES queries
const ES_VALID_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH', 'OPTIONS'];

/**
 * Find the position of a JSON error in the content
 */
const findJsonErrorPosition = (
  jsonContent: string,
  errorMessage: string,
  baseLineNumber: number,
): { line: number; column: number } => {
  // Try to extract position from error message (common format: "at position X")
  const positionMatch = errorMessage.match(/position\s+(\d+)/i);
  if (positionMatch) {
    const position = parseInt(positionMatch[1], 10);
    let currentPos = 0;
    let line = baseLineNumber;
    let column = 1;
    
    for (const char of jsonContent) {
      if (currentPos >= position) {
        break;
      }
      if (char === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
      currentPos++;
    }
    
    return { line, column };
  }
  
  // Try to extract line/column from error message
  const lineMatch = errorMessage.match(/line\s+(\d+)/i);
  const columnMatch = errorMessage.match(/column\s+(\d+)/i);
  
  if (lineMatch) {
    return {
      line: baseLineNumber + parseInt(lineMatch[1], 10) - 1,
      column: columnMatch ? parseInt(columnMatch[1], 10) : 1,
    };
  }
  
  return { line: baseLineNumber, column: 1 };
};

/**
 * Validate JSON body content
 */
const validateJsonBody = (
  jsonContent: string,
  startLineNumber: number,
): ValidationError[] => {
  const errors: ValidationError[] = [];
  const trimmed = jsonContent.trim();
  
  if (!trimmed) {
    return errors;
  }

  // Check for common JSON issues before parsing
  // Count braces and brackets
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;
  
  for (const char of trimmed) {
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;
    }
  }
  
  if (braceCount !== 0) {
    const lineCount = trimmed.split('\n').length;
    errors.push({
      message: `Mismatched braces: ${braceCount > 0 ? 'missing closing brace' : 'extra closing brace'}`,
      startLineNumber: startLineNumber,
      endLineNumber: startLineNumber + lineCount - 1,
      startColumn: 1,
      endColumn: trimmed.split('\n').pop()?.length ?? 1,
      severity: monaco.MarkerSeverity.Error,
    });
    return errors;
  }
  
  if (bracketCount !== 0) {
    const lineCount = trimmed.split('\n').length;
    errors.push({
      message: `Mismatched brackets: ${bracketCount > 0 ? 'missing closing bracket' : 'extra closing bracket'}`,
      startLineNumber: startLineNumber,
      endLineNumber: startLineNumber + lineCount - 1,
      startColumn: 1,
      endColumn: trimmed.split('\n').pop()?.length ?? 1,
      severity: monaco.MarkerSeverity.Error,
    });
    return errors;
  }

  // Try to parse JSON
  try {
    // First try standard JSON5 (which allows trailing commas, comments, etc.)
    jsonify.parse5(trimmed);
  } catch (parseError) {
    const error = parseError as Error;
    const errorPos = findJsonErrorPosition(trimmed, error.message, startLineNumber);
    
    errors.push({
      message: `JSON syntax error: ${error.message}`,
      startLineNumber: errorPos.line,
      endLineNumber: errorPos.line,
      startColumn: errorPos.column,
      endColumn: errorPos.column + 10,
      severity: monaco.MarkerSeverity.Error,
    });
  }
  
  return errors;
};

/**
 * Validate a single ES/OpenSearch action (method + path + body)
 */
const validateEsAction = (
  method: string,
  path: string,
  body: string,
  methodLineNumber: number,
  bodyStartLineNumber: number,
): ValidationError[] => {
  const errors: ValidationError[] = [];
  
  // Validate HTTP method
  const upperMethod = method.toUpperCase();
  if (!ES_VALID_METHODS.includes(upperMethod)) {
    errors.push({
      message: `Invalid HTTP method: ${method}. Expected one of: ${ES_VALID_METHODS.join(', ')}`,
      startLineNumber: methodLineNumber,
      endLineNumber: methodLineNumber,
      startColumn: 1,
      endColumn: method.length + 1,
      severity: monaco.MarkerSeverity.Error,
    });
  }
  
  // Validate path
  if (!path || !path.startsWith('/') && !path.startsWith('_')) {
    // Allow both /path and _path formats
    const pathCol = method.length + 1;
    errors.push({
      message: 'Path must start with "/" or "_"',
      startLineNumber: methodLineNumber,
      endLineNumber: methodLineNumber,
      startColumn: pathCol,
      endColumn: pathCol + (path?.length || 1),
      severity: monaco.MarkerSeverity.Warning,
    });
  }
  
  // Validate JSON body if present
  if (body && body.trim()) {
    errors.push(...validateJsonBody(body, bodyStartLineNumber));
  }
  
  return errors;
};

/**
 * Validate ES/OpenSearch content
 */
export const validateEs = (content: string): ValidationResult => {
  const errors: ValidationError[] = [];
  const lines = content.split('\n');
  
  let currentBody = '';
  let currentMethod = '';
  let currentPath = '';
  let methodLineNumber = 0;
  let bodyStartLineNumber = 0;
  let inBody = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    const lineNumber = i + 1;
    
    // Skip empty lines outside of body
    if (!trimmedLine && !inBody) {
      continue;
    }
    
    // Skip comments
    if (trimmedLine.startsWith('//') || trimmedLine.startsWith('#')) {
      continue;
    }
    
    // Check if this line is a new action (HTTP method)
    const actionMatch = executeActions.regexp.exec(trimmedLine);
    if (actionMatch) {
      // Validate previous action if any
      if (currentMethod) {
        errors.push(...validateEsAction(
          currentMethod,
          currentPath,
          currentBody,
          methodLineNumber,
          bodyStartLineNumber,
        ));
      }
      
      // Parse new action
      const parts = trimmedLine.split(/\s+/);
      currentMethod = parts[0];
      currentPath = parts.slice(1).join(' ');
      methodLineNumber = lineNumber;
      currentBody = '';
      bodyStartLineNumber = lineNumber + 1;
      inBody = false;
      continue;
    }
    
    // Check for body start
    if (trimmedLine.startsWith('{') || trimmedLine.startsWith('[')) {
      if (!inBody) {
        bodyStartLineNumber = lineNumber;
      }
      inBody = true;
      currentBody += (currentBody ? '\n' : '') + line;
      continue;
    }
    
    // Continue body
    if (inBody) {
      currentBody += '\n' + line;
      
      // Check if body ends
      if (trimmedLine.endsWith('}') || trimmedLine.endsWith(']')) {
        // Check if braces/brackets are balanced
        const openBraces = (currentBody.match(/{/g) || []).length;
        const closeBraces = (currentBody.match(/}/g) || []).length;
        const openBrackets = (currentBody.match(/\[/g) || []).length;
        const closeBrackets = (currentBody.match(/\]/g) || []).length;
        
        if (openBraces === closeBraces && openBrackets === closeBrackets) {
          inBody = false;
        }
      }
    }
  }
  
  // Validate the last action
  if (currentMethod) {
    errors.push(...validateEsAction(
      currentMethod,
      currentPath,
      currentBody,
      methodLineNumber,
      bodyStartLineNumber,
    ));
  }
  
  return { errors };
};

/**
 * Validate ES model and set markers
 */
export const validateEsModel = (model: monaco.editor.ITextModel): ValidationResult => {
  const content = model.getValue();
  const result = validateEs(content);
  setValidationMarkers(model, result.errors, ES_VALIDATION_OWNER);
  return result;
};

/**
 * Clear ES validation markers
 */
export const clearEsValidation = (model: monaco.editor.ITextModel): void => {
  clearValidationMarkers(model, ES_VALIDATION_OWNER);
};

// =======================
// Hover Providers
// =======================

/**
 * Create hover provider for validation errors
 */
export const createValidationHoverProvider = (_languageId: string): monaco.languages.HoverProvider => {
  return {
    provideHover: (model: monaco.editor.ITextModel, position: monaco.Position): monaco.languages.Hover | null => {
      const errors = getValidationErrors(model.uri.toString());
      
      // Find errors at this position
      const relevantErrors = errors.filter(error => 
        position.lineNumber >= error.startLineNumber &&
        position.lineNumber <= error.endLineNumber &&
        (position.lineNumber !== error.startLineNumber || position.column >= error.startColumn) &&
        (position.lineNumber !== error.endLineNumber || position.column <= error.endColumn)
      );
      
      if (relevantErrors.length === 0) {
        return null;
      }
      
      // Build hover content
      const contents: monaco.IMarkdownString[] = relevantErrors.map(error => ({
        value: `**Error:** ${error.message}`,
        isTrusted: true,
      }));
      
      return {
        contents,
        range: new monaco.Range(
          relevantErrors[0].startLineNumber,
          relevantErrors[0].startColumn,
          relevantErrors[0].endLineNumber,
          relevantErrors[0].endColumn,
        ),
      };
    },
  };
};

/**
 * Register hover providers for both languages
 */
export const registerValidationHoverProviders = (monacoInstance: typeof monaco): void => {
  // PartiQL hover provider
  monacoInstance.languages.registerHoverProvider(partiql.id, createValidationHoverProvider(partiql.id));
  
  // ES/OpenSearch hover provider
  monacoInstance.languages.registerHoverProvider(search.id, createValidationHoverProvider(search.id));
};

// =======================
// Debounced Validation
// =======================

/**
 * Create a debounced validation function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createDebouncedValidator = <T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 300,
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
};

/**
 * Validation owner constants exported for use in editors
 */
export const VALIDATION_OWNERS = {
  PARTIQL: PARTIQL_VALIDATION_OWNER,
  ES: ES_VALIDATION_OWNER,
} as const;
