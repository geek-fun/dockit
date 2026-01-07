import * as monaco from 'monaco-editor';
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

export const registerPartiqlLanguage = (): void => {
  monaco.languages.register({ id: partiql.id });
  monaco.languages.setMonarchTokensProvider(
    partiql.id,
    partiql.rules as monaco.languages.IMonarchLanguage,
  );
  monaco.languages.setLanguageConfiguration(
    partiql.id,
    partiql.languageConfiguration as monaco.languages.LanguageConfiguration,
  );
  monaco.languages.registerCompletionItemProvider(partiql.id, {
    triggerCharacters: [' ', '.', '"', "'", '('],
    provideCompletionItems: partiqlCompletionProvider,
  });
};
