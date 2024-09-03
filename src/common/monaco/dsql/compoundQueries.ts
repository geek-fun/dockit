import { matchAllQueries } from './matchAllQueries.ts';
import { termLevelQueries } from './termLevelQueries.ts';
import { specializedQueries } from './specializedQueries.ts';
import { fullTextQueries } from './fullTextQueries.ts';

export const compoundQueries = {
  dis_max: {
    label: 'dis_max',
    snippet: `dis_max: {\n\ttie_breaker: 0.7,\n\tboost: 1.2,\n\tqueries: [$0]\n},`,
    children: {
      '*': {
        label: '*',
        snippet: `*: {\n\t$0\n},`,
        children: {
          tie_breaker: {
            label: 'tie_breaker',
            snippet: 'tie_breaker: $0',
          },
          boost: {
            label: 'boost',
            snippet: 'boost: $0',
          },
        },
      },
      queries: {
        label: 'queries',
        snippet: 'queries: $0',
        children: {
          ...matchAllQueries,
          ...termLevelQueries,
          ...specializedQueries,
          ...fullTextQueries,
        },
      },
    },
  },
  bool: {
    label: 'bool',
    snippet: `bool: {\n\t$0\n},`,
    children: {
      must: {
        label: 'must',
        snippet: `must: [\n\t{\n\t\t$0\n\t}\n],`,
        children: {
          ...matchAllQueries,
          ...termLevelQueries,
          ...specializedQueries,
          ...fullTextQueries,
        },
      },
      filter: {
        label: 'filter',
        snippet: `filter: [\n\t{\n\t\t$0\n\t}\n],`,
        children: {
          ...matchAllQueries,
          ...termLevelQueries,
          ...specializedQueries,
          ...fullTextQueries,
        },
      },
      should: {
        label: 'should',
        snippet: 'should: [\n\t{\n\t\t$0\n\t}\n],',
      },
      must_not: {
        label: 'must_not',
        snippet: 'must_not: [\n\t{\n\t\t$0\n\t}\n]',
      },
      minimum_should_match: {
        label: 'minimum_should_match',
        snippet: 'minimum_should_match: 1$0',
      },
      boost: {
        label: 'boost',
        snippet: 'boost: 1$0',
      },
    },
  },
  boosting: {
    label: 'boosting',
    snippet: `boosting: {\n\t$0\n},`,
  },
  constant_score: {
    label: 'constant_score',
    snippet: `constant_score: {\n\tfilter: {$0},\n\tboost: 1.2\n},`,
  },
};
