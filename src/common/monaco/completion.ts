import * as monaco from 'monaco-editor';
import { paths } from './keywords.ts';
import { searchTokens } from './tokenlizer.ts';
import { getSubDsqlTree } from './dsql';

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
      suggestions: paths
        .filter(p => p.startsWith(word))
        .map(keyword => ({
          label: keyword,
          kind: monaco.languages.CompletionItemKind.Unit,
          insertText: keyword,
        })),
    };
  }
};

const getQueryTreePath = (actionBlockContent: string) => {
  const pathStack: string[] = [];
  actionBlockContent
    .replace(/['"]/g, '')
    .replace(/\/\/.*?\n|\/\*[\s\S]*?\*\//g, '')

    .split(/[{\[]/)
    .forEach(item => {
      const pureItem = item.replace(/\s+/g, '');

      /[}\]]/.test(pureItem) && pathStack.pop();
      /[\w.]+:$/.test(pureItem) && pathStack.push(pureItem.split(',').pop() || '');
    });

  return pathStack.map(path => path.replace(/[:},\s]+/g, ''));
};

const provideQDSLCompletionItems = (
  textUntilPosition: string,
  lineContent: string,
  position: monaco.Position,
  model: monaco.editor.ITextModel,
) => {
  // const word = textUntilPosition.split(/[ /]+/).pop() || '';
  const closureIndex = isReplaceCompletion(lineContent, textUntilPosition);

  const action = searchTokens.find(
    ({ position: { startLineNumber, endLineNumber } }) =>
      position.lineNumber > startLineNumber && position.lineNumber < endLineNumber,
  );
  if (!action) {
    return;
  }

  const actionBlockContent = model.getValueInRange({
    startLineNumber: action?.position.startLineNumber + 1,
    endLineNumber: position.lineNumber,
    startColumn: 1,
    endColumn: position.column,
  });
  const queryAction = action.path.split('/')?.pop()?.replace(/\?.*/g, '');

  if (!queryAction) {
    return;
  }

  const queryTreePath = getQueryTreePath(actionBlockContent);
  const dsqlSubTree = getSubDsqlTree(queryAction, queryTreePath);
  if (!dsqlSubTree) {
    return;
  }

  const suggestions = Object.entries(dsqlSubTree?.children ?? {})
    .filter(([key]) => key !== '*')
    .map(([, value]) => ({
      label: value.label,
      kind: monaco.languages.CompletionItemKind.Keyword,
      ...{
        insertText: closureIndex < 0 ? value.snippet : value.label,
        insertTextRules:
          closureIndex < 0
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : monaco.languages.CompletionItemInsertTextRule.None,
        range:
          closureIndex < 0
            ? undefined
            : new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                closureIndex,
              ),
      },
    }));

  return { suggestions };
};

const isReplaceCompletion = (lineContent: string, textUntilPosition: string) => {
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

  const methodCompletions = providePathCompletionItems(textUntilPosition);
  if (methodCompletions) {
    return methodCompletions;
  }

  const keywordCompletions = provideQDSLCompletionItems(
    textUntilPosition,
    lineContent,
    position,
    model,
  );

  if (keywordCompletions) {
    return keywordCompletions;
  }
};

export { searchCompletionProvider };
