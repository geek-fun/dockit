import * as monaco from 'monaco-editor';

import { search, executeActions } from './lexerRules.ts';
import { monacoEnvironment } from './environment.ts';
import { buildSearchToken } from './tokenlizer.ts';

self.MonacoEnvironment = monacoEnvironment;

monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
monaco.languages.register({ id: search.id });
monaco.languages.setMonarchTokensProvider(
  search.id,
  search.rules as monaco.languages.IMonarchLanguage,
);
monaco.languages.setLanguageConfiguration('search', {
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
});
export * from './type.ts';
export { monaco, executeActions, buildSearchToken };
export * from './referDoc.ts';
