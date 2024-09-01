import { DsqlTreeItem } from './type.ts';
import { get } from 'lodash';

const methods = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH', 'TRACE'];
const paths = [
  '_search',
  '_cat',
  '_count',
  '_mapping',
  '_cluster',
  '_nodes',
  '_aliases',
  '_doc',
  '_update',
  '_bulk',
  '_search_shards',
  '_validate/query',
  'stats',
  'indices',
  'index',
  'type',
  'types',
  // query parameters & enum values
  'search_type',
  'query_then_fetch',
  'query_and_fetch',
  'dfs_query_then_fetch',
  'dfs_query_and_fetch',
  'count',
  'scan',
  'preference',
  '_primary',
  '_primary_first',
  '_local',
  '_only_node:',
  '_prefer_node:',
  '_shards:',
];

const _search_query = [
  'match',
  'match_all',
  'match_none',
  'match_phrase',
  'match_phrase_prefix',
  'multi_match',
  'term',
  'terms',
  'query_string',
  'ids',
  'prefix',
  'wildcard',
  'fuzzy',
  'fuzzy_like_this',
  'fuzzy_like_this_field',
  'more_like_this',
  'more_like_this_field',
  'range',
  'dismax',
  'regexp',
  'bool',
  'boosting',
  'constant_score',
  'indices',
  'default_operator',
  'df',
  'analyzer',
  'sort',
  'boost',
];

const _search_highlight = [
  'pre_tags',
  'post_tags',
  'fields',
  'require_field_match',
  'fragment_size',
  'number_of_fragments',
  'order',
  'boundary_scanner',
  'boundary_scanner_locale',
];

const _search_query_match_all = ['boost'];
const _search_query_match_none = [..._search_query_match_all];

const _search_query_match = [
  'operator',
  'fuzziness',
  'analyzer',
  'prefix_length',
  'max_expansions',
  'cutoff_frequency',
  'query',
];
const _search_query_multi_match = ['fields', 'use_dis_max', 'tie_breaker', ..._search_query_match];

const _search_query_match_phrase = ['query', 'slop', 'analyzer'];
const _search_query_match_phrase_prefix = ['max_expansions', ..._search_query_match_phrase];

const _search_query_query_string = [
  'query',
  'default_field',
  'default_operator',
  'allow_leading_wildcard',
  'lowercase_expanded_terms',
  'enable_position_increments',
  'fuzzy_max_expansions',
  'fuzzy_prefix_length',
  'fuzzy_min_sim',
  'phrase_slop',
  'boost',
  'analyze_wildcard',
  'auto_generate_phrase_queries',
  'minimum_should_match',
  'lenient',
  'fields',
  'use_dis_max',
];

const _search_query_ids = ['type', 'values'];
const _search_query_prefix = [
  'value',
  'boost',
  'rewrite',
  // bellows are rewrite value enum options
  'scoring_boolean',
  'constant_score_boolean',
  'constant_score_filter',
  'top_terms_N',
  'top_terms_boost_N',
];

const _search_query_wildcard = [..._search_query_prefix];

const _search_query_fuzzy = ['value', 'boost', 'min_similarity', 'prefix_length', 'max_expansions'];
const _search_query_fuzzy_like_this_field = [
  'like_text',
  'ignore_tf',
  'max_query_terms',
  'min_similarity',
  'prefix_length',
  'boost',
  'analyzer',
];
const _search_query_fuzzy_like_this = ['fields', ..._search_query_fuzzy_like_this_field];
const _search_query_more_like_this_field = [
  'like_text',
  'percent_terms_to_match',
  'stop_words',
  'min_doc_freq',
  'max_doc_freq',
  'min_word_len',
  'max_word_len',
  'boost_terms',
  'boost',
  'analyzer',
];
const _search_query_more_like_this = ['fields', ..._search_query_more_like_this_field];

const _search_query_range = ['gte', 'gt', 'lte', 'lt', 'format', 'time_zone', 'boost'];
const _search_query_dismax = ['tie_breaker', 'boost', 'queries'];

const _search_query_regexp = ['value', 'boost', 'flags', 'max_determinized_states'];

const _search_query_bool = [
  'must',
  'filter',
  'should',
  'must_not',
  'minimum_should_match',
  'disable_coord',
  'boost',
];
const _search_query_boosting = ['positive', 'negative', 'negative_boost'];
const _search_query_constant_score = ['query', 'boost'];

const _search_query_indices = ['indices', 'no_match_query'];

const _search_sort = ['type', 'order', 'mode', 'missing', 'nested', '_script'];

