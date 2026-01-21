import { MarkerSeverity, editor } from 'monaco-editor';
import { jsonify } from '../../jsonify';
import { ValidationError, ValidationResult } from '../type';
import {
  setValidationMarkers,
  clearValidationMarkers,
  createValidationHoverProvider,
} from '../monacoUtils';
import { executeActions, search } from './lexerRules';

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
const validateJsonBody = (jsonContent: string, startLineNumber: number): ValidationError[] => {
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
      severity: MarkerSeverity.Error,
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
      severity: MarkerSeverity.Error,
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
      severity: MarkerSeverity.Error,
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
      severity: MarkerSeverity.Error,
    });
  }

  // Validate path exists (leading "/" is optional in DocKit)
  if (!path || path.trim() === '') {
    const pathCol = method.length + 1;
    errors.push({
      message: 'Path is required',
      startLineNumber: methodLineNumber,
      endLineNumber: methodLineNumber,
      startColumn: pathCol,
      endColumn: pathCol + 1,
      severity: MarkerSeverity.Error,
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
    // We check this even if we're currently in a body, to handle cases where
    // the previous body has syntax errors (e.g., unclosed braces)
    const actionMatch = executeActions.regexp.exec(trimmedLine);
    if (actionMatch) {
      // Validate previous action if any (even if body was incomplete)
      if (currentMethod) {
        errors.push(
          ...validateEsAction(
            currentMethod,
            currentPath,
            currentBody,
            methodLineNumber,
            bodyStartLineNumber,
          ),
        );
      }

      // Parse new action and reset state
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
    errors.push(
      ...validateEsAction(
        currentMethod,
        currentPath,
        currentBody,
        methodLineNumber,
        bodyStartLineNumber,
      ),
    );
  }

  return { errors };
};

/**
 * Validate ES model and set markers
 */
export const validateEsModel = (model: editor.ITextModel): ValidationResult => {
  const content = model.getValue();
  const result = validateEs(content);
  setValidationMarkers(model, result.errors, ES_VALIDATION_OWNER);
  return result;
};

/**
 * Clear ES validation markers
 */
export const clearEsValidation = (model: editor.ITextModel): void => {
  clearValidationMarkers(model, ES_VALIDATION_OWNER);
};

/**
 * Register hover provider for ES/OpenSearch
 */
export const registerValidationHoverProvider = (monaco: typeof import('monaco-editor')): void => {
  monaco.languages.registerHoverProvider(search.id, createValidationHoverProvider());
};

/**
 * Validation owner constant
 */
export const ES_VALIDATION_OWNER_CONST = ES_VALIDATION_OWNER;

// Re-export common utilities
export { createDebouncedValidator } from '../monacoUtils';
export type { ValidationError, ValidationResult } from '../type';
