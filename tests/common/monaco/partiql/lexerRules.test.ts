import { partiql } from '../../../../src/common/monaco/partiql/lexerRules';

describe('PartiQL Lexer Rules', () => {
  it('should have correct language id', () => {
    expect(partiql.id).toBe('partiql');
  });

  it('should have rules defined', () => {
    expect(partiql.rules).toBeDefined();
    expect(partiql.rules.tokenPostfix).toBe('.partiql');
  });

  it('should have keywords array', () => {
    expect(partiql.rules.keywords).toBeDefined();
    expect(Array.isArray(partiql.rules.keywords)).toBe(true);
    expect(partiql.rules.keywords.length).toBeGreaterThan(0);
  });

  it('should have typeKeywords array', () => {
    expect(partiql.rules.typeKeywords).toBeDefined();
    expect(Array.isArray(partiql.rules.typeKeywords)).toBe(true);
    expect(partiql.rules.typeKeywords).toContain('STRING');
    expect(partiql.rules.typeKeywords).toContain('NUMBER');
    expect(partiql.rules.typeKeywords).toContain('BOOLEAN');
  });

  it('should have operators array', () => {
    expect(partiql.rules.operators).toBeDefined();
    expect(partiql.rules.operators).toContain('=');
    expect(partiql.rules.operators).toContain('<>');
    expect(partiql.rules.operators).toContain('||');
  });

  it('should have tokenizer with root state', () => {
    expect(partiql.rules.tokenizer).toBeDefined();
    expect(partiql.rules.tokenizer.root).toBeDefined();
    expect(Array.isArray(partiql.rules.tokenizer.root)).toBe(true);
  });

  it('should have tokenizer with string state', () => {
    expect(partiql.rules.tokenizer.string).toBeDefined();
    expect(Array.isArray(partiql.rules.tokenizer.string)).toBe(true);
  });

  it('should have tokenizer with whitespace state', () => {
    expect(partiql.rules.tokenizer.whitespace).toBeDefined();
    expect(Array.isArray(partiql.rules.tokenizer.whitespace)).toBe(true);
  });

  it('should have language configuration', () => {
    expect(partiql.languageConfiguration).toBeDefined();
  });

  it('should have comments configuration', () => {
    expect(partiql.languageConfiguration.comments).toBeDefined();
    expect(partiql.languageConfiguration.comments.lineComment).toBe('--');
  });

  it('should have brackets configuration', () => {
    expect(partiql.languageConfiguration.brackets).toBeDefined();
    expect(partiql.languageConfiguration.brackets).toContainEqual(['{', '}']);
    expect(partiql.languageConfiguration.brackets).toContainEqual(['[', ']']);
    expect(partiql.languageConfiguration.brackets).toContainEqual(['(', ')']);
  });

  it('should have autoClosingPairs configuration', () => {
    expect(partiql.languageConfiguration.autoClosingPairs).toBeDefined();
    expect(Array.isArray(partiql.languageConfiguration.autoClosingPairs)).toBe(true);
    expect(partiql.languageConfiguration.autoClosingPairs.length).toBeGreaterThan(0);
  });

  it('should have surroundingPairs configuration', () => {
    expect(partiql.languageConfiguration.surroundingPairs).toBeDefined();
    expect(Array.isArray(partiql.languageConfiguration.surroundingPairs)).toBe(true);
    expect(partiql.languageConfiguration.surroundingPairs.length).toBeGreaterThan(0);
  });
});
