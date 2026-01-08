/**
 * Lexer for Elasticsearch/OpenSearch query language
 * Tokenizes input for grammar-driven completions
 */

import { Token, TokenType } from './types';

/**
 * Token patterns for lexical analysis
 */
const patterns = {
  method: /^(GET|POST|PUT|DELETE|HEAD|PATCH|OPTIONS)\b/i,
  whitespace: /^[ \t]+/,
  newline: /^[\r\n]+/,
  lineComment: /^\/\/[^\r\n]*/,
  blockComment: /^\/\*[\s\S]*?\*\//,
  tripleQuote: /^("""|''')/,
  string: /^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'/,
  number: /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/,
  boolean: /^(true|false)\b/,
  null: /^null\b/,
  colon: /^:/,
  comma: /^,/,
  lbrace: /^\{/,
  rbrace: /^\}/,
  lbracket: /^\[/,
  rbracket: /^\]/,
  path: /^\/[a-zA-Z0-9_\-.*,/?&=]*/,
  identifier: /^[a-zA-Z_][a-zA-Z0-9_.-]*/,
};

/**
 * Lexer state for functional tokenization
 */
type LexerState = {
  input: string;
  pos: number;
  line: number;
  column: number;
  tokens: Token[];
};

/**
 * Create initial lexer state
 */
const createLexerState = (input: string): LexerState => ({
  input,
  pos: 0,
  line: 1,
  column: 1,
  tokens: [],
});

/**
 * Get the remaining input from current position
 */
const remaining = (state: LexerState): string => state.input.slice(state.pos);

/**
 * Try to match a pattern
 */
const matchPattern = (state: LexerState, pattern: RegExp): string | null => {
  const match = pattern.exec(remaining(state));
  return match ? match[0] : null;
};

/**
 * Advance position and update line/column tracking
 */
const advance = (state: LexerState, length: number): LexerState => {
  const chars = state.input.slice(state.pos, state.pos + length);
  const newLineCount = (chars.match(/\n/g) || []).length;
  
  if (newLineCount > 0) {
    const lastNewlineIndex = chars.lastIndexOf('\n');
    return {
      ...state,
      pos: state.pos + length,
      line: state.line + newLineCount,
      column: length - lastNewlineIndex,
    };
  }
  
  return {
    ...state,
    pos: state.pos + length,
    column: state.column + length,
  };
};

/**
 * Create a token and advance state
 */
const createToken = (
  state: LexerState,
  type: TokenType,
  value: string,
  startPos: number,
): { state: LexerState; token: Token } => {
  const startLine = state.line;
  const startColumn = state.column;
  const newState = advance(state, value.length);

  return {
    state: newState,
    token: {
      type,
      value,
      start: startPos,
      end: newState.pos,
      line: startLine,
      column: startColumn,
    },
  };
};

/**
 * Check if current position is at start of line (ignoring whitespace)
 */
const isAtLineStart = (state: LexerState): boolean => {
  let checkPos = state.pos - 1;
  while (checkPos >= 0) {
    const char = state.input[checkPos];
    if (char === '\n' || char === '\r') {
      return true;
    }
    if (char !== ' ' && char !== '\t') {
      return false;
    }
    checkPos--;
  }
  return true; // Start of input
};

/**
 * Get next token from input
 */
const nextToken = (state: LexerState): { state: LexerState; token: Token | null } => {
  const startPos = state.pos;
  const remainingInput = remaining(state);

  if (!remainingInput) {
    return { state, token: null };
  }

  // Skip whitespace (but track it)
  const whitespace = matchPattern(state, patterns.whitespace);
  if (whitespace) {
    return createToken(state, TokenType.WHITESPACE, whitespace, startPos);
  }

  // Skip newlines (but track them)
  const newline = matchPattern(state, patterns.newline);
  if (newline) {
    return createToken(state, TokenType.NEWLINE, newline, startPos);
  }

  // Line comments
  const lineComment = matchPattern(state, patterns.lineComment);
  if (lineComment) {
    return createToken(state, TokenType.COMMENT, lineComment, startPos);
  }

  // Block comments
  const blockComment = matchPattern(state, patterns.blockComment);
  if (blockComment) {
    return createToken(state, TokenType.COMMENT, blockComment, startPos);
  }

  // HTTP Method
  const method = matchPattern(state, patterns.method);
  if (method && isAtLineStart(state)) {
    return createToken(state, TokenType.METHOD, method.toUpperCase(), startPos);
  }

  // Path (after method)
  if (remainingInput[0] === '/') {
    const path = matchPattern(state, patterns.path);
    if (path) {
      return createToken(state, TokenType.PATH, path, startPos);
    }
  }

  // Triple quoted strings (painless scripts)
  const tripleQuote = matchPattern(state, patterns.tripleQuote);
  if (tripleQuote) {
    const endPattern = tripleQuote === '"""' ? '"""' : "'''";
    const endIndex = state.input.indexOf(endPattern, state.pos + 3);
    if (endIndex !== -1) {
      const fullString = state.input.slice(state.pos, endIndex + 3);
      return createToken(state, TokenType.STRING, fullString, startPos);
    }
  }

  // Regular strings
  const string = matchPattern(state, patterns.string);
  if (string) {
    return createToken(state, TokenType.STRING, string, startPos);
  }

  // Numbers
  const number = matchPattern(state, patterns.number);
  if (number) {
    return createToken(state, TokenType.NUMBER, number, startPos);
  }

  // Booleans
  const boolean = matchPattern(state, patterns.boolean);
  if (boolean) {
    return createToken(state, TokenType.BOOLEAN, boolean, startPos);
  }

  // Null
  const nullMatch = matchPattern(state, patterns.null);
  if (nullMatch) {
    return createToken(state, TokenType.NULL, nullMatch, startPos);
  }

  // Punctuation
  if (remainingInput[0] === ':') {
    return createToken(state, TokenType.COLON, ':', startPos);
  }
  if (remainingInput[0] === ',') {
    return createToken(state, TokenType.COMMA, ',', startPos);
  }
  if (remainingInput[0] === '{') {
    return createToken(state, TokenType.BODY_START, '{', startPos);
  }
  if (remainingInput[0] === '}') {
    return createToken(state, TokenType.BODY_END, '}', startPos);
  }
  if (remainingInput[0] === '[') {
    return createToken(state, TokenType.BODY_START, '[', startPos);
  }
  if (remainingInput[0] === ']') {
    return createToken(state, TokenType.BODY_END, ']', startPos);
  }

  // Identifiers (used as keys in JSON5)
  const identifier = matchPattern(state, patterns.identifier);
  if (identifier) {
    return createToken(state, TokenType.KEY, identifier, startPos);
  }

  // Unknown token - skip one character
  const unknownChar = remainingInput[0];
  return createToken(state, TokenType.UNKNOWN, unknownChar, startPos);
};

/**
 * Tokenize input recursively
 */
const tokenizeRecursive = (state: LexerState): LexerState => {
  if (state.pos >= state.input.length) {
    return state;
  }

  const { state: newState, token } = nextToken(state);
  
  if (!token) {
    return newState;
  }

  return tokenizeRecursive({
    ...newState,
    tokens: [...newState.tokens, token],
  });
};

/**
 * Tokenize input string
 */
export const tokenize = (input: string): Token[] => {
  const initialState = createLexerState(input);
  const finalState = tokenizeRecursive(initialState);
  return finalState.tokens;
};

/**
 * Get tokens at a specific line
 */
export const getTokensAtLine = (tokens: Token[], line: number): Token[] => {
  return tokens.filter(token => token.line === line);
};

/**
 * Find token at position
 */
export const findTokenAtPosition = (tokens: Token[], offset: number): Token | undefined => {
  return tokens.find(token => offset >= token.start && offset <= token.end);
};
