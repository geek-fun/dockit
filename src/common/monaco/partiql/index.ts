import type { languages, editor } from 'monaco-editor';
import { partiql } from './lexerRules';
import { partiqlCompletionProvider } from './completion';
import { formatPartiql } from './formatter';

export { partiqlKeywords, partiqlKeywordCategories } from './keywords';
export * from './validation';
export { formatPartiql } from './formatter';
export {
  setPartiqlDynamicOptions,
  getPartiqlDynamicOptions,
  partiqlSampleQueries,
  parsePartiqlStatements,
  getStatementAtLine,
  getPartiqlStatementDecorations,
  partiqlExecutionGutterClass,
  isStatementStart,
  type PartiqlDynamicOptions,
  type PartiqlStatement,
  type PartiqlDecoration,
} from '../monacoUtils';
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
  monaco.languages.registerDocumentFormattingEditProvider(partiql.id, {
    provideDocumentFormattingEdits: (model: editor.ITextModel) => {
      const content = model.getValue();
      const formatted = formatPartiql(content);
      const fullRange = model.getFullModelRange();
      return [{ range: fullRange, text: formatted }];
    },
  });
};
