import { partiqlKeywords } from './keywords';

// Keywords that should start on a new line (major clauses)
const NEW_LINE_KEYWORDS = [
  'FROM',
  'WHERE',
  'SET',
  'REMOVE',
  'ORDER BY',
  'LIMIT',
  'OFFSET',
  'INTO',
  'VALUE',
  'VALUES',
  'RETURNING',
];

// Statement-starting keywords
const STATEMENT_KEYWORDS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

// All keywords as a Set for quick lookup (uppercase)
const KEYWORD_SET = new Set(partiqlKeywords.map(k => k.toUpperCase()));

/**
 * Tokenize a PartiQL statement into segments, preserving quoted strings and identifiers.
 * Returns an array of tokens where each token is either:
 * - A quoted string/identifier (preserved as-is)
 * - A whitespace-separated word or operator
 */
const tokenize = (input: string): string[] => {
  const tokens: string[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // Skip whitespace, collapse into single space
    if (/\s/.test(ch)) {
      if (tokens.length > 0 && tokens[tokens.length - 1] !== ' ') {
        tokens.push(' ');
      }
      i++;
      continue;
    }

    // Single-quoted string literal
    if (ch === "'") {
      let str = "'";
      i++;
      while (i < input.length) {
        if (input[i] === '\\' && i + 1 < input.length) {
          str += input[i] + input[i + 1];
          i += 2;
        } else if (input[i] === "'") {
          str += "'";
          i++;
          break;
        } else {
          str += input[i];
          i++;
        }
      }
      tokens.push(str);
      continue;
    }

    // Double-quoted identifier
    if (ch === '"') {
      let str = '"';
      i++;
      while (i < input.length) {
        if (input[i] === '\\' && i + 1 < input.length) {
          str += input[i] + input[i + 1];
          i += 2;
        } else if (input[i] === '"') {
          str += '"';
          i++;
          break;
        } else {
          str += input[i];
          i++;
        }
      }
      tokens.push(str);
      continue;
    }

    // Line comments (-- ...)
    if (ch === '-' && i + 1 < input.length && input[i + 1] === '-') {
      let comment = '';
      while (i < input.length && input[i] !== '\n') {
        comment += input[i];
        i++;
      }
      tokens.push(comment);
      continue;
    }

    // Brackets and delimiters - push as individual tokens
    if ('{[()]}'.includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }

    // Comma and semicolon
    if (ch === ',' || ch === ';') {
      tokens.push(ch);
      i++;
      continue;
    }

    // Operators
    if ('<>=!|'.includes(ch)) {
      let op = ch;
      i++;
      if (i < input.length && '<>=!|'.includes(input[i])) {
        op += input[i];
        i++;
      }
      tokens.push(op);
      continue;
    }

    // Word characters (keywords, identifiers, numbers)
    if (/[a-zA-Z_0-9.*]/.test(ch)) {
      let word = '';
      while (i < input.length && /[a-zA-Z_0-9.*]/.test(input[i])) {
        word += input[i];
        i++;
      }
      tokens.push(word);
      continue;
    }

    // Any other character
    tokens.push(ch);
    i++;
  }

  // Remove trailing spaces
  while (tokens.length > 0 && tokens[tokens.length - 1] === ' ') {
    tokens.pop();
  }

  return tokens;
};

/**
 * Format a single PartiQL statement.
 * - Uppercases keywords
 * - Places major clauses on new lines with proper indentation
 * - Normalizes whitespace
 */
const formatStatement = (statement: string): string => {
  const trimmed = statement.trim();
  if (!trimmed) return '';

  const tokens = tokenize(trimmed);

  // Filter out space tokens and rebuild with proper formatting
  const nonSpaceTokens = tokens.filter(t => t !== ' ');

  const lines: string[] = [];
  let currentLine: string[] = [];

  for (let i = 0; i < nonSpaceTokens.length; i++) {
    const token = nonSpaceTokens[i];
    const upper = token.toUpperCase();

    // Uppercase keywords
    const isKeyword = KEYWORD_SET.has(upper);
    const displayToken = isKeyword ? upper : token;

    // Check for ORDER BY (two-word keyword)
    if (
      upper === 'ORDER' &&
      i + 1 < nonSpaceTokens.length &&
      nonSpaceTokens[i + 1].toUpperCase() === 'BY'
    ) {
      // Flush current line
      if (currentLine.length > 0) {
        lines.push(currentLine.join(' '));
      }
      currentLine = ['ORDER', 'BY'];
      i++; // skip 'BY'
      continue;
    }

    // Check if this keyword should start a new line
    if (NEW_LINE_KEYWORDS.includes(upper) && upper !== 'ORDER BY') {
      // Flush current line before starting new clause
      if (currentLine.length > 0) {
        lines.push(currentLine.join(' '));
      }
      currentLine = [displayToken];
      continue;
    }

    // Statement keywords start on their own line (for multi-statement formatting)
    if (STATEMENT_KEYWORDS.includes(upper) && (currentLine.length > 0 || lines.length > 0)) {
      if (currentLine.length > 0) {
        lines.push(currentLine.join(' '));
      }
      currentLine = [displayToken];
      continue;
    }

    currentLine.push(displayToken);
  }

  // Flush remaining tokens
  if (currentLine.length > 0) {
    lines.push(currentLine.join(' '));
  }

  return lines.join('\n');
};

/**
 * Format PartiQL content (may contain multiple statements separated by semicolons or empty lines).
 * Each statement is formatted individually, preserving separators.
 */
export const formatPartiql = (content: string): string => {
  if (!content.trim()) return content;

  const lines = content.split('\n');
  const segments: Array<{ type: 'statement' | 'comment' | 'empty'; text: string }> = [];

  let currentStatement = '';

  const flushStatement = () => {
    if (currentStatement.trim()) {
      // Check if statement ends with semicolon
      const hasSemicolon = currentStatement.trim().endsWith(';');
      const statementBody = hasSemicolon
        ? currentStatement.trim().slice(0, -1)
        : currentStatement.trim();

      const formatted = formatStatement(statementBody);
      segments.push({
        type: 'statement',
        text: hasSemicolon ? formatted + ';' : formatted,
      });
    }
    currentStatement = '';
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line - separator between statements
    if (trimmed === '') {
      flushStatement();
      segments.push({ type: 'empty', text: '' });
      continue;
    }

    // Comment line
    if (trimmed.startsWith('--') || trimmed.startsWith('//')) {
      flushStatement();
      segments.push({ type: 'comment', text: trimmed });
      continue;
    }

    // Check if this starts a new statement while we already have one
    const upper = trimmed.toUpperCase();
    const startsNewStatement = STATEMENT_KEYWORDS.some(
      kw => upper.startsWith(kw + ' ') || upper === kw,
    );

    if (startsNewStatement && currentStatement.trim()) {
      flushStatement();
    }

    currentStatement += (currentStatement ? '\n' : '') + line;
  }

  flushStatement();

  // Remove consecutive empty segments at the end
  while (segments.length > 0 && segments[segments.length - 1].type === 'empty') {
    segments.pop();
  }

  return segments.map(s => s.text).join('\n');
};
