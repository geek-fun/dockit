import * as monaco from 'monaco-editor';
import { keywords } from './keywords.ts';

const providePathCompletionItems = (lineContent: string) => {
  const methods = new Map<RegExp, string>([
    [/^ge?t?$/gi, 'GET '],
    [/^put?$/gi, 'PUT '],
    [/^pos?t?$/gi, 'POST '],
    [/^de?l?e?t?e?$/gi, 'DELETE '],
  ]);
  const matchedMethodKey = Array.from(methods.keys()).find(regex => regex.test(lineContent));
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

const provideQDSLCompletionItems = (lineContent: string) => {
  const word = lineContent.split(/[ /]+/).pop() || '';
  const suggestions = keywords
    .filter(keyword => keyword.startsWith(word))
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

  if (textUntilPosition.endsWith('"') || textUntilPosition.endsWith("'")) {
    return {
      suggestions: keywords.map(keyword => ({
        label: keyword,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: keyword,
      })),
    };
  }

  const methodCompletions = providePathCompletionItems(textUntilPosition);
  if (methodCompletions) {
    return methodCompletions;
  }

  const keywordCompletions = provideQDSLCompletionItems(textUntilPosition);
  if (keywordCompletions) {
    return keywordCompletions;
  }
};
