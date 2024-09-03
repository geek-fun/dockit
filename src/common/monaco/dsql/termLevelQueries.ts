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
            snippet: 'value: $0',
          },
          boost: {
            label: 'boost',
            snippet: 'boost: $0',
          },
          min_similarity: {
            label: 'min_similarity',
            snippet: 'min_similarity: $0',
          },
          prefix_length: {
            label: 'prefix_length',
            snippet: 'prefix_length: $0',
          },
          max_expansions: {
            label: 'max_expansions',
            snippet: 'max_expansions: $0',
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
            snippet: 'gte: $0',
          },
          gt: {
            label: 'gt',
            snippet: 'gt: $0',
          },
          lte: {
            label: 'lte',
            snippet: 'lte: $0',
          },
          lt: {
            label: 'lt',
            snippet: 'lt: $0',
          },
          format: {
            label: 'format',
            snippet: 'format: $0',
          },
          time_zone: {
            label: 'time_zone',
            snippet: 'time_zone: $0',
          },
          boost: {
            label: 'boost',
            snippet: 'boost: $0',
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
            snippet: 'boost: $0',
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
            snippet: 'value: $0',
          },
          boost: {
            label: 'boost',
            snippet: 'boost: $0',
          },
          rewrite: {
            label: 'rewrite',
            snippet: 'rewrite: $0',
          },
        },
      },
    },
  },
};
