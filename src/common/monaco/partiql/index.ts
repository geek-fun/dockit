/**
 * PartiQL Language Support for Monaco Editor
 * Provides syntax highlighting, autocompletion and language configuration
 * for AWS PartiQL queries against DynamoDB
 */

import * as monaco from 'monaco-editor';
import { partiql } from './lexerRules';
import { partiqlCompletionProvider } from './completion';

// Export types and utilities (from utils.ts - doesn't depend on monaco)
export { partiqlKeywords, partiqlKeywordCategories } from './keywords';
export {
  setPartiqlDynamicOptions,
  getPartiqlDynamicOptions,
  partiqlSampleQueries,
} from './utils';
export type { PartiqlDynamicOptions } from './utils';
export { partiql } from './lexerRules';

/**
 * Register PartiQL language with Monaco Editor
 * This should be called once when the application initializes
 */
export const registerPartiqlLanguage = (): void => {
  // Register the language
  monaco.languages.register({ id: partiql.id });

  // Set tokenizer rules for syntax highlighting
  monaco.languages.setMonarchTokensProvider(
    partiql.id,
    partiql.rules as monaco.languages.IMonarchLanguage,
  );

  // Set language configuration (brackets, comments, etc.)
  monaco.languages.setLanguageConfiguration(
    partiql.id,
    partiql.languageConfiguration as monaco.languages.LanguageConfiguration,
  );

  // Register completion provider
  monaco.languages.registerCompletionItemProvider(partiql.id, {
    triggerCharacters: [' ', '.', '"', "'", '('],
    provideCompletionItems: partiqlCompletionProvider,
  });
};
