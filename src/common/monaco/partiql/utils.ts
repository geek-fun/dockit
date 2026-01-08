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
  const statements: PartiqlStatement[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (line === '' || line.startsWith('--') || line.startsWith('//')) {
      i++;
      continue;
    }

    // Check if this line starts a statement
    if (isStatementStart(line)) {
      const startLine = i;
      let endLine = i;

      // Find the end of this statement
      for (let j = i; j < lines.length; j++) {
        const currentLine = lines[j].trim();

        // Statement ends with semicolon
        if (currentLine.endsWith(';')) {
          endLine = j;
          break;
        }

        // Empty line ends the statement (if not the start line)
        if (j > startLine && currentLine === '') {
          endLine = j - 1;
          break;
        }

        // Check if next line starts a new statement
        if (j > startLine && isStatementStart(currentLine)) {
          endLine = j - 1;
          // Move back to process this new statement
          break;
        }

        // If we're at the last line, this is the end
        if (j === lines.length - 1) {
          endLine = j;
          break;
        }
      }

      // Extract the statement text
      const statementLines = lines.slice(startLine, endLine + 1);
      const statement = statementLines.join('\n').trim().replace(/;$/, '');

      if (statement.length > 0) {
        statements.push({
          statement,
          position: {
            startLineNumber: startLine + 1, // Monaco uses 1-based line numbers
            endLineNumber: endLine + 1,
            startColumn: 1,
            endColumn: lines[endLine].length + 1,
          },
        });
      }

      i = endLine + 1;
    } else {
      i++;
    }
  }

  return statements;
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
