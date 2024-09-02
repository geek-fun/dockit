export const termLevelQueries = {
  // exists: {}, //@TODO
  fuzzy: {
    label: 'fuzzy',
    snippet: `fuzzy: {\n\t$0FIELD: {\n\t\tvalue: "VALUE"\n\t}\n},`,
    children: {
      '*': {
        label: '*',
        snippet: `*: {\n\t$0\n},`,
        children: {
          value: {
            label: 'value',
            snippet: 'value: $1',
          },
          boost: {
            label: 'boost',
            snippet: 'boost: $1',
          },
          min_similarity: {
            label: 'min_similarity',
            snippet: 'min_similarity: $1',
          },
          prefix_length: {
            label: 'prefix_length',
            snippet: 'prefix_length: $1',
          },
          max_expansions: {
            label: 'max_expansions',
            snippet: 'max_expansions: $1',
          },
        },
      },
    },
  },
  ids: {
    label: 'ids',
    snippet: `ids: {\n\tvalues : ['$0']\n},`,
  },
  prefix: {
    label: 'prefix',
    snippet: `prefix: {\n\t$0FIELD: {\n\t\tvalue: "VALUE"\n\t}\n},`,
  },
  range: {
    label: 'range',
    snippet: `range: {\n\t$0FIELD: {\n\t\tgte: 10,\n\t\tlte: 20\n\t}\n},`,
    children: {
      '*': {
        label: '*',
        snippet: `*: {\n\t$0\n},`,
        children: {
          gte: {
            label: 'gte',
            snippet: 'gte: $1',
          },
          gt: {
            label: 'gt',
            snippet: 'gt: $1',
          },
          lte: {
            label: 'lte',
            snippet: 'lte: $1',
          },
          lt: {
            label: 'lt',
            snippet: 'lt: $1',
          },
          format: {
            label: 'format',
            snippet: 'format: $1',
          },
          time_zone: {
            label: 'time_zone',
            snippet: 'time_zone: $1',
          },
          boost: {
            label: 'boost',
            snippet: 'boost: $1',
          },
        },
      },
    },
  },
  regexp: {
    label: 'regexp',
    snippet: `regexp: {\n\t$0FIELD: 'REGEXP'\n},`,
  },
  term: {
    label: 'term',
    snippet: `term: {\n\t$0FIELD: {\n\t\tvalue: 'VALUE'\n\t},\n},`,
    children: {
      '*': {
        label: '*',
        snippet: `*: {\n\t$0\n},`,
        children: {
          boost: {
            label: 'boost',
            snippet: 'boost: $1',
          },
        },
      },
    },
  },
  terms: {
    label: 'terms',
    snippet: `terms: {\n\t$0FIELD: []\n},`,
  },

  wildcard: {
    label: 'wildcard',
    snippet: `wildcard: {\n\t$0FIELD: {\n\t\tvalue: "VALUE"\n\t}\n},`,
    children: {
      '*': {
        label: '*',
        snippet: `*: {\n\t$0\n},`,
        children: {
          value: {
            label: 'value',
            snippet: 'value: $1',
          },
          boost: {
            label: 'boost',
            snippet: 'boost: $1',
          },
          rewrite: {
            label: 'rewrite',
            snippet: 'rewrite: $1',
          },
        },
      },
    },
  },
};
