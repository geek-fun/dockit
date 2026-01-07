import * as monaco from 'monaco-editor';
import { typescript } from 'monaco-editor';

import { executeActions, search } from './lexerRules.ts';
import { monacoEnvironment } from './environment.ts';
import {
  searchCompletionProvider,
  configureCompletions,
  configureDynamicOptions,
  BackendType,
} from './completion.ts';
import { registerPartiqlLanguage } from './partiql';

// Only assign MonacoEnvironment if 'self' is defined (browser or web worker)
if (typeof self !== 'undefined') {
  self.MonacoEnvironment = monacoEnvironment;
}

typescript.typescriptDefaults.setEagerModelSync(true);
monaco.languages.register({ id: search.id });
monaco.languages.setMonarchTokensProvider(
  search.id,
  search.rules as monaco.languages.IMonarchLanguage,
);
monaco.languages.setLanguageConfiguration(
  search.id,
  search.languageConfiguration as monaco.languages.LanguageConfiguration,
);
monaco.languages.registerCompletionItemProvider(search.id, {
  triggerCharacters: ['g', 'p', 'd', '"', "'", ' ', '/', '_', ':'],
  // @ts-ignore
  provideCompletionItems: searchCompletionProvider,
  // resolveCompletionItem: searchResolveCompletionItem,
});

// Register PartiQL language for DynamoDB queries
registerPartiqlLanguage();

export * from './type.ts';
export { monaco, executeActions };
export * from './tokenlizer.ts';
export * from './referDoc.ts';

// Export grammar-driven completion configuration
export {
  configureCompletions,
  configureDynamicOptions,
  BackendType,
};

// Export types for external use
export type { DynamicCompletionOptions } from './completion.ts';

// Export grammar module for advanced usage
export * as grammar from './grammar';

// Export PartiQL module for DynamoDB queries
export * as partiql from './partiql';
export {
  setPartiqlDynamicOptions,
  partiqlSampleQueries,
} from './partiql';
export type { PartiqlDynamicOptions } from './partiql';
