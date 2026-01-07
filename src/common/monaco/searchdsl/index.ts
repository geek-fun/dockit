import * as monaco from 'monaco-editor';
import { search } from '../lexerRules';
import {
  searchCompletionProvider,
} from '../completion';

export * from './types';
export * from './lexer';
export * from './apiSpec';
export * from './queryDsl';
export {
  grammarCompletionProvider,
  setCompletionConfig,
  getCompletionConfig,
  setDynamicOptions,
  getDynamicOptions,
  type CompletionConfig,
  type DynamicCompletionOptions,
} from './completionProvider';

export const registerSearchLanguage = (): void => {
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
