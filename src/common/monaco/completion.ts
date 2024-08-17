import * as monaco from 'monaco-editor';
import { keywords } from './lexerRules.ts';

const provideMethodCompletionItems = (lineContent: string) => {
  const methods = new Map<RegExp, string>([
    [/^ge?t?$/gi, 'GET '],
    [/^put?$/gi, 'PUT '],
    [/^pos?t?$/gi, 'POST '],
    [/^de?l?e?t?e?$/gi, 'DELETE '],
  ]);
  const matchedMethodKey = Array.from(methods.keys()).find(regex => regex.test(lineContent));
  console.log('matchedMethodKey', { matchedMethodKey, lineContent });
  if (!matchedMethodKey) {
    return null;
  }

  const method = methods.get(matchedMethodKey);

  return {
    suggestions: [
      {
        label: method,
        kind: monaco.languages.CompletionItemKind.Constant,
        insertText: method,
      },
    ],
  };
};

const provideKeywordCompletionItems = (lineContent: string) => {
  const word = lineContent.split(/[ /]+/).pop() || '';
  const suggestions = keywords
    .filter(keyword => {
      return keyword.startsWith(word);
    })
    .map(keyword => ({
      label: keyword,
      kind: monaco.languages.CompletionItemKind.Keyword,
      insertText: keyword,
    }));
  return { suggestions };
};

export const searchCompletionProvider = (
  model: monaco.editor.ITextModel,
  position: monaco.Position,
) => {
  const textUntilPosition = model.getValueInRange({
    startLineNumber: position.lineNumber,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });

  const methodCompletions = provideMethodCompletionItems(textUntilPosition);
  if (methodCompletions) {
    return methodCompletions;
  }
  const keywordCompletions = provideKeywordCompletionItems(textUntilPosition);

  if (keywordCompletions) {
    return keywordCompletions;
  }
};
