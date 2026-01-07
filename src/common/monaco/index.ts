import * as monaco from 'monaco-editor';

import { executeActions } from './lexerRules.ts';
import { monacoEnvironment } from './environment.ts';
import {
  configureCompletions,
  configureDynamicOptions,
  BackendType,
} from './completion.ts';
import { registerPartiqlLanguage } from './partiql';
import { registerSearchLanguage } from './searchdsl';


if (typeof self !== 'undefined') {
  self.MonacoEnvironment = monacoEnvironment;
}

monaco.typescript.typescriptDefaults.setEagerModelSync(true);

registerSearchLanguage(monaco);
registerPartiqlLanguage(monaco);

export * from './type.ts';
export { executeActions };
export * from './tokenlizer.ts';
export * from './referDoc.ts';

export {
  configureCompletions,
  configureDynamicOptions,
  BackendType,
};

export type { DynamicCompletionOptions } from './completion.ts';
export * as searchdsl from './searchdsl';

export * as partiql from './partiql';
export {
  setPartiqlDynamicOptions,
  partiqlSampleQueries,
} from './partiql';
export type { PartiqlDynamicOptions } from './partiql';

export { monaco };