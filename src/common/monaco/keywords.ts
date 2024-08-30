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

const _search = [
  'from',
  'size',
  'query',
  'explain',
  'analyze',
  'aggs',
  'sort',
  'indices',
  'type',
  'version',
  'min_score',
  'fields',
  'script_fields',
  'partial_fields',
  'highlight',
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

const _search_query_terms = ['minimum_match'];

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

const dsql = {
  methods,
  paths,
  _search,
  _search_query,
  _search_highlight,
  _search_query_terms,
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

export { keywords, dsql };
