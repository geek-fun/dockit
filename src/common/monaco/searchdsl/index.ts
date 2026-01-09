import type { languages } from 'monaco-editor'
import { search, executeActions } from './lexerRules';
import {
  searchCompletionProvider,
} from '../completion';


export * from './types';
export * from './lexer';
export * from './apiSpec';
export * from './queryDsl';
export * from './validation';

export {
  grammarCompletionProvider,
  setCompletionConfig,
  getCompletionConfig,
  setDynamicOptions,
  getDynamicOptions,
  type CompletionConfig,
  type DynamicCompletionOptions,
} from './completionProvider';

const registerSearchLanguage = (monaco: typeof import('monaco-editor')): void => {
  monaco.languages.register({ id: search.id });
  monaco.languages.setMonarchTokensProvider(
    search.id,
    search.rules as languages.IMonarchLanguage,
  );
  monaco.languages.setLanguageConfiguration(
    search.id,
    search.languageConfiguration as languages.LanguageConfiguration,
  );
  monaco.languages.registerCompletionItemProvider(search.id, {
    triggerCharacters: ['g', 'p', 'd', '"', "'", ' ', '/', '_', ':'],
    // @ts-ignore
    provideCompletionItems: searchCompletionProvider,
  });
};

export { registerSearchLanguage, executeActions };