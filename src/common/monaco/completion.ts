import * as monaco from 'monaco-editor';
import { dsql, getSubDsqlTree } from './keywords.ts';
import { searchTokens } from './tokenlizer.ts';

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

const getQueryTreePath = (actionBlockContent: string) => {
  const pathStack: string[] = [];
  actionBlockContent
    .replace(/['"]/g, '')
    .split(/[{\[]/)
    .forEach(conten => {
      if (conten.trim().match(/[\w.]+:$/)) {
        pathStack.push(conten.trim());
      } else if (conten.trim().match(/[}\]]/)) {
        pathStack.pop();
      }
    });

  return pathStack.map(path => path.replace(/:$/, ''));
  /**
   * {
   *   "version": true,
   *   "query": {
   *    "bool": {
   *      "must_not": [
   *        {}
   *      ],
   *
   *      "must": [
   *        {
   *          "match": {
   *
   */
};

const provideQDSLCompletionItems = (
  textUntilPosition: string,
  lineContent: string,
  position: monaco.Position,
  model: monaco.editor.ITextModel,
) => {
  const word = textUntilPosition.split(/[ /]+/).pop() || '';
  const closureIndex = isReplaceCompletion(lineContent, textUntilPosition);
  console.log('closureIndex', { closureIndex, word, textUntilPosition, lineContent });

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
  const queryTreePath = getQueryTreePath(actionBlockContent);
  const queryAction = action.path.split('/')?.pop()?.replace(/\?.*/g, '');

  if (!queryAction) {
    return;
  }

  const dsqlSubTree = getSubDsqlTree(queryAction, queryTreePath);
  if (!dsqlSubTree) {
    return;
  }

  const suggestions = Object.entries(dsqlSubTree.children).map(([, value]) => ({
    label: value.label,
    kind: monaco.languages.CompletionItemKind.Keyword,
    ...{
      insertText: closureIndex === -1 ? value.snippet : value.label,
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

  // const suggestions = keywords
  //   .filter(keyword => keyword.startsWith(word))
  //   .map(keyword => ({
  //     label: keyword,
  //     insertText: keyword,
  //     kind: monaco.languages.CompletionItemKind.Keyword,
  //     ...{
  //       insertTextRules:
  //         closureIndex === -1
  //           ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
  //           : monaco.languages.CompletionItemInsertTextRule.None,
  //       range:
  //         closureIndex === -1
  //           ? undefined
  //           : new monaco.Range(
  //               position.lineNumber,
  //               position.column - 1,
  //               position.lineNumber,
  //               closureIndex,
  //             ),
  //     },
  //   }));

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
  console.log('searchCompletionProvider', { textUntilPosition, lineContent });

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
//
// const searchResolveCompletionItem = (item: monaco.languages.CompletionItem) => {
//   console.log('searchResolveCompletionItem', item);
//   if (item.insertTextRules !== monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet) {
//     return item;
//   }
//
//   return {
//     ...item,
//     insertText: `${item.insertText}: {\n\t$0\n},`,
//   };
// };

export { searchCompletionProvider };
