import { editor, IRange, languages, Position } from 'monaco-editor';
import {
  crudMethods,
  aggregationMethods,
  indexMethods,
  collectionManagementMethods,
  cursorMethods,
  aggregationStages,
  aggregationOperators,
  queryOperators,
  updateOperators,
  shellCommands,
  showSubcommands,
  bsonTypes,
  sortValues,
  mongoGlobalObjects,
} from './keywords';
import { getMongoDynamicOptions } from './index';

const createCompletionItem = (
  label: string,
  kind: languages.CompletionItemKind,
  detail: string,
  insertText?: string,
  documentation?: string,
  range?: IRange,
): languages.CompletionItem => ({
  label,
  kind,
  detail,
  insertText: insertText ?? label,
  documentation,
  insertTextRules: languages.CompletionItemInsertTextRule.InsertAsSnippet,
  range: range as IRange,
});

export const analyzeMongoContext = (
  textBefore: string,
): {
  afterDot: boolean;
  afterDb: boolean;
  afterCollection: boolean;
  inAggregation: boolean;
  afterShow: boolean;
  afterUse: boolean;
  needsOperator: boolean;
  inQuery: boolean;
  inUpdate: boolean;
  inPipeline: boolean;
} => {
  const trimmed = textBefore.trim();
  const lastDotIndex = trimmed.lastIndexOf('.');
  const textAfterLastDot = lastDotIndex >= 0 ? trimmed.substring(lastDotIndex + 1) : '';

  return {
    afterDot: lastDotIndex >= 0 && textAfterLastDot.length === 0,
    afterDb: /^db\s*\.?\s*$/.test(trimmed),
    afterCollection: /db\.\w+\.\s*$/.test(trimmed),
    inAggregation:
      trimmed.includes('$group') || trimmed.includes('$match') || trimmed.includes('$project'),
    afterShow: /^\s*show\s*$/i.test(trimmed),
    afterUse: /^\s*use\s*$/i.test(trimmed),
    needsOperator: /\{\s*["']?\w*["']?\s*$/.test(trimmed) && !trimmed.includes('$'),
    inQuery: /find\s*\(\s*\{?\s*$/.test(trimmed) || /findOne\s*\(\s*\{?\s*$/.test(trimmed),
    inUpdate: /update(One|Many)\s*\(\s*[^,]+,\s*\{?\s*$/.test(trimmed),
    inPipeline: /aggregate\s*\(\s*\[\s*\{?\s*$/.test(trimmed),
  };
};

export const mongodbCompletionProvider = (
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

  const context = analyzeMongoContext(textBefore);
  const dynamicOptions = getMongoDynamicOptions();

  if (context.afterShow) {
    showSubcommands.forEach(cmd => {
      suggestions.push(
        createCompletionItem(
          cmd,
          languages.CompletionItemKind.Keyword,
          'Show command',
          cmd,
          `Show ${cmd}`,
          range,
        ),
      );
    });
    return { suggestions };
  }

  if (context.afterUse) {
    (dynamicOptions.databaseNames ?? []).forEach(db => {
      suggestions.push(
        createCompletionItem(
          db,
          languages.CompletionItemKind.Module,
          'Database',
          `"${db}"`,
          `Switch to database: ${db}`,
          range,
        ),
      );
    });
    return { suggestions };
  }

  if (context.afterDb) {
    const collections = dynamicOptions.collectionNames ?? [];
    collections.forEach(col => {
      suggestions.push(
        createCompletionItem(
          col,
          languages.CompletionItemKind.Struct,
          'Collection',
          col,
          `Collection: ${col}`,
          range,
        ),
      );
    });
    return { suggestions };
  }

  if (context.afterCollection) {
    const addMethod = (methods: string[], kind: languages.CompletionItemKind, detail: string) => {
      methods.forEach(method => {
        suggestions.push(
          createCompletionItem(method, kind, detail, `${method}($1)`, undefined, range),
        );
      });
    };

    addMethod(crudMethods, languages.CompletionItemKind.Method, 'CRUD');
    addMethod(aggregationMethods, languages.CompletionItemKind.Method, 'Aggregation');
    addMethod(indexMethods, languages.CompletionItemKind.Method, 'Index');
    addMethod(collectionManagementMethods, languages.CompletionItemKind.Method, 'Management');
    addMethod(cursorMethods, languages.CompletionItemKind.Property, 'Cursor');
    return { suggestions };
  }

  if (context.inPipeline) {
    aggregationStages.forEach(stage => {
      suggestions.push(
        createCompletionItem(
          stage,
          languages.CompletionItemKind.Keyword,
          'Pipeline Stage',
          `{ "${stage}": $1 }`,
          undefined,
          range,
        ),
      );
    });
    return { suggestions };
  }

  if (context.inUpdate) {
    updateOperators.forEach(op => {
      suggestions.push(
        createCompletionItem(
          op,
          languages.CompletionItemKind.Operator,
          'Update Operator',
          `"${op}": $1`,
          undefined,
          range,
        ),
      );
    });
    return { suggestions };
  }

  if (context.inQuery || context.needsOperator) {
    queryOperators.forEach(op => {
      suggestions.push(
        createCompletionItem(
          op,
          languages.CompletionItemKind.Operator,
          'Query Operator',
          `"${op}"`,
          undefined,
          range,
        ),
      );
    });
    return { suggestions };
  }

  if (context.inAggregation) {
    aggregationOperators.forEach(op => {
      suggestions.push(
        createCompletionItem(
          op,
          languages.CompletionItemKind.Operator,
          'Aggregation Operator',
          `"${op}"`,
          undefined,
          range,
        ),
      );
    });
    return { suggestions };
  }

  mongoGlobalObjects.forEach(obj => {
    suggestions.push(
      createCompletionItem(
        obj,
        languages.CompletionItemKind.Variable,
        'MongoDB Shell',
        obj,
        undefined,
        range,
      ),
    );
  });

  shellCommands.forEach(cmd => {
    suggestions.push(
      createCompletionItem(
        cmd,
        languages.CompletionItemKind.Keyword,
        'Shell Command',
        cmd,
        undefined,
        range,
      ),
    );
  });

  sortValues.forEach(val => {
    suggestions.push(
      createCompletionItem(
        val,
        languages.CompletionItemKind.Enum,
        'Sort Order',
        val,
        undefined,
        range,
      ),
    );
  });

  bsonTypes.forEach(type => {
    suggestions.push(
      createCompletionItem(
        type,
        languages.CompletionItemKind.TypeParameter,
        'BSON Type',
        type,
        undefined,
        range,
      ),
    );
  });

  return { suggestions };
};
