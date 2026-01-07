import * as monaco from 'monaco-editor';
import {
  grammarCompletionProvider,
  setCompletionConfig,
  setDynamicOptions,
  BackendType,
} from './grammar';

// Re-export types for external use
export { BackendType };
export type { CompletionConfig, DynamicCompletionOptions } from './grammar';

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
 * Configure dynamic completion options from the connected database
 * These options provide real values for path parameters like {index}, {repository}, {template}
 *
 * @param options - Dynamic options object containing:
 *   - activeIndex: The currently selected index from toolbar
 *   - indices: All available indices in the cluster
 *   - repositories: Available snapshot repositories
 *   - templates: Available index templates
 *   - pipelines: Available ingest pipelines
 *   - aliases: Available index aliases
 */
export const configureDynamicOptions = setDynamicOptions;

/**
 * Grammar-driven completion provider for Elasticsearch/OpenSearch queries
 */
export const searchCompletionProvider = (
  model: monaco.editor.ITextModel,
  position: monaco.Position,
) => {
  return grammarCompletionProvider(model, position);
};
