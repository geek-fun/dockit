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
 * Lexer class for tokenizing search queries
 */
export class SearchLexer {
  private input: string;
  private pos: number;
  private line: number;
  private column: number;
  private tokens: Token[];

  constructor(input: string) {
    this.input = input;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];
  }

  /**
   * Tokenize the input
   */
  tokenize(): Token[] {
    this.tokens = [];
    this.pos = 0;
    this.line = 1;
    this.column = 1;

    while (this.pos < this.input.length) {
      const token = this.nextToken();
      if (token) {
        this.tokens.push(token);
      }
    }

    return this.tokens;
  }

  /**
   * Get the remaining input from current position
   */
  private remaining(): string {
    return this.input.slice(this.pos);
  }

  /**
   * Try to match a pattern
   */
  private match(pattern: RegExp): string | null {
    const match = pattern.exec(this.remaining());
    return match ? match[0] : null;
  }

  /**
   * Advance position and update line/column tracking
   */
  private advance(length: number): void {
    const chars = this.input.slice(this.pos, this.pos + length);
    const newLineCount = (chars.match(/\n/g) || []).length;

    if (newLineCount > 0) {
      const lastNewlineIndex = chars.lastIndexOf('\n');
      this.line += newLineCount;
      this.column = length - lastNewlineIndex;
    } else {
      this.column += length;
    }
    this.pos += length;
  }

  /**
   * Create a token
   */
  private createToken(type: TokenType, value: string, startPos: number): Token {
    const startLine = this.line;
    const startColumn = this.column;

    this.advance(value.length);

    return {
      type,
      value,
      start: startPos,
      end: this.pos,
      line: startLine,
      column: startColumn,
    };
  }

  /**
   * Get next token from input
   */
  private nextToken(): Token | null {
    const startPos = this.pos;
    const remaining = this.remaining();

    if (!remaining) {
      return null;
    }

    // Skip whitespace (but track it)
    const whitespace = this.match(patterns.whitespace);
    if (whitespace) {
      return this.createToken(TokenType.WHITESPACE, whitespace, startPos);
    }

    // Skip newlines (but track them)
    const newline = this.match(patterns.newline);
    if (newline) {
      return this.createToken(TokenType.NEWLINE, newline, startPos);
    }

    // Line comments
    const lineComment = this.match(patterns.lineComment);
    if (lineComment) {
      return this.createToken(TokenType.COMMENT, lineComment, startPos);
    }

    // Block comments
    const blockComment = this.match(patterns.blockComment);
    if (blockComment) {
      return this.createToken(TokenType.COMMENT, blockComment, startPos);
    }

    // HTTP Method
    const method = this.match(patterns.method);
    if (method && this.isAtLineStart()) {
      return this.createToken(TokenType.METHOD, method.toUpperCase(), startPos);
    }

    // Path (after method)
    if (remaining[0] === '/') {
      const path = this.match(patterns.path);
      if (path) {
        return this.createToken(TokenType.PATH, path, startPos);
      }
    }

    // Triple quoted strings (painless scripts)
    const tripleQuote = this.match(patterns.tripleQuote);
    if (tripleQuote) {
      const endPattern = tripleQuote === '"""' ? '"""' : "'''";
      const endIndex = this.input.indexOf(endPattern, this.pos + 3);
      if (endIndex !== -1) {
        const fullString = this.input.slice(this.pos, endIndex + 3);
        return this.createToken(TokenType.STRING, fullString, startPos);
      }
    }

    // Regular strings
    const string = this.match(patterns.string);
    if (string) {
      return this.createToken(TokenType.STRING, string, startPos);
    }

    // Numbers
    const number = this.match(patterns.number);
    if (number) {
      return this.createToken(TokenType.NUMBER, number, startPos);
    }

    // Booleans
    const boolean = this.match(patterns.boolean);
    if (boolean) {
      return this.createToken(TokenType.BOOLEAN, boolean, startPos);
    }

    // Null
    const nullMatch = this.match(patterns.null);
    if (nullMatch) {
      return this.createToken(TokenType.NULL, nullMatch, startPos);
    }

    // Punctuation
    if (remaining[0] === ':') {
      return this.createToken(TokenType.COLON, ':', startPos);
    }
    if (remaining[0] === ',') {
      return this.createToken(TokenType.COMMA, ',', startPos);
    }
    if (remaining[0] === '{') {
      return this.createToken(TokenType.BODY_START, '{', startPos);
    }
    if (remaining[0] === '}') {
      return this.createToken(TokenType.BODY_END, '}', startPos);
    }
    if (remaining[0] === '[') {
      return this.createToken(TokenType.BODY_START, '[', startPos);
    }
    if (remaining[0] === ']') {
      return this.createToken(TokenType.BODY_END, ']', startPos);
    }

    // Identifiers (used as keys in JSON5)
    const identifier = this.match(patterns.identifier);
    if (identifier) {
      return this.createToken(TokenType.KEY, identifier, startPos);
    }

    // Unknown token - skip one character
    const unknownChar = remaining[0];
    return this.createToken(TokenType.UNKNOWN, unknownChar, startPos);
  }

  /**
   * Check if current position is at start of line (ignoring whitespace)
   */
  private isAtLineStart(): boolean {
    const beforePos = this.input.slice(0, this.pos);
    const lastNewlineIndex = Math.max(beforePos.lastIndexOf('\n'), beforePos.lastIndexOf('\r'));

    if (lastNewlineIndex === -1) {
      return true; // Start of input
    }

    const textAfterNewline = beforePos.slice(lastNewlineIndex + 1);
    return /^[ \t]*$/.test(textAfterNewline);
  }
}

/**
 * Tokenize input string
 */
export const tokenize = (input: string): Token[] => {
  const lexer = new SearchLexer(input);
  return lexer.tokenize();
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
