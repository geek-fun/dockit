import * as monaco from 'monaco-editor';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';
import {
  BackendType,
  configureCompletions,
  configureDynamicOptions,
  DynamicCompletionOptions,
} from './completion.ts';
import { monacoEnvironment } from './environment.ts';
import {
  registerPartiqlLanguage,
  partiqlSampleQueries,
  setPartiqlDynamicOptions,
  parsePartiqlStatements,
  getStatementAtLine,
  getPartiqlStatementDecorations,
  partiqlExecutionGutterClass,
} from './partiql';
import {
  registerSearchLanguage,
  executeActions,
  registerValidationHoverProvider as registerSearchValidationHoverProvider,
} from './searchdsl';
import { registerValidationHoverProvider as registerPartiqlValidationHoverProvider } from './partiql';
import { registerMongodbLanguage } from './mongodb';

if (typeof self !== 'undefined') {
  self.MonacoEnvironment = monacoEnvironment;
}

monaco.typescript.typescriptDefaults.setEagerModelSync(true);

registerSearchLanguage(monaco);
registerPartiqlLanguage(monaco);
registerMongodbLanguage(monaco);
registerSearchValidationHoverProvider(monaco);
registerPartiqlValidationHoverProvider(monaco);

export * from './referDoc.ts';
export * from './tokenlizer.ts';
export * from './type.ts';
export * as searchdsl from './searchdsl';
export * as partiql from './partiql';
export * as mongodb from './mongodb';

export { createDebouncedValidator } from './monacoUtils';

export { validateEsModel, clearEsValidation } from './searchdsl';
export { validatePartiqlModel, clearPartiqlValidation } from './partiql';
export { validateMongoModel, clearMongoValidation } from './mongodb';
export {
  mongoSampleQueries,
  setMongoDynamicOptions,
  getMongoDynamicOptions,
  clearMongoDynamicOptions,
} from './mongodb';

export {
  monaco,
  BackendType,
  configureCompletions,
  configureDynamicOptions,
  type DynamicCompletionOptions,
  executeActions,
  partiqlSampleQueries,
  setPartiqlDynamicOptions,
  parsePartiqlStatements,
  getStatementAtLine,
  getPartiqlStatementDecorations,
  partiqlExecutionGutterClass,
};
