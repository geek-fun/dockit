import * as monaco from 'monaco-editor';
import {
  BackendType,
  configureCompletions,
  configureDynamicOptions,
  DynamicCompletionOptions
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
import { registerSearchLanguage, executeActions, registerValidationHoverProvider as registerSearchValidationHoverProvider } from './searchdsl';
import { registerValidationHoverProvider as registerPartiqlValidationHoverProvider } from './partiql';

if (typeof self !== 'undefined') {
  self.MonacoEnvironment = monacoEnvironment;
}

monaco.typescript.typescriptDefaults.setEagerModelSync(true);

registerSearchLanguage(monaco);
registerPartiqlLanguage(monaco);
registerSearchValidationHoverProvider(monaco);
registerPartiqlValidationHoverProvider(monaco);

export * from './referDoc.ts';
export * from './tokenlizer.ts';
export * from './type.ts';
export * as searchdsl from './searchdsl';
export * as partiql from './partiql';

// Export validation utilities
export {
  createDebouncedValidator,
} from './monacoUtils';

// Export validation functions from searchdsl and partiql
export {
  validateEsModel,
  clearEsValidation,
} from './searchdsl';

export {
  validatePartiqlModel,
  clearPartiqlValidation,
} from './partiql';

export {
  monaco,
  BackendType, configureCompletions,
  configureDynamicOptions, type DynamicCompletionOptions, executeActions,
  partiqlSampleQueries, setPartiqlDynamicOptions,
  parsePartiqlStatements, getStatementAtLine, getPartiqlStatementDecorations, partiqlExecutionGutterClass,
};
