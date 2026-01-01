import * as monaco from 'monaco-editor';
import {
  grammarCompletionProvider,
  setCompletionConfig,
  BackendType,
} from './grammar';

// Re-export types for external use
export { BackendType };
export type { CompletionConfig } from './grammar';

/**
 * Configure the completion engine for a specific backend and version
 * This affects the available endpoints, query types, and features
 */
export const configureCompletions = (config: {
  backend: 'elasticsearch' | 'opensearch';
  version?: string;
}): void => {
  const backendType =
    config.backend === 'opensearch' ? BackendType.OPENSEARCH : BackendType.ELASTICSEARCH;
  setCompletionConfig({
    backend: backendType,
    version: config.version,
  });
};

/**
 * Grammar-driven completion provider for Elasticsearch/OpenSearch queries
 */
export const searchCompletionProvider = (
  model: monaco.editor.ITextModel,
  position: monaco.Position,
) => {
  return grammarCompletionProvider(model, position);
};
