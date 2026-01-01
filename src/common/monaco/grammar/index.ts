/**
 * Grammar-driven completion engine for Elasticsearch/OpenSearch
 * 
 * This module provides:
 * - Spec-driven API completions for both Elasticsearch and OpenSearch
 * - Query DSL completions with version-aware filtering
 * - Backend-specific endpoint suggestions
 * - Smart context-aware completions in Monaco Editor
 */

export * from './types';
export * from './lexer';
export * from './apiSpec';
export * from './queryDsl';
export {
  grammarCompletionProvider,
  setCompletionConfig,
  getCompletionConfig,
  type CompletionConfig,
} from './completionProvider';
