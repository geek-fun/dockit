import * as monaco from 'monaco-editor';

import { executeActions, search } from './lexerRules.ts';
import { monacoEnvironment } from './environment.ts';
import { buildSearchToken } from './tokenlizer.ts';
import { searchCompletionProvider } from './completion.ts';

self.MonacoEnvironment = monacoEnvironment;

monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
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
  triggerCharacters: ['g', 'p', 'd'],
  // @ts-ignore
  provideCompletionItems: searchCompletionProvider,
});

export * from './type.ts';
export { monaco, executeActions, buildSearchToken };
export * from './referDoc.ts';
