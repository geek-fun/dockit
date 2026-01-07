import * as monaco from 'monaco-editor';
import {
  BackendType,
  configureCompletions,
  configureDynamicOptions,
  DynamicCompletionOptions
} from './completion.ts';
import { monacoEnvironment } from './environment.ts';
import { executeActions } from './lexerRules.ts';
import { registerPartiqlLanguage, partiqlSampleQueries, setPartiqlDynamicOptions } from './partiql';
import { registerSearchLanguage } from './searchdsl';

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
  partiqlSampleQueries, setPartiqlDynamicOptions
};
