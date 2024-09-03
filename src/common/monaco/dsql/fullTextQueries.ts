export const fullTextQueries = {
  match: {
    label: 'match',
    snippet: `match: {\n\t$0FIELD:'TEXT'\n},`,
    children: {
      '*': {
        label: '*',
        snippet: `*: {\n\t$0\n},`,
        children: {
          operator: {
            label: 'operator',
            snippet: 'operator: $0',
          },
          fuzziness: {
            label: 'fuzziness',
            snippet: 'fuzziness: $0',
          },
          analyzer: {
            label: 'analyzer',
            snippet: 'analyzer: $0',
          },
          prefix_length: {
            label: 'prefix_length',
            snippet: 'prefix_length: $0',
          },
          max_expansions: {
            label: 'max_expansions',
            snippet: 'max_expansions: $0',
          },
          cutoff_frequency: {
            label: 'cutoff_frequency',
            snippet: 'cutoff_frequency: $0',
          },
          query: {
            label: 'query',
            snippet: 'query: $0',
          },
        },
      },
    },
  },
  match_phrase: {
    label: 'match_phrase',
    snippet: `match_phrase: {\n\t$0\n},`,
    children: {
      '*': {
        label: '*',
        snippet: `*: {\n\t$0\n},`,
        children: {
          query: {
            label: 'query',
            snippet: 'query: $0',
          },
          slop: {
            label: 'slop',
            snippet: 'slop: $0',
          },
          analyzer: {
            label: 'analyzer',
            snippet: 'analyzer: $0',
          },
        },
      },
    },
  },
  match_phrase_prefix: {
    label: 'match_phrase_prefix',
    snippet: `match_phrase_prefix: {\n\t$0\n},`,
    children: {
      '*': {
        label: '*',
        snippet: `*: {\n\t$0\n},`,
        children: {
          max_expansions: {
            label: 'max_expansions',
            snippet: 'max_expansions: $0',
          },
          query: {
            label: 'query',
            snippet: 'query: $0',
          },
          analyzer: {
            label: 'analyzer',
            snippet: 'analyzer: $0',
          },
        },
      },
    },
  },
  multi_match: {
    label: 'multi_match',
    snippet: `multi_match: {\n\tquery: '$0', \n\tfields: [],\n},`,
    children: {
      fields: {
        label: 'fields',
        snippet: 'fields: [$0]',
      },
      use_dis_max: {
        label: 'use_dis_max',
        snippet: 'use_dis_max: $0',
      },
      tie_breaker: {
        label: 'tie_breaker',
        snippet: 'tie_breaker: $0',
      },
      boost: {
        label: 'boost',
        snippet: 'boost: $0',
      },
      query: {
        label: 'query',
        snippet: 'query: $0',
      },
    },
  },
  query_string: {
    label: 'query_string',
    snippet: `query_string: {\n\tquery: '$0',\n\tdefault_field: 'FIELD'\n},`,
    children: {
      query: {
        label: 'query',
        snippet: 'query: $0',
      },
      default_field: {
        label: 'default_field',
        snippet: 'default_field: $0',
      },
      default_operator: {
        label: 'default_operator',
        snippet: 'default_operator: $0',
      },
      df: {
        label: 'df',
        snippet: 'df: $0',
      },
      analyzer: {
        label: 'analyzer',
        snippet: 'analyzer: $0',
      },
      sort: {
        label: 'sort',
        snippet: 'sort: $0',
      },
      boost: {
        label: 'boost',
        snippet: 'boost: $0',
      },
    },
  },
};
