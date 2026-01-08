export type PartiqlDynamicOptions = {
  tableNames?: string[];
  attributeKeys?: string[];
  activeTable?: string;
};

let dynamicOptions: PartiqlDynamicOptions = {};

export const setPartiqlDynamicOptions = (options: PartiqlDynamicOptions): void => {
  dynamicOptions = options;
};

export const getPartiqlDynamicOptions = (): PartiqlDynamicOptions => {
  return dynamicOptions;
};

export const partiqlSampleQueries = {
  selectWithPartitionKey: `SELECT * FROM "tablename" WHERE pk = 'value'`,
  selectWithSortKey: `SELECT * FROM "tablename" WHERE pk = 'value' AND sk > 100`,
  scanAll: `SELECT * FROM "tablename"`,
  insertItem: `INSERT INTO "tablename" VALUE {'pk': 'value', 'sk': 123, 'data': 'example'}`,
  updateItem: `UPDATE "tablename" SET data = 'new value' WHERE pk = 'value' AND sk = 123`,
  deleteItem: `DELETE FROM "tablename" WHERE pk = 'value' AND sk = 123`,
};

/**
 * Represents a PartiQL statement with its position in the editor
 */
export type PartiqlStatement = {
  statement: string;
  position: {
    startLineNumber: number;
    endLineNumber: number;
    startColumn: number;
    endColumn: number;
  };
};

/**
 * Regex pattern to detect PartiQL statement starts
 * Matches SELECT, INSERT, UPDATE, DELETE at the start of a line (case insensitive)
 */
const PARTIQL_STATEMENT_START_REGEX = /^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i;

/**
 * Check if a line starts a PartiQL statement
 */
export const isStatementStart = (line: string): boolean => {
  return PARTIQL_STATEMENT_START_REGEX.test(line);
};

/**
 * Parse all PartiQL statements from the editor content
 * Detects statement boundaries using semicolons or empty lines
 */
export const parsePartiqlStatements = (content: string): PartiqlStatement[] => {
  const lines = content.split('\n');
  
  type ParseState = {
    statements: PartiqlStatement[];
    currentIndex: number;
  };
  
  const findStatementEnd = (startLine: number): number => {
    const subsequentLines = lines.slice(startLine);
    const endOffset = subsequentLines.findIndex((line, idx) => {
      if (idx === 0) return false;
      const trimmed = line.trim();
      return (
        lines[startLine + idx - 1].trim().endsWith(';') ||
        trimmed === '' ||
        isStatementStart(trimmed)
      );
    });
    
    // Check if last line ends with semicolon
    const lastLineWithSemicolon = subsequentLines.findIndex(line => line.trim().endsWith(';'));
    if (lastLineWithSemicolon !== -1 && (endOffset === -1 || lastLineWithSemicolon < endOffset)) {
      return startLine + lastLineWithSemicolon;
    }
    
    return endOffset === -1 ? lines.length - 1 : startLine + endOffset - 1;
  };
  
  const parseFromIndex = (state: ParseState): ParseState => {
    if (state.currentIndex >= lines.length) {
      return state;
    }
    
    const line = lines[state.currentIndex].trim();
    
    // Skip empty lines and comments
    if (line === '' || line.startsWith('--') || line.startsWith('//')) {
      return parseFromIndex({ ...state, currentIndex: state.currentIndex + 1 });
    }
    
    // Check if this line starts a statement
    if (!isStatementStart(line)) {
      return parseFromIndex({ ...state, currentIndex: state.currentIndex + 1 });
    }
    
    const startLine = state.currentIndex;
    const endLine = findStatementEnd(startLine);
    const statementLines = lines.slice(startLine, endLine + 1);
    const statement = statementLines.join('\n').trim().replace(/;$/, '');
    
    if (statement.length === 0) {
      return parseFromIndex({ ...state, currentIndex: endLine + 1 });
    }
    
    const newStatement: PartiqlStatement = {
      statement,
      position: {
        startLineNumber: startLine + 1, // Monaco uses 1-based line numbers
        endLineNumber: endLine + 1,
        startColumn: 1,
        endColumn: lines[endLine].length + 1,
      },
    };
    
    return parseFromIndex({
      statements: [...state.statements, newStatement],
      currentIndex: endLine + 1,
    });
  };
  
  return parseFromIndex({ statements: [], currentIndex: 0 }).statements;
};

/**
 * Find the statement at a given line number
 */
export const getStatementAtLine = (
  statements: PartiqlStatement[],
  lineNumber: number,
): PartiqlStatement | undefined => {
  return statements.find(
    ({ position }) =>
      lineNumber >= position.startLineNumber && lineNumber <= position.endLineNumber,
  );
};

/**
 * Get gutter decorations for PartiQL statements
 * Similar to ES editor's getActionMarksDecorations
 */
export const partiqlExecutionGutterClass = 'partiql-execute-decoration';

export type PartiqlDecoration = {
  id: number;
  range: {
    startLineNumber: number;
    endLineNumber: number;
    startColumn: number;
    endColumn: number;
  };
  options: { isWholeLine: boolean; linesDecorationsClassName: string };
};

export const getPartiqlStatementDecorations = (
  statements: PartiqlStatement[],
): PartiqlDecoration[] => {
  return statements
    .map(({ position }) => ({
      id: position.startLineNumber,
      range: { ...position, endLineNumber: position.startLineNumber },
      options: { isWholeLine: true, linesDecorationsClassName: partiqlExecutionGutterClass },
    }))
    .sort((a, b) => a.id - b.id);
};
