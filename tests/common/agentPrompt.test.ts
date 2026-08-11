import { assembleSystemPrompt } from '../../src/common/agentPrompt';

describe('assembleSystemPrompt', () => {
  const base = 'You are a Data Studio agent embedded in DocKit.';

  it('returns base alone when no user/connection layers are set', () => {
    expect(assembleSystemPrompt({ base, connectionPrompts: [] })).toBe(base);
  });

  it('appends the user global prompt after the base', () => {
    const result = assembleSystemPrompt({
      base,
      userGlobal: 'Answer in Chinese.',
      connectionPrompts: [],
    });
    expect(result).toBe(`${base}\n\nAnswer in Chinese.`);
  });

  it('appends a single connection prompt flat (no alias header) for one source', () => {
    const result = assembleSystemPrompt({
      base,
      connectionPrompts: [{ alias: 'prod', prompt: 'This cluster holds orders data.' }],
    });
    expect(result).toBe(`${base}\n\nThis cluster holds orders data.`);
  });

  it('labels connection prompts with alias headers when multiple sources', () => {
    const result = assembleSystemPrompt({
      base,
      connectionPrompts: [
        { alias: 'prod', prompt: 'Orders cluster.' },
        { alias: 'staging', prompt: 'Test cluster.' },
      ],
    });
    expect(result).toBe(
      [
        base,
        '## Connection Context: prod\n\nOrders cluster.',
        '## Connection Context: staging\n\nTest cluster.',
      ].join('\n\n'),
    );
  });

  it('skips empty layers and does not emit stray separators', () => {
    const result = assembleSystemPrompt({
      base,
      userGlobal: '  ',
      connectionPrompts: [{ alias: 'prod', prompt: '' }],
    });
    expect(result).toBe(base);
  });

  it('appends sidebar context last, after all prompt layers', () => {
    const result = assembleSystemPrompt({
      base,
      userGlobal: 'Global rules.',
      connectionPrompts: [{ alias: 'prod', prompt: 'Orders cluster.' }],
      sidebarContext: 'Context:\ndatabase: Elasticsearch\n',
    });
    expect(result).toBe(
      [base, 'Global rules.', 'Orders cluster.', 'Context:\ndatabase: Elasticsearch'].join('\n\n'),
    );
  });

  it('keeps the full merge order: base → global → connection → sidebar', () => {
    const result = assembleSystemPrompt({
      base,
      userGlobal: 'GGG',
      connectionPrompts: [{ alias: 'a', prompt: 'CCC' }],
      sidebarContext: 'SSS',
    });
    expect(result.indexOf(base)).toBeLessThan(result.indexOf('GGG'));
    expect(result.indexOf('GGG')).toBeLessThan(result.indexOf('CCC'));
    expect(result.indexOf('CCC')).toBeLessThan(result.indexOf('SSS'));
  });
});
