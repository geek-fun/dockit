/**
 * Tests for the grammar lexer
 */
import { SearchLexer, tokenize, getTokensAtLine, findTokenAtPosition } from '../../../../src/common/monaco/searchdsl/lexer';
import { TokenType } from '../../../../src/common/monaco/searchdsl/types';

describe('SearchLexer', () => {
  describe('tokenize', () => {
    it('should tokenize HTTP method at start of line', () => {
      const tokens = tokenize('GET /_search');
      
      const methodToken = tokens.find(t => t.type === TokenType.METHOD);
      expect(methodToken).toBeDefined();
      expect(methodToken?.value).toBe('GET');
    });

    it('should tokenize all HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'PATCH', 'OPTIONS'];
      
      for (const method of methods) {
        const tokens = tokenize(`${method} /_search`);
        const methodToken = tokens.find(t => t.type === TokenType.METHOD);
        expect(methodToken).toBeDefined();
        expect(methodToken?.value).toBe(method);
      }
    });

    it('should tokenize path', () => {
      const tokens = tokenize('GET /_search');
      
      const pathToken = tokens.find(t => t.type === TokenType.PATH);
      expect(pathToken).toBeDefined();
      expect(pathToken?.value).toBe('/_search');
    });

    it('should tokenize path with index', () => {
      const tokens = tokenize('GET /my-index/_search');
      
      const pathToken = tokens.find(t => t.type === TokenType.PATH);
      expect(pathToken).toBeDefined();
      expect(pathToken?.value).toBe('/my-index/_search');
    });

    it('should tokenize JSON body start and end', () => {
      const tokens = tokenize('GET /_search\n{ }');
      
      const bodyStartToken = tokens.find(t => t.type === TokenType.BODY_START);
      const bodyEndToken = tokens.find(t => t.type === TokenType.BODY_END);
      
      expect(bodyStartToken).toBeDefined();
      expect(bodyStartToken?.value).toBe('{');
      expect(bodyEndToken).toBeDefined();
      expect(bodyEndToken?.value).toBe('}');
    });

    it('should tokenize JSON keys', () => {
      const tokens = tokenize('{ query: {} }');
      
      const keyToken = tokens.find(t => t.type === TokenType.KEY);
      expect(keyToken).toBeDefined();
      expect(keyToken?.value).toBe('query');
    });

    it('should tokenize string values', () => {
      const tokens = tokenize('{ "field": "value" }');
      
      const stringTokens = tokens.filter(t => t.type === TokenType.STRING);
      expect(stringTokens.length).toBeGreaterThanOrEqual(2);
    });

    it('should tokenize numbers', () => {
      const tokens = tokenize('{ size: 10 }');
      
      const numberToken = tokens.find(t => t.type === TokenType.NUMBER);
      expect(numberToken).toBeDefined();
      expect(numberToken?.value).toBe('10');
    });

    it('should tokenize negative numbers', () => {
      const tokens = tokenize('{ boost: -1.5 }');
      
      const numberToken = tokens.find(t => t.type === TokenType.NUMBER);
      expect(numberToken).toBeDefined();
      expect(numberToken?.value).toBe('-1.5');
    });

    it('should tokenize scientific notation', () => {
      const tokens = tokenize('{ value: 1e10 }');
      
      const numberToken = tokens.find(t => t.type === TokenType.NUMBER);
      expect(numberToken).toBeDefined();
      expect(numberToken?.value).toBe('1e10');
    });

    it('should tokenize boolean values', () => {
      const tokens = tokenize('{ enabled: true, disabled: false }');
      
      const boolTokens = tokens.filter(t => t.type === TokenType.BOOLEAN);
      expect(boolTokens.length).toBe(2);
      expect(boolTokens[0].value).toBe('true');
      expect(boolTokens[1].value).toBe('false');
    });

    it('should tokenize null', () => {
      const tokens = tokenize('{ field: null }');
      
      const nullToken = tokens.find(t => t.type === TokenType.NULL);
      expect(nullToken).toBeDefined();
      expect(nullToken?.value).toBe('null');
    });

    it('should tokenize line comments', () => {
      const tokens = tokenize('{ // this is a comment\n}');
      
      const commentToken = tokens.find(t => t.type === TokenType.COMMENT);
      expect(commentToken).toBeDefined();
      expect(commentToken?.value).toContain('// this is a comment');
    });

    it('should tokenize block comments', () => {
      const tokens = tokenize('{ /* block comment */ }');
      
      const commentToken = tokens.find(t => t.type === TokenType.COMMENT);
      expect(commentToken).toBeDefined();
      expect(commentToken?.value).toBe('/* block comment */');
    });

    it('should track line and column numbers', () => {
      const tokens = tokenize('GET /_search\n{\n  query: {}\n}');
      
      const queryToken = tokens.find(t => t.value === 'query');
      expect(queryToken).toBeDefined();
      expect(queryToken?.line).toBe(3);
    });
  });

  describe('getTokensAtLine', () => {
    it('should return tokens for a specific line', () => {
      const tokens = tokenize('GET /_search\n{ query: {} }');
      
      const line1Tokens = getTokensAtLine(tokens, 1);
      const line2Tokens = getTokensAtLine(tokens, 2);
      
      expect(line1Tokens.length).toBeGreaterThan(0);
      expect(line2Tokens.length).toBeGreaterThan(0);
      
      // Line 1 should have the method
      expect(line1Tokens.find(t => t.type === TokenType.METHOD)).toBeDefined();
      
      // Line 2 should have the body
      expect(line2Tokens.find(t => t.type === TokenType.BODY_START)).toBeDefined();
    });
  });

  describe('findTokenAtPosition', () => {
    it('should find token at a given offset', () => {
      const input = 'GET /_search';
      const tokens = tokenize(input);
      
      // Find token at position 0 (should be GET)
      const methodToken = findTokenAtPosition(tokens, 1);
      expect(methodToken?.type).toBe(TokenType.METHOD);
      
      // Find token at position after GET (in the path)
      const pathToken = findTokenAtPosition(tokens, 5);
      expect(pathToken?.type).toBe(TokenType.PATH);
    });
  });
});
