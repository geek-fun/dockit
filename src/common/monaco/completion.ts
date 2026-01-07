import type { editor, Position } from 'monaco-editor';
import {
  grammarCompletionProvider,
  setCompletionConfig,
  setDynamicOptions,
  BackendType,
} from './searchdsl';

export { BackendType };
export type { CompletionConfig, DynamicCompletionOptions } from './searchdsl';

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

export const configureDynamicOptions = setDynamicOptions;

export const searchCompletionProvider = (
  model: editor.ITextModel,
  position: Position,
) => {
  return grammarCompletionProvider(model, position);
};
