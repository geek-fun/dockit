export const specializedQueries = {
  more_like_this: {
    label: 'more_like_this',
    snippet: `more_like_this: {\n\tfields: ['$0'],\n\tlike: 'text like this',\n\tmin_term_freq: 1,\n\tmax_query_terms: 12\n},`,
    children: {
      '*': {
        label: '*',
        snippet: `*: {\n\t$0\n},`,
        children: {
          like: {
            label: 'like',
            snippet: 'like: $0',
          },
          min_term_freq: {
            label: 'min_term_freq',
            snippet: 'min_term_freq: $0',
          },
          max_query_terms: {
            label: 'max_query_terms',
            snippet: 'max_query_terms: $0',
          },
          fields: {
            label: 'fields',
            snippet: 'fields: $0',
          },
        },
      },
    },
  },
};