const dsqlTree: {
  [key: string]: {
    label: string;
    children?: {
      [key: string]: DsqlTreeItem;
    };
  };
} = {
  _search: {
    label: '_search',
    children: {
      query: {
        label: 'query',
        snippet: `query: {\n\t$0\n},`,
        children: {
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
          match_all: {
            label: 'match_all',
            snippet: `match_all: {$0},`,
            children: {
              boost: {
                label: 'boost',
                snippet: 'boost: $1',
              },
            },
          },
          match_none: {
            label: 'match_none',
            snippet: `match_none: {$0},`,
            children: {
              boost: {
                label: 'boost',
                snippet: 'boost: $1',
              },
            },
          },
          match_phrase: {
            label: 'match_phrase',
            snippet: `match_phrase: {\n\t$0\n},`,
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
          match_phrase_prefix: {
            label: 'match_phrase_prefix',
            snippet: `match_phrase_prefix: {\n\t$0\n},`,
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
          multi_match: {
            label: 'multi_match',
            snippet: `multi_match: {\n\t$0\n},`,
          },
          term: {
            label: 'term',
            snippet: `term: {\n\t$0FIELD: {\n\tvalue: 'VALUE'\n}\n},`,
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
            snippet: `terms: {\n\t$0\n},`,
          },
          query_string: {
            label: 'query_string',
            snippet: `query_string: {\n\t$0\n},`,
          },
          ids: {
            label: 'ids',
            snippet: `ids: {\n\t$0\n},`,
          },
          prefix: {
            label: 'prefix',
            snippet: `prefix: {\n\t$0\n},`,
          },
          wildcard: {
            label: 'wildcard',
            snippet: `wildcard: {\n\t$0\n},`,
          },
          fuzzy: {
            label: 'fuzzy',
            snippet: `fuzzy: {\n\t$0\n},`,
          },
          fuzzy_like_this: {
            label: 'fuzzy_like_this',
            snippet: `fuzzy_like_this: {\n\t$0\n},`,
          },
          fuzzy_like_this_field: {
            label: 'fuzzy_like_this_field',
            snippet: `fuzzy_like_this_field: {\n\t$0\n},`,
          },
          more_like_this: {
            label: 'more_like_this',
            snippet: `more_like_this: {\n\t$0\n},`,
          },
          more_like_this_field: {
            label: 'more_like_this_field',
            snippet: `more_like_this_field: {\n\t$0\n},`,
          },
          range: {
            label: 'range',

            snippet: `range: {\n\t$0\n},`,
          },
          dismax: {
            label: 'dismax',
            snippet: `dismax: {\n\t$0\n},`,
          },
          regexp: {
            label: 'regexp',
            snippet: `regexp: {\n\t$0\n},`,
          },
          bool: {
            label: 'bool',

            snippet: `bool: {\n\t$0\n},`,
          },
          boosting: {
            label: 'boosting',
            snippet: `boosting: {\n\t$0\n},`,
          },
          constant_score: {
            label: 'constant_score',
            snippet: `constant_score: {\n\t$0\n},`,
          },
          indices: {
            label: 'indices',
            snippet: `indices: {\n\t$0\n},`,
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
      from: {
        label: 'from',
        snippet: 'from: $1',
      },
      size: {
        label: 'size',
        snippet: 'size: $1',
      },
      aggs: {
        label: 'aggs',
        snippet: `aggs: {\n\t$0\n},`,
      },
      sort: {
        label: 'sort',
        snippet: 'sort: $1',
      },
      indices: {
        label: 'indices',
        snippet: 'indices: $1',
      },
      type: {
        label: 'type',
        snippet: 'type: $1',
      },
      version: {
        label: 'version',
        snippet: 'version: $1',
      },
      min_score: {
        label: 'min_score',
        snippet: 'min_score: $1',
      },
      fields: {
        label: 'fields',
        snippet: 'fields: $1',
      },
      script_fields: {
        label: 'script_fields',
        snippet: 'script_fields: ```\n\t$0\n```',
      },
      partial_fields: {
        label: 'partial_fields',
        snippet: 'partial_fields: ```\n\t$0\n```',
      },
      highlight: {
        label: 'highlight',
        snippet: `highlight: {\n\t$0\n},`,
      },
    },
  },
};

const getSubDsqlTree = (action: string, path: Array<string>) => {
  let subTree = get(dsqlTree, action);
  console.log('getSubDsqlTree', { action, path, subTree });
  if (!subTree) {
    return;
  }
  for (const key of path) {
    const newSubTree = get(subTree, `children.${key}`) || get(subTree, 'children.*');
    if (newSubTree) {
      subTree = newSubTree;
    } else {
      return;
    }
  }

  return subTree;
};

const dsql = {
  methods,
  _search_query,
  _search_highlight,
  _search_query_match_all,
  _search_query_match_none,
  _search_query_match,
  _search_query_match_phrase,
  _search_query_match_phrase_prefix,
  _search_query_multi_match,
  _search_query_query_string,
  _search_query_ids,
  _search_query_prefix,
  _search_query_wildcard,
  _search_query_fuzzy,
  _search_query_fuzzy_like_this,
  _search_query_more_like_this,
  _search_query_more_like_this_field,
  _search_query_range,
  _search_query_dismax,
  _search_query_regexp,
  _search_query_bool,
  _search_query_boosting,
  _search_query_constant_score,
  _search_query_indices,
  _search_sort,
};

//
// const dsqlState = []
// const dsqlTree = {
//
//   methods,
//   paths,
//   _search,
//   _search_query,
//   _search_highlight,
//   _search_query_terms,
//   _search_query_match_all,
//   _search_query_match_none,
//   _search_query_match,
//   _search_query_match_phrase,
//   _search_query_match_phrase_prefix,
//   _search_query_multi_match,
//   _search_query_query_string,
//   _search_query_ids,
//   _search_query_prefix,
//   _search_query_wildcard,
//   _search_query_fuzzy,
//   _search_query_fuzzy_like_this,
//   _search_query_more_like_this,
//   _search_query_more_like_this_field,
//   _search_query_range,
//   _search_query_dismax,
//   _search_query_regexp,
//   _search_query_bool,
//   _search_query_boosting,
//   _search_query_constant_score,
//   _search_query_indices,
//   _search_sort,
// };

const keywords = Array.from(
  new Set(Object.entries(dsql).reduce((acc, [, value]) => [...acc, ...value], [] as string[])),
).filter(Boolean);

export { keywords, paths, dsqlTree, getSubDsqlTree };
