/**
 * Tests for the query language registry
 */
jest.mock('monaco-editor', () => ({}));

import {
  detectQueryLanguage,
  getAllLanguages,
  getAllMonarchTokens,
  esqlLanguage,
  sqlLanguage,
  pplLanguage,
  eqlLanguage,
} from '../../../../src/common/monaco/searchdsl/queryLanguages';
import { BackendType } from '../../../../src/common/monaco/searchdsl/types';

describe('queryLanguages registry', () => {
  describe('getAllLanguages', () => {
    it('should return all four languages', () => {
      const languages = getAllLanguages();
      expect(languages.length).toBe(4);
      expect(languages.map(l => l.id)).toContain('esql');
      expect(languages.map(l => l.id)).toContain('sql');
      expect(languages.map(l => l.id)).toContain('ppl');
      expect(languages.map(l => l.id)).toContain('eql');
    });
  });

  describe('detectQueryLanguage', () => {
    it('should return null for undefined path', () => {
      expect(detectQueryLanguage(undefined, BackendType.ELASTICSEARCH)).toBeNull();
    });

    it('should return null for unmatched path', () => {
      expect(detectQueryLanguage('/_search', BackendType.ELASTICSEARCH)).toBeNull();
    });

    it('should return null for _delete_by_query path (regression)', () => {
      expect(detectQueryLanguage('_delete_by_query', BackendType.ELASTICSEARCH)).toBeNull();
    });

    it('should return ES|QL for /_query endpoint', () => {
      const lang = detectQueryLanguage('/_query', BackendType.ELASTICSEARCH, 'POST', '8.11.0');
      expect(lang).not.toBeNull();
      expect(lang?.id).toBe('esql');
    });

    it('should return null for /_query on older ES version (8.0.0)', () => {
      const lang = detectQueryLanguage('/_query', BackendType.ELASTICSEARCH, 'POST', '8.0.0');
      expect(lang).toBeNull();
    });

    it('should return SQL for /_sql endpoint', () => {
      const lang = detectQueryLanguage('/_sql', BackendType.ELASTICSEARCH, 'POST');
      expect(lang).not.toBeNull();
      expect(lang?.id).toBe('sql');
    });

    it('should return SQL for /_plugins/_sql endpoint (OpenSearch)', () => {
      const lang = detectQueryLanguage('/_plugins/_sql', BackendType.OPENSEARCH, 'POST');
      expect(lang).not.toBeNull();
      expect(lang?.id).toBe('sql');
    });

    it('should return PPL for /_plugins/_ppl endpoint', () => {
      const lang = detectQueryLanguage('/_plugins/_ppl', BackendType.OPENSEARCH, 'POST');
      expect(lang).not.toBeNull();
      expect(lang?.id).toBe('ppl');
    });

    it('should return EQL for /{index}/_eql/search endpoint', () => {
      const lang = detectQueryLanguage('/{index}/_eql/search', BackendType.ELASTICSEARCH, 'POST');
      expect(lang).not.toBeNull();
      expect(lang?.id).toBe('eql');
    });
  });

  describe('getAllMonarchTokens', () => {
    it('should return deduplicated tokens from all languages', () => {
      const tokens = getAllMonarchTokens();
      expect(tokens.length).toBeGreaterThan(0);
      for (const token of tokens) {
        expect(token[0]).toBeInstanceOf(RegExp);
        expect(token[1]).toBeDefined();
      }
    });

    it('should preserve regexes with same source but different flags', () => {
      const tokens = getAllMonarchTokens();
      // ES|QL has /\b(true|false)\b/ (no flags) and SQL has /\b(true|false)\b/i (case-insensitive)
      // Both should survive dedup since their flags differ
      const noFlags = tokens.find(([r]) => r.source.includes('true|false') && !r.flags);
      const caseInsensitive = tokens.find(
        ([r]) => r.source.includes('true|false') && r.flags === 'i',
      );
      expect(noFlags).toBeDefined();
      expect(caseInsensitive).toBeDefined();
    });
  });
});

