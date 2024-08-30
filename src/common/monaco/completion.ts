import * as monaco from 'monaco-editor';
import { dsql, keywords } from './keywords.ts';

const providePathCompletionItems = (lineContent: string) => {
  const methods = new Map<RegExp, string>([
    [/^ge?t?$/gi, 'GET '],
    [/^put?$/gi, 'PUT '],
    [/^pos?t?$/gi, 'POST '],
    [/^de?l?e?t?e?$/gi, 'DELETE '],
  ]);
  const matchedMethodKey = Array.from(methods.keys()).find(regex => regex.test(lineContent));
  if (matchedMethodKey) {
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
  }
  const isPathMatch = /^(GET|POST|PUT|DELETE)(\s+[a-zA-Z0-9_\/-?\-&,]*)$/.test(lineContent);
  const word = lineContent.split(/[ /]+/).pop() || '';
  if (isPathMatch) {
    return {
      suggestions: dsql.paths
        .filter(p => p.startsWith(word))
        .map(keyword => ({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Unit,
          insertText: keyword,
        })),
    };
  }
};

const provideQDSLCompletionItems = (
  textUntilPosition: string,
  lineContent: string,
  position: monaco.Position,
) => {
  const word = textUntilPosition.split(/[ /]+/).pop() || '';
  const closureIndex = getClosureIndex(lineContent, textUntilPosition);
  console.log('closureIndex', { closureIndex, word, textUntilPosition, lineContent });

  const suggestions = keywords
    .filter(keyword => keyword.startsWith(word))
    .map(keyword => ({
      label: keyword,
      insertText: keyword,
      kind: monaco.languages.CompletionItemKind.Keyword,
      ...{
        insertTextRules:
          closureIndex === -1
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : monaco.languages.CompletionItemInsertTextRule.None,
        range:
          closureIndex === -1
            ? undefined
            : new monaco.Range(
                position.lineNumber,
                position.column - 1,
                position.lineNumber,
                closureIndex,
              ),
      },
    }));

  return { suggestions };
};

const getClosureIndex = (lineContent: string, textUntilPosition: string) => {
  const matches = lineContent?.substring(textUntilPosition.length)?.match(/[,":]/);
  if (matches && matches[0]) {
    return (
      textUntilPosition.length +
      lineContent?.substring(textUntilPosition.length).indexOf(matches[0]) +
      1
    );
  } else {
    return -1;
  }
};

const searchCompletionProvider = (model: monaco.editor.ITextModel, position: monaco.Position) => {
  const textUntilPosition = model.getValueInRange({
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: 1,
    endColumn: position.column,
  });
  const lineContent = model.getLineContent(position.lineNumber);

  if (textUntilPosition.endsWith('"') || textUntilPosition.endsWith("'")) {
    return {
      suggestions: keywords.map(keyword => ({
        label: keyword,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: `${keyword}${textUntilPosition.charAt(textUntilPosition.length - 1)}`,
        range: new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column + 1,
        ),
      })),
    };
  }

  const methodCompletions = providePathCompletionItems(textUntilPosition);
  if (methodCompletions) {
    return methodCompletions;
  }

  const keywordCompletions = provideQDSLCompletionItems(textUntilPosition, lineContent, position);
  if (keywordCompletions) {
    return keywordCompletions;
  }
};

const searchResolveCompletionItem = (item: monaco.languages.CompletionItem) => {
  console.log('searchResolveCompletionItem', item);
  if (item.insertTextRules !== monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet) {
    return item;
  }

  return {
    ...item,
    insertText: `${item.insertText}: {\n\t$0\n},`,
  };
};

export { searchCompletionProvider, searchResolveCompletionItem };
