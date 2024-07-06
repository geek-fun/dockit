// import 'monaco-editor/esm/vs/base/common/worker/simpleWorker';
// import 'monaco-editor/esm/vs/base/worker/defaultWorkerFactory';
//
// import 'monaco-editor/esm/vs/editor/browser/controller/coreCommands.js';
// import 'monaco-editor/esm/vs/editor/browser/widget/codeEditorWidget.js';
//
// import 'monaco-editor/esm/vs/editor/contrib/wordOperations/wordOperations.js';
//
// import 'monaco-editor/esm/vs/editor/contrib/suggest/suggestController.js';
// import 'monaco-editor/esm/vs/editor/contrib/hover/hover.js';
// import 'monaco-editor/esm/vs/editor/contrib/parameterHints/parameterHints.js';
// import 'monaco-editor/esm/vs/language/json/json.worker.js';
/* eslint-disable-next-line @osd/eslint/module_migration */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

import { search } from './lexerRules.ts';
import { monacoEnvironment } from './environment.ts';

self.MonacoEnvironment = monacoEnvironment;

monaco.languages.register({ id: search.id });
monaco.languages.setMonarchTokensProvider(
  search.id,
  search.rules as monaco.languages.IMonarchLanguage,
);

export { monaco };
