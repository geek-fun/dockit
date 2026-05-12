import { MarkerSeverity, editor } from 'monaco-editor';
import { ValidationError } from '../type';
import { setValidationMarkers, clearValidationMarkers } from '../monacoUtils';

export const MONGO_VALIDATION_OWNER_CONST = 'mongodb-validation';
const MONGO_VALIDATION_OWNER = 'mongodb-validation';

export const validateBalancedBrackets = (content: string, startLine: number): ValidationError[] => {
  const errors: ValidationError[] = [];
  const stack: Array<{ char: string; line: number; col: number }> = [];
  const lines = content.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let inString = false;
    let stringChar = '';
    let escaped = false;

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
    const line = lines[lineIdx].trim();
    if (!line || line.startsWith('//') || line.startsWith('/*')) continue;

    const methodChainMatch = line.match(/\.(\w+)\s*\(/g);
    if (methodChainMatch) {
      methodChainMatch.forEach(match => {
        const method = match.slice(1, -1).trim();
        const isKnown = [
          'find',
          'findOne',
          'insertOne',
          'insertMany',
          'updateOne',
          'updateMany',
          'deleteOne',
          'deleteMany',
          'count',
          'countDocuments',
          'distinct',
          'aggregate',
          'sort',
          'limit',
          'skip',
          'toArray',
          'forEach',
          'createIndex',
          'drop',
          'stats',
          'explain',
          'hint',
          'batchSize',
        ].includes(method);

        if (!isKnown && !method.startsWith('_')) {
          errors.push({
            message: `Unknown method '${method}'`,
            startLineNumber: startLine + lineIdx,
            endLineNumber: startLine + lineIdx,
            startColumn: line.indexOf(method) + 1,
            endColumn: line.indexOf(method) + method.length + 1,
            severity: MarkerSeverity.Warning,
          });
        }
      });
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

export const validateMongoModel = (model: editor.ITextModel): void => {
  const content = model.getValue();
  const errors: ValidationError[] = [
    ...validateBalancedBrackets(content, 1),
    ...validateMongoSyntax(content, 1),
    ...validateMethodChains(content, 1),
  ];

  setValidationMarkers(model, errors, MONGO_VALIDATION_OWNER);
};

export const clearMongoValidation = (model: editor.ITextModel): void => {
  clearValidationMarkers(model, MONGO_VALIDATION_OWNER);
};
