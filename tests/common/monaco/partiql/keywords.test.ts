import {
  partiqlKeywords,
  partiqlKeywordCategories,
} from '../../../../src/common/monaco/partiql/keywords';

describe('PartiQL Keywords', () => {
  it('should contain DML keywords', () => {
    expect(partiqlKeywordCategories.dml).toContain('SELECT');
    expect(partiqlKeywordCategories.dml).toContain('INSERT');
    expect(partiqlKeywordCategories.dml).toContain('UPDATE');
    expect(partiqlKeywordCategories.dml).toContain('DELETE');
    expect(partiqlKeywordCategories.dml).toContain('FROM');
    expect(partiqlKeywordCategories.dml).toContain('WHERE');
  });

  it('should contain clause keywords', () => {
    expect(partiqlKeywordCategories.clauses).toContain('AND');
    expect(partiqlKeywordCategories.clauses).toContain('OR');
    expect(partiqlKeywordCategories.clauses).toContain('NOT');
    expect(partiqlKeywordCategories.clauses).toContain('BETWEEN');
    expect(partiqlKeywordCategories.clauses).toContain('IN');
    expect(partiqlKeywordCategories.clauses).toContain('LIMIT');
  });

  it('should contain function keywords', () => {
    expect(partiqlKeywordCategories.functions).toContain('COUNT');
    expect(partiqlKeywordCategories.functions).toContain('SUM');
    expect(partiqlKeywordCategories.functions).toContain('AVG');
    expect(partiqlKeywordCategories.functions).toContain('CONTAINS');
    expect(partiqlKeywordCategories.functions).toContain('BEGINS_WITH');
  });

  it('should contain DynamoDB specific keywords', () => {
    expect(partiqlKeywordCategories.dynamoSpecific).toContain('RETURNING');
    expect(partiqlKeywordCategories.dynamoSpecific).toContain('ALL_OLD');
    expect(partiqlKeywordCategories.dynamoSpecific).toContain('ALL_NEW');
  });

  it('should contain data type keywords', () => {
    expect(partiqlKeywordCategories.dataTypes).toContain('STRING');
    expect(partiqlKeywordCategories.dataTypes).toContain('NUMBER');
    expect(partiqlKeywordCategories.dataTypes).toContain('BOOLEAN');
    expect(partiqlKeywordCategories.dataTypes).toContain('LIST');
    expect(partiqlKeywordCategories.dataTypes).toContain('MAP');
  });

  it('should export uppercase keywords', () => {
    partiqlKeywords.forEach(keyword => {
      expect(keyword).toEqual(keyword.toUpperCase());
    });
  });

  it('should contain all keywords from categories', () => {
    const allFromCategories = [
      ...partiqlKeywordCategories.dml,
      ...partiqlKeywordCategories.clauses,
      ...partiqlKeywordCategories.functions,
      ...partiqlKeywordCategories.dynamoSpecific,
      ...partiqlKeywordCategories.dataTypes,
    ].map(k => k.toUpperCase());

    allFromCategories.forEach(keyword => {
      expect(partiqlKeywords).toContain(keyword);
    });
  });
});
