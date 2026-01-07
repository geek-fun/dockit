/**
 * Grammar-driven completion engine for Elasticsearch/OpenSearch
 * 
 * This module provides:
 * - Spec-driven API completions for both Elasticsearch and OpenSearch
 * - Query DSL completions with version-aware filtering
 * - Backend-specific endpoint suggestions
 * - Smart context-aware completions in Monaco Editor
 * - Dynamic completions from connected database (indices, repositories, templates)
 */

export * from './types';
export * from './lexer';
export * from './apiSpec';
export * from './queryDsl';
export {
  grammarCompletionProvider,
  setCompletionConfig,
  getCompletionConfig,
  setDynamicOptions,
  getDynamicOptions,
  type CompletionConfig,
  type DynamicCompletionOptions,
} from './completionProvider';
