import type { languages } from 'monaco-editor'
import { partiql } from './lexerRules';
import { partiqlCompletionProvider } from './completion';

export { partiqlKeywords, partiqlKeywordCategories } from './keywords';
export {
  setPartiqlDynamicOptions,
  getPartiqlDynamicOptions,
  partiqlSampleQueries,
} from './utils';
export type { PartiqlDynamicOptions } from './utils';
export { partiql } from './lexerRules';

export const registerPartiqlLanguage = (monaco: typeof import('monaco-editor')): void => {
  monaco.languages.register({ id: partiql.id });
  monaco.languages.setMonarchTokensProvider(
    partiql.id,
    partiql.rules as languages.IMonarchLanguage,
  );
  monaco.languages.setLanguageConfiguration(
    partiql.id,
    partiql.languageConfiguration as languages.LanguageConfiguration,
  );
  monaco.languages.registerCompletionItemProvider(partiql.id, {
    triggerCharacters: [' ', '.', '"', "'", '('],
    provideCompletionItems: partiqlCompletionProvider,
  });
};
