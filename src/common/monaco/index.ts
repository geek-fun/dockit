import * as monaco from 'monaco-editor';

import { search, executeActions } from './lexerRules.ts';
import { monacoEnvironment } from './environment.ts';
import { buildSearchToken } from './tokenlizer.ts';

self.MonacoEnvironment = monacoEnvironment;

monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
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
  triggerCharacters: ['g', 'p', 'd'],
  // @ts-ignore
  provideCompletionItems: function (model, position) {
    const textUntilPosition = model.getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    });

    const methods = new Map<RegExp, string>([
      [/^ge?t?$/gi, 'GET '],
      [/^put?$/gi, 'PUT '],
      [/^pos?t?$/gi, 'POST '],
      [/^de?l?e?t?e?$/gi, 'DELETE '],
    ]);
    const matchedMethodKey = Array.from(methods.keys()).find(regex =>
      regex.test(textUntilPosition),
    );
    if (!matchedMethodKey) {
      return;
    }

    const method = methods.get(matchedMethodKey);
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column - method!.length,
      endColumn: position.column,
    };

    return {
      suggestions: [
        {
          label: method,
          kind: monaco.languages.CompletionItemKind.Constant,
          insertText: method,
          range: range,
        },
      ],
    };
  },
});
export * from './type.ts';
export { monaco, executeActions, buildSearchToken };
export * from './referDoc.ts';
