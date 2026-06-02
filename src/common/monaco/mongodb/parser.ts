/**
 * MongoDB statement parser — extracts individual statements from editor content
 * for gutter decorations and per-statement execution.
 *
 * A MongoDB statement starts with `db.<collection>.<method>(` at the beginning of a line.
 * Statements are separated by blank lines or the start of a new statement.
 * This mirrors the pattern used by PartiQL (`parsePartiqlStatements`) and ES editor
 * (`buildSearchToken` / `getActionMarksDecorations`).
 */

/**
 * A single MongoDB statement with its position in the editor
 */
export type MongoStatement = {
  statement: string;
  position: {
    startLineNumber: number;
    endLineNumber: number;
    startColumn: number;
    endColumn: number;
  };
};

/**
 * Monaco decoration descriptor for rendering gutter play buttons
 */
export type MongoDecoration = {
  range: {
    startLineNumber: number;
    endLineNumber: number;
    startColumn: number;
    endColumn: number;
  };
  options: { isWholeLine: boolean; linesDecorationsClassName: string };
};

/**
 * CSS class name for the MongoDB gutter decoration (play button)
 */
export const mongoExecutionGutterClass = 'mongo-execute-decoration';

/**
 * Regex pattern to detect MongoDB statement starts.
 * Matches `db.<collection>.<method>(` at the start of a line.
 *
 * Uses `[\w-]` instead of `\w` because MongoDB collection names commonly
 * include hyphens (e.g., `test-new-aco`). `\w` does not match `-`.
 */
const MONGO_STATEMENT_START_REGEX = /^\s*db\.[\w-]+\.[\w-]+\s*\(/;

/**
 * Check if a line starts a MongoDB statement.
 */
export const isMongoStatementStart = (line: string): boolean => {
  return MONGO_STATEMENT_START_REGEX.test(line);
};

/**
 * Parse all MongoDB statements from the editor content.
 * Statements are delimited by the start of a new statement or blank lines.
 */
export const parseMongoStatements = (content: string): MongoStatement[] => {
  const lines = content.split('\n');

  const result: MongoStatement[] = [];
  let currentStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comment-only lines
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('#')) {
      continue;
    }

    if (isMongoStatementStart(line)) {
      if (currentStart !== -1) {
        // Close the previous statement
        result.push({
          statement: lines.slice(currentStart, i).join('\n'),
          position: {
            startLineNumber: currentStart + 1,
            endLineNumber: i,
            startColumn: 1,
            endColumn: lines[i - 1].length + 1,
          },
        });
      }
      currentStart = i;
    }
  }

  // Handle the last statement
  if (currentStart !== -1) {
    result.push({
      statement: lines.slice(currentStart).join('\n'),
      position: {
        startLineNumber: currentStart + 1,
        endLineNumber: lines.length,
        startColumn: 1,
        endColumn: lines[lines.length - 1].length + 1,
      },
    });
  }

  return result;
};

/**
 * Find the statement that contains a given line number
 */
export const getStatementAtLine = (
  statements: MongoStatement[],
  lineNumber: number,
): MongoStatement | undefined => {
  return statements.find(
    ({ position }) =>
      lineNumber >= position.startLineNumber && lineNumber <= position.endLineNumber,
  );
};

/**
 * Get Monaco gutter decorations for a list of statements.
 * Each decoration places a play button in the gutter on the statement's first line.
 */
export const getMongoStatementDecorations = (statements: MongoStatement[]): MongoDecoration[] => {
  return statements
    .map(({ position }) => ({
      range: {
        startLineNumber: position.startLineNumber,
        endLineNumber: position.startLineNumber,
        startColumn: 1,
        endColumn: 1,
      },
      options: { isWholeLine: true, linesDecorationsClassName: mongoExecutionGutterClass },
    }))
    .sort((a, b) => a.range.startLineNumber - b.range.startLineNumber);
};
