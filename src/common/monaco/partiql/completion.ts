import { editor, IRange, languages, Position } from 'monaco-editor';
import { partiqlKeywordCategories } from './keywords';
import { getPartiqlDynamicOptions } from '../monacoUtils';

const createCompletionItem = (
  label: string,
  kind: languages.CompletionItemKind,
  detail: string,
  insertText?: string,
  range?: IRange,
): languages.CompletionItem => ({
  label,
  kind,
  detail,
  insertText: insertText ?? label,
  insertTextRules: languages.CompletionItemInsertTextRule.InsertAsSnippet,
  range: range as IRange,
});

const analyzeContext = (
  textBefore: string,
): {
  needsKeyword: boolean;
  afterFrom: boolean;
  afterWhere: boolean;
  afterSelect: boolean;
  afterInsert: boolean;
  afterUpdate: boolean;
  afterSet: boolean;
} => {
  const upperText = textBefore.toUpperCase().trim();
  const words = upperText.split(/\s+/);
  const lastWord = words[words.length - 1] || '';

  const lastFromIndex = upperText.lastIndexOf('FROM');
  const lastWhereIndex = upperText.lastIndexOf('WHERE');
  const lastSelectIndex = upperText.lastIndexOf('SELECT');

  return {
    needsKeyword: !lastWord || /^[A-Z]*$/i.test(lastWord),
    afterFrom: lastFromIndex > -1 && (lastWhereIndex === -1 || lastFromIndex > lastWhereIndex),
    afterWhere: lastWhereIndex > -1 && lastWhereIndex > lastFromIndex,
    afterSelect: lastSelectIndex > -1 && (lastFromIndex === -1 || lastSelectIndex > lastFromIndex),
    afterInsert: upperText.includes('INSERT INTO') && !upperText.includes('VALUE'),
    afterUpdate: upperText.includes('UPDATE') && !upperText.includes('SET'),
    afterSet:
      upperText.includes('SET') ||
      (upperText.includes('REMOVE') &&
        upperText.lastIndexOf('SET') < upperText.lastIndexOf('REMOVE')),
  };
};

export const partiqlCompletionProvider = (
  model: editor.ITextModel,
  position: Position,
): languages.CompletionList => {
  const suggestions: languages.CompletionItem[] = [];
  const word = model.getWordUntilPosition(position);
  const range: IRange = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };

  const textBefore = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });

  const context = analyzeContext(textBefore);
  const dynamicOptions = getPartiqlDynamicOptions();

  if (context.needsKeyword) {
    partiqlKeywordCategories.dml.forEach(keyword => {
      suggestions.push(
        createCompletionItem(
          keyword,
          languages.CompletionItemKind.Keyword,
          'PartiQL DML keyword',
          keyword + ' ',
          range,
        ),
      );
    });

    partiqlKeywordCategories.clauses.forEach(keyword => {
      suggestions.push(
        createCompletionItem(
          keyword,
          languages.CompletionItemKind.Keyword,
          'PartiQL clause',
          keyword + ' ',
          range,
        ),
      );
    });
  }

  if (context.afterFrom || context.afterInsert || context.afterUpdate) {
    if (dynamicOptions.tableNames) {
      dynamicOptions.tableNames.forEach(tableName => {
        suggestions.push(
          createCompletionItem(
            tableName,
            languages.CompletionItemKind.Class,
            'DynamoDB Table',
            `"${tableName}"`,
            range,
          ),
        );
      });
    }
    if (dynamicOptions.activeTable) {
      suggestions.push(
        createCompletionItem(
          dynamicOptions.activeTable,
          languages.CompletionItemKind.Class,
          'Active Table',
          `"${dynamicOptions.activeTable}"`,
          range,
        ),
      );
    }
  }

  if (context.afterSelect || context.afterWhere || context.afterSet) {
    if (dynamicOptions.attributeKeys) {
      dynamicOptions.attributeKeys.forEach(attrKey => {
        suggestions.push(
          createCompletionItem(
            attrKey,
            languages.CompletionItemKind.Field,
            'Table Attribute',
            `"${attrKey}"`,
            range,
          ),
        );
      });
    }
  }

  partiqlKeywordCategories.functions.forEach(fn => {
    suggestions.push(
      createCompletionItem(
        fn,
        languages.CompletionItemKind.Function,
        'PartiQL function',
        fn + '($0)',
        range,
      ),
    );
  });

  partiqlKeywordCategories.dataTypes.forEach(type => {
    suggestions.push(
      createCompletionItem(
        type,
        languages.CompletionItemKind.TypeParameter,
        'Data type',
        type,
        range,
      ),
    );
  });

  return { suggestions };
};