describe('ES|QL language definition', () => {
  it('should have endpointPaths containing /_query', () => {
    expect(esqlLanguage.endpointPaths).toContain('/_query');
  });

  it('should have commands', () => {
    expect(esqlLanguage.syntax.commands.length).toBeGreaterThan(20);
    expect(esqlLanguage.syntax.commands.find(c => c.label === 'FROM')).toBeDefined();
    expect(esqlLanguage.syntax.commands.find(c => c.label === 'WHERE')).toBeDefined();
  });

  it('should have functions', () => {
    expect(esqlLanguage.syntax.functions.length).toBeGreaterThan(20);
    expect(esqlLanguage.syntax.functions.find(f => f.label === 'AVG')).toBeDefined();
    expect(esqlLanguage.syntax.functions.find(f => f.label === 'COUNT')).toBeDefined();
  });

  it('should have bodyFields containing query, columnar, filter', () => {
    const fields = esqlLanguage.bodyFields.map(f => f.label);
    expect(fields).toContain('query');
    expect(fields).toContain('columnar');
    expect(fields).toContain('filter');
  });

  it('should have monarchTokens', () => {
    expect(esqlLanguage.monarchTokens.length).toBeGreaterThan(5);
  });
});

describe('SQL language definition', () => {
  it('should have endpointPaths containing /_sql and /_plugins/_sql', () => {
    expect(sqlLanguage.endpointPaths).toContain('/_sql');
    expect(sqlLanguage.endpointPaths).toContain('/_plugins/_sql');
  });

  it('should support both ES and OS backends', () => {
    expect(sqlLanguage.backends).toContain(BackendType.ELASTICSEARCH);
    expect(sqlLanguage.backends).toContain(BackendType.OPENSEARCH);
  });

  it('should have SQL commands', () => {
    const cmds = sqlLanguage.syntax.commands.map(c => c.label);
    expect(cmds).toContain('SELECT');
    expect(cmds).toContain('FROM');
    expect(cmds).toContain('WHERE');
    expect(cmds).toContain('JOIN');
  });

  it('should have bodyFields containing query, fetch_size, format for ES backend', () => {
    const bodyFields =
      typeof sqlLanguage.bodyFields === 'function'
        ? sqlLanguage.bodyFields(BackendType.ELASTICSEARCH)
        : sqlLanguage.bodyFields;
    const fields = bodyFields.map(f => f.label);
    expect(fields).toContain('query');
    expect(fields).toContain('fetch_size');
    expect(fields).toContain('format');
  });

  it('should have bodyFields without format for OS backend', () => {
    const bodyFields =
      typeof sqlLanguage.bodyFields === 'function'
        ? sqlLanguage.bodyFields(BackendType.OPENSEARCH)
        : sqlLanguage.bodyFields;
    const fields = bodyFields.map(f => f.label);
    expect(fields).toContain('query');
    expect(fields).toContain('fetch_size');
    expect(fields).not.toContain('format');
  });

  it('should have monarchTokens', () => {
    expect(sqlLanguage.monarchTokens.length).toBeGreaterThan(3);
  });
});

describe('PPL language definition', () => {
  it('should have endpointPaths containing /_plugins/_ppl', () => {
    expect(pplLanguage.endpointPaths).toContain('/_plugins/_ppl');
  });

  it('should have PPL commands without duplicates', () => {
    const cmds = pplLanguage.syntax.commands.map(c => c.label);
    expect(cmds).toContain('source');
    expect(cmds).toContain('where');
    expect(cmds).toContain('stats');
    expect(new Set(cmds).size).toBe(cmds.length);
    expect(cmds.length).toBe(17);
  });

  it('should have monarchTokens', () => {
    expect(pplLanguage.monarchTokens.length).toBeGreaterThan(3);
  });
});

describe('EQL language definition', () => {
  it('should have endpointPaths containing /{index}/_eql/search', () => {
    expect(eqlLanguage.endpointPaths).toContain('/{index}/_eql/search');
  });

  it('should have EQL commands', () => {
    const cmds = eqlLanguage.syntax.commands.map(c => c.label);
    expect(cmds).toContain('any');
    expect(cmds).toContain('where');
    expect(cmds).toContain('sequence');
  });

  it('should have bodyFields containing query, timestamp_field, event_category_field', () => {
    const fields = eqlLanguage.bodyFields.map(f => f.label);
    expect(fields).toContain('query');
    expect(fields).toContain('timestamp_field');
    expect(fields).toContain('event_category_field');
  });

  it('should have monarchTokens', () => {
    expect(eqlLanguage.monarchTokens.length).toBeGreaterThan(3);
  });
});
