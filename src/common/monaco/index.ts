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

if (typeof self !== 'undefined') {
  self.MonacoEnvironment = monacoEnvironment;
}

typescript.typescriptDefaults.setEagerModelSync(true);

const registerSearchLanguage = (): void => {
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
  });
};

registerSearchLanguage();
registerPartiqlLanguage();

export * from './type.ts';
export { monaco, executeActions };
export * from './tokenlizer.ts';
export * from './referDoc.ts';

export {
  configureCompletions,
  configureDynamicOptions,
  BackendType,
};

export type { DynamicCompletionOptions } from './completion.ts';

export * as searchdsl from './searchdsl';

export * as partiql from './partiql';
export {
  setPartiqlDynamicOptions,
  partiqlSampleQueries,
} from './partiql';
export type { PartiqlDynamicOptions } from './partiql';
