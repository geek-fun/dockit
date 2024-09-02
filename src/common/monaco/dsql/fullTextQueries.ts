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
            snippet: 'operator: $1',
          },
          fuzziness: {
            label: 'fuzziness',
            snippet: 'fuzziness: $1',
          },
          analyzer: {
            label: 'analyzer',
            snippet: 'analyzer: $1',
          },
          prefix_length: {
            label: 'prefix_length',
            snippet: 'prefix_length: $1',
          },
          max_expansions: {
            label: 'max_expansions',
            snippet: 'max_expansions: $1',
          },
          cutoff_frequency: {
            label: 'cutoff_frequency',
            snippet: 'cutoff_frequency: $1',
          },
          query: {
            label: 'query',
            snippet: 'query: $1',
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
            snippet: 'query: $1',
          },
          slop: {
            label: 'slop',
            snippet: 'slop: $1',
          },
          analyzer: {
            label: 'analyzer',
            snippet: 'analyzer: $1',
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
            snippet: 'max_expansions: $1',
          },
          query: {
            label: 'query',
            snippet: 'query: $1',
          },
          analyzer: {
            label: 'analyzer',
            snippet: 'analyzer: $1',
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
        snippet: 'use_dis_max: $1',
      },
      tie_breaker: {
        label: 'tie_breaker',
        snippet: 'tie_breaker: $1',
      },
      boost: {
        label: 'boost',
        snippet: 'boost: $1',
      },
      query: {
        label: 'query',
        snippet: 'query: $1',
      },
    },
  },
  query_string: {
    label: 'query_string',
    snippet: `query_string: {\n\tquery: '$0',\n\tdefault_field: 'FIELD'\n},`,
    children: {
      query: {
        label: 'query',
        snippet: 'query: $1',
      },
      default_field: {
        label: 'default_field',
        snippet: 'default_field: $1',
      },
      default_operator: {
        label: 'default_operator',
        snippet: 'default_operator: $1',
      },
      df: {
        label: 'df',
        snippet: 'df: $1',
      },
      analyzer: {
        label: 'analyzer',
        snippet: 'analyzer: $1',
      },
      sort: {
        label: 'sort',
        snippet: 'sort: $1',
      },
      boost: {
        label: 'boost',
        snippet: 'boost: $1',
      },
    },
  },
};
