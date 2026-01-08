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
import { registerSearchLanguage, executeActions } from './searchdsl';

if (typeof self !== 'undefined') {
  self.MonacoEnvironment = monacoEnvironment;
}

monaco.typescript.typescriptDefaults.setEagerModelSync(true);

registerSearchLanguage(monaco);
registerPartiqlLanguage(monaco);

export * from './referDoc.ts';
export * from './tokenlizer.ts';
export * from './type.ts';
export * as searchdsl from './searchdsl';
export * as partiql from './partiql';


export {
  monaco,
  BackendType, configureCompletions,
  configureDynamicOptions, type DynamicCompletionOptions, executeActions,
  partiqlSampleQueries, setPartiqlDynamicOptions,
  parsePartiqlStatements, getStatementAtLine, getPartiqlStatementDecorations, partiqlExecutionGutterClass,
};
