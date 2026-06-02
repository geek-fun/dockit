import type { languages } from 'monaco-editor';
import { mongodb } from './lexerRules';
import { mongodbCompletionProvider } from './completion';

export { validateMongoModel, clearMongoValidation } from './validation';
export { mongodb } from './lexerRules';
export {
  mongoSampleQueries,
  setMongoDynamicOptions,
  getMongoDynamicOptions,
  clearMongoDynamicOptions,
} from './state';
export {
  parseMongoStatements,
  getStatementAtLine,
  getMongoStatementDecorations,
  isMongoStatementStart,
  mongoExecutionGutterClass,
  type MongoStatement,
  type MongoDecoration,
} from './parser';

export const registerMongodbLanguage = (monaco: typeof import('monaco-editor')): void => {
  monaco.languages.register({ id: mongodb.id });
  monaco.languages.setMonarchTokensProvider(
    mongodb.id,
    mongodb.rules as languages.IMonarchLanguage,
  );
  monaco.languages.setLanguageConfiguration(
    mongodb.id,
    mongodb.languageConfiguration as languages.LanguageConfiguration,
  );
  monaco.languages.registerCompletionItemProvider(mongodb.id, {
    triggerCharacters: ['.', '"', "'", ' ', '{', '[', '(', '$'],
    provideCompletionItems: mongodbCompletionProvider,
  });
};
