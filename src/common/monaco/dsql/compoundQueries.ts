export const compoundQueries = {
  dismax: {
    label: 'dismax',
    snippet: `dismax: {\n\ttie_breaker: 0.7,\n\tboost: 1.2,\n\tqueries: [$0]\n},`,
    children: {
      '*': {
        label: '*',
        snippet: `*: {\n\t$0\n},`,
        children: {
          tie_breaker: {
            label: 'tie_breaker',
            snippet: 'tie_breaker: $1',
          },
          boost: {
            label: 'boost',
            snippet: 'boost: $1',
          },
          queries: {
            label: 'queries',
            snippet: 'queries: $1',
          },
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
          term: {
            label: 'term',
            snippet: `term: {\n\t$0FIELD: {\n\t\tvalue: 'VALUE'\n\t}\n},`,
          },
          terms: {
            label: 'terms',
            snippet: `terms: {\n\t$0FIELD: []\n},`,
          },
        },
      },
      filter: {
        label: 'filter',
        snippet: 'filter: $1',
      },
      should: {
        label: 'should',
        snippet: 'should: $1',
      },
      must_not: {
        label: 'must_not',
        snippet: 'must_not: $1',
      },
      minimum_should_match: {
        label: 'minimum_should_match',
        snippet: 'minimum_should_match: $1',
      },
      disable_coord: {
        label: 'disable_coord',
        snippet: 'disable_coord: $1',
      },
      boost: {
        label: 'boost',
        snippet: 'boost: $1',
      },
    },
  },
  boosting: {
    label: 'boosting',
    snippet: `boosting: {\n\t$0\n},`,
  },
  constant_score: {
    label: 'constant_score',
    snippet: `constant_score: {\n\t$0\n},`,
  },
};
