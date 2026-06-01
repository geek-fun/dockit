import { MarkerSeverity, editor } from 'monaco-editor';
import { ValidationError } from '../type';
import { setValidationMarkers, clearValidationMarkers } from '../monacoUtils';
import { allCollectionMethods } from './keywords';

const MONGO_VALIDATION_OWNER = 'mongodb-validation';

export const validateBalancedBrackets = (content: string, startLine: number): ValidationError[] => {
  const errors: ValidationError[] = [];
  const stack: Array<{ char: string; line: number; col: number }> = [];
  const lines = content.split('\n');

  // String state persists across lines to handle multi-line strings/template literals
  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    for (let colIdx = 0; colIdx < line.length; colIdx++) {
      const char = line[colIdx];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (!inString && (char === '"' || char === "'" || char === '`')) {
        inString = true;
        stringChar = char;
        continue;
      }

      if (inString && char === stringChar) {
        inString = false;
        continue;
      }

      if (inString) continue;

      if (char === '{' || char === '[' || char === '(') {
        stack.push({ char, line: startLine + lineIdx, col: colIdx + 1 });
      } else if (char === '}' || char === ']' || char === ')') {
        const expected = char === '}' ? '{' : char === ']' ? '[' : '(';
        const last = stack.pop();
        if (!last || last.char !== expected) {
          errors.push({
            message: `Unmatched '${char}'`,
            startLineNumber: startLine + lineIdx,
            endLineNumber: startLine + lineIdx,
            startColumn: colIdx + 1,
            endColumn: colIdx + 2,
            severity: MarkerSeverity.Error,
          });
        }
      }
    }
  }

  stack.forEach(({ char, line, col }) => {
    const closeChar = char === '{' ? '}' : char === '[' ? ']' : ')';
    errors.push({
      message: `Unclosed '${char}' - missing '${closeChar}'`,
      startLineNumber: line,
      endLineNumber: line,
      startColumn: col,
      endColumn: col + 1,
      severity: MarkerSeverity.Error,
    });
  });

  return errors;
};

export const validateMethodChains = (content: string, startLine: number): ValidationError[] => {
  const errors: ValidationError[] = [];
  const lines = content.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
    const trimOffset = rawLine.length - rawLine.trimStart().length;

    const methodPattern = /\.(\w+)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = methodPattern.exec(trimmed)) !== null) {
      const method = match[1];
      const isKnown = allCollectionMethods.includes(method);

      if (!isKnown && !method.startsWith('_')) {
        const col = trimOffset + match.index + 1 + 1; // trimOffset for indentation, +1 for dot, +1 for 1-based column
        errors.push({
          message: `Unknown method '${method}'`,
          startLineNumber: startLine + lineIdx,
          endLineNumber: startLine + lineIdx,
          startColumn: col,
          endColumn: col + method.length,
          severity: MarkerSeverity.Warning,
        });
      }
    }
  }

  return errors;
};

export const validateMongoSyntax = (content: string, startLine: number): ValidationError[] => {
  const errors: ValidationError[] = [];
  const lines = content.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].trim();
    if (!line || line.startsWith('//') || line.startsWith('/*')) continue;

    const unclosedSingleQuotes = (line.match(/(?<!\\)'/g) || []).length % 2 !== 0;
    const unclosedDoubleQuotes = (line.match(/(?<!\\)"/g) || []).length % 2 !== 0;

    if (unclosedSingleQuotes) {
      errors.push({
        message: 'Unclosed single quote',
        startLineNumber: startLine + lineIdx,
        endLineNumber: startLine + lineIdx,
        startColumn: 1,
        endColumn: lines[lineIdx].length + 1,
        severity: MarkerSeverity.Error,
      });
    }

    if (unclosedDoubleQuotes) {
      errors.push({
        message: 'Unclosed double quote',
        startLineNumber: startLine + lineIdx,
        endLineNumber: startLine + lineIdx,
        startColumn: 1,
        endColumn: lines[lineIdx].length + 1,
        severity: MarkerSeverity.Error,
      });
    }
  }

  return errors;
};

/**
 * Detect `_id` queried as a plain hex string that looks like an ObjectId.
 * MongoDB stores `_id` as ObjectId by default; querying with a plain string
 * will not match. Users should use `ObjectId("...")` instead.
 *
 * Flags patterns like: `"_id": "6a1d9088b00311683dad8c09"`
 * Does NOT flag: `"_id": ObjectId("...")`, `"_id": "short"`, or `$oid` usage.
 */
const OBJECTID_QUERY_REGEX = /(["'])_id\1\s*:\s*(["'])([0-9a-fA-F]{24})\2/g;

export const validateObjectIdQuery = (content: string, startLine: number): ValidationError[] => {
  const errors: ValidationError[] = [];
  const lines = content.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
    // Lines already using ObjectId() or Extended JSON $oid are valid
    if (trimmed.includes('ObjectId(') || trimmed.includes('$oid')) continue;

    OBJECTID_QUERY_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = OBJECTID_QUERY_REGEX.exec(line)) !== null) {
      const hexStr = match[3];
      const valueQuote = match[2];
      const quotedValue = `${valueQuote}${hexStr}${valueQuote}`;
      const valueOffsetInMatch = match[0].indexOf(quotedValue);
      // 1-based column of the value's opening quote
      const col = match.index + valueOffsetInMatch + 1;

      errors.push({
        message: `'_id' value "${hexStr}" looks like an ObjectId. Use ObjectId("${hexStr}") to query by ObjectId.`,
        startLineNumber: startLine + lineIdx,
        endLineNumber: startLine + lineIdx,
        startColumn: col,
        endColumn: col + quotedValue.length,
        severity: MarkerSeverity.Warning,
      });
    }
  }

  return errors;
};

export const validateMongoModel = (model: editor.ITextModel): void => {
  const content = model.getValue();
  const errors: ValidationError[] = [
    ...validateBalancedBrackets(content, 1),
    ...validateMethodChains(content, 1),
    ...validateMongoSyntax(content, 1),
    ...validateObjectIdQuery(content, 1),
  ];

  setValidationMarkers(model, errors, MONGO_VALIDATION_OWNER);
};

export const clearMongoValidation = (model: editor.ITextModel): void => {
  clearValidationMarkers(model, MONGO_VALIDATION_OWNER);
};
