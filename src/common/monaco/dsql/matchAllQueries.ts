export const matchAllQueries = {
  match_all: {
    label: 'match_all',
    snippet: `match_all: {$0},`,
    children: {
      boost: {
        label: 'boost',
        snippet: 'boost: $0',
      },
    },
  },
};
