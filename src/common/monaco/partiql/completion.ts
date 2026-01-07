/**
 * PartiQL Completion Provider
 * Provides intelligent autocomplete for PartiQL queries in DynamoDB
 */

import * as monaco from 'monaco-editor';
import { partiqlKeywordCategories } from './keywords';
import { getPartiqlDynamicOptions } from './utils';

// Re-export utilities from utils.ts
export {
  setPartiqlDynamicOptions,
  getPartiqlDynamicOptions,
  partiqlSampleQueries,
} from './utils';
export type { PartiqlDynamicOptions } from './utils';

/**
 * Create a completion item
 */
const createCompletionItem = (
  label: string,
  kind: monaco.languages.CompletionItemKind,
  detail: string,
  insertText?: string,
  range?: monaco.IRange,
): monaco.languages.CompletionItem => ({
  label,
  kind,
  detail,
  insertText: insertText ?? label,
  insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
  range: range as monaco.IRange,
});

/**
 * Analyze the context to determine what completions to provide
 */
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

  return {
    needsKeyword: !lastWord || /^[A-Z]*$/i.test(lastWord),
    afterFrom: upperText.includes('FROM') && !upperText.includes('WHERE'),
    afterWhere:
      upperText.includes('WHERE') ||
      (upperText.includes('AND') && upperText.lastIndexOf('AND') > upperText.lastIndexOf('FROM')),
    afterSelect: upperText.includes('SELECT') && !upperText.includes('FROM'),
    afterInsert: upperText.includes('INSERT INTO') && !upperText.includes('VALUE'),
    afterUpdate: upperText.includes('UPDATE') && !upperText.includes('SET'),
    afterSet:
      upperText.includes('SET') ||
      (upperText.includes('REMOVE') && upperText.lastIndexOf('SET') < upperText.lastIndexOf('REMOVE')),
  };
};

/**
 * PartiQL completion provider for Monaco Editor
 */
export const partiqlCompletionProvider = (
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): monaco.languages.CompletionList => {
  const suggestions: monaco.languages.CompletionItem[] = [];
  const word = model.getWordUntilPosition(position);
  const range: monaco.IRange = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };

  // Get text before cursor for context analysis
  const textBefore = model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  });

  const context = analyzeContext(textBefore);
  const dynamicOptions = getPartiqlDynamicOptions();

  // DML keywords
  if (context.needsKeyword) {
    partiqlKeywordCategories.dml.forEach(keyword => {
      suggestions.push(
        createCompletionItem(
          keyword,
          monaco.languages.CompletionItemKind.Keyword,
          'PartiQL DML keyword',
          keyword + ' ',
          range,
        ),
      );
    });

    // Clause keywords
    partiqlKeywordCategories.clauses.forEach(keyword => {
      suggestions.push(
        createCompletionItem(
          keyword,
          monaco.languages.CompletionItemKind.Keyword,
          'PartiQL clause',
          keyword + ' ',
          range,
        ),
      );
    });
  }

  // Table names after FROM, INSERT INTO, UPDATE
  if (context.afterFrom || context.afterInsert || context.afterUpdate) {
    if (dynamicOptions.tableNames) {
      dynamicOptions.tableNames.forEach(tableName => {
        suggestions.push(
          createCompletionItem(
            tableName,
            monaco.languages.CompletionItemKind.Class,
            'DynamoDB Table',
            `"${tableName}"`,
            range,
          ),
        );
      });
    }
    // Also suggest active table if set
    if (dynamicOptions.activeTable) {
      suggestions.push(
        createCompletionItem(
          dynamicOptions.activeTable,
          monaco.languages.CompletionItemKind.Class,
          'Active Table',
          `"${dynamicOptions.activeTable}"`,
          range,
        ),
      );
    }
  }

  // Attribute keys after SELECT or WHERE or SET
  if (context.afterSelect || context.afterWhere || context.afterSet) {
    if (dynamicOptions.attributeKeys) {
      dynamicOptions.attributeKeys.forEach(attrKey => {
        suggestions.push(
          createCompletionItem(
            attrKey,
            monaco.languages.CompletionItemKind.Field,
            'Table Attribute',
            `"${attrKey}"`,
            range,
          ),
        );
      });
    }
  }

  // Functions
  partiqlKeywordCategories.functions.forEach(fn => {
    suggestions.push(
      createCompletionItem(
        fn,
        monaco.languages.CompletionItemKind.Function,
        'PartiQL function',
        fn + '($0)',
        range,
      ),
    );
  });

  // Data types for type checking functions
  partiqlKeywordCategories.dataTypes.forEach(type => {
    suggestions.push(
      createCompletionItem(
        type,
        monaco.languages.CompletionItemKind.TypeParameter,
        'Data type',
        type,
        range,
      ),
    );
  });

  return { suggestions };
};
