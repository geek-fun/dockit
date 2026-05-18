import { editor, Position } from 'monaco-editor';
import {
  analyzeMongoContext,
  mongodbCompletionProvider,
} from '../../../../src/common/monaco/mongodb/completion';
import { setMongoDynamicOptions } from '../../../../src/common/monaco/mongodb/index';

jest.mock('monaco-editor', () => ({
  self: { MonacoEnvironment: {} },
  editor: {},
  languages: {
    CompletionItemKind: {
      Method: 1,
      Function: 2,
      Constructor: 3,
      Field: 4,
      Variable: 5,
      Class: 6,
      Interface: 7,
      Module: 8,
      Property: 9,
      Unit: 10,
      Value: 11,
      Enum: 12,
      Keyword: 13,
      Snippet: 14,
      Color: 15,
      File: 16,
      Reference: 17,
      Folder: 18,
      EnumMember: 19,
      Constant: 20,
      Struct: 21,
      Event: 22,
      Operator: 23,
      TypeParameter: 24,
    },
    CompletionItemInsertTextRule: {
      None: 0,
      KeepWhitespace: 1,
      InsertAsSnippet: 4,
    },
  },
  Range: class MockRange {
    constructor(
      public _startLineNumber: number,
      public _startColumn: number,
      public _endLineNumber: number,
      public _endColumn: number,
    ) {}
  },
  Position: class MockPosition {
    constructor(
      public _lineNumber: number,
      public _column: number,
    ) {}
  },
  MarkerSeverity: {
    Error: 8,
    Warning: 4,
    Info: 2,
    Hint: 1,
  },
}));

const createMockModel = (textBefore: string, wordAtPosition?: string): editor.ITextModel =>
  ({
    getValueInRange: jest.fn().mockReturnValue(textBefore),
    getWordUntilPosition: jest.fn().mockReturnValue({
      word: wordAtPosition || '',
      startColumn: 1,
      endColumn: (wordAtPosition || '').length + 1,
    }),
    getValue: jest.fn().mockReturnValue(textBefore),
    getLineContent: jest.fn().mockReturnValue(''),
    getLineCount: jest.fn().mockReturnValue(1),
    getLineMaxColumn: jest.fn().mockReturnValue(100),
    uri: { toString: () => 'test-model-uri' },
  }) as unknown as editor.ITextModel;

const createMockPosition = (line: number, column: number): Position =>
  ({
    lineNumber: line,
    column,
  }) as Position;

describe('MongoDB Completion Provider', () => {
  beforeEach(() => {
    setMongoDynamicOptions('test-model-uri', {});
  });

  describe('analyzeMongoContext', () => {
    it('should detect afterDot context', () => {
      const context = analyzeMongoContext('db.');
      expect(context.afterDot).toBe(true);
    });

    it('should detect afterDb context', () => {
      const context = analyzeMongoContext('db');
      expect(context.afterDb).toBe(true);
    });

    it('should detect afterCollection context', () => {
      const context = analyzeMongoContext('db.users.');
      expect(context.afterCollection).toBe(true);
    });

    it('should detect afterShow context', () => {
      const context = analyzeMongoContext('show ');
      expect(context.afterShow).toBe(true);
    });

    it('should detect afterUse context', () => {
      const context = analyzeMongoContext('use ');
      expect(context.afterUse).toBe(true);
    });

    it('should detect inQuery context for find', () => {
      const context = analyzeMongoContext('db.users.find(');
      expect(context.inQuery).toBe(true);
    });

    it('should detect inQuery context for findOne', () => {
      const context = analyzeMongoContext('db.users.findOne(');
      expect(context.inQuery).toBe(true);
    });

    it('should detect inUpdate context', () => {
      const context = analyzeMongoContext('db.users.updateOne({_id: 1}, ');
      expect(context.inUpdate).toBe(true);
    });

    it('should detect inPipeline context', () => {
      const context = analyzeMongoContext('db.users.aggregate([');
      expect(context.inPipeline).toBe(true);
    });

    it('should detect inAggregation context', () => {
      const context = analyzeMongoContext('{$group: {_id: "$category"}}');
      expect(context.inAggregation).toBe(true);
    });

    it('should return false for all contexts when empty', () => {
      const context = analyzeMongoContext('');
      expect(context.afterDot).toBe(false);
      expect(context.afterDb).toBe(false);
      expect(context.afterCollection).toBe(false);
      expect(context.afterShow).toBe(false);
      expect(context.afterUse).toBe(false);
      expect(context.inQuery).toBe(false);
      expect(context.inUpdate).toBe(false);
      expect(context.inPipeline).toBe(false);
      expect(context.inAggregation).toBe(false);
    });
  });

  describe('mongodbCompletionProvider', () => {
    it('should return show subcommands after show keyword', () => {
      const model = createMockModel('show ');
      const position = createMockPosition(1, 6);
      const result = mongodbCompletionProvider(model, position);

      expect(result.suggestions.length).toBeGreaterThan(0);
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('dbs');
      expect(labels).toContain('collections');
    });

    it('should return database names after use keyword', () => {
      setMongoDynamicOptions('test-model-uri', { databaseNames: ['mydb', 'testdb'] });
      const model = createMockModel('use ');
      const position = createMockPosition(1, 5);
      const result = mongodbCompletionProvider(model, position);

      expect(result.suggestions.length).toBeGreaterThan(0);
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('mydb');
      expect(labels).toContain('testdb');
    });

    it('should return collection names after db.', () => {
      setMongoDynamicOptions('test-model-uri', { collectionNames: ['users', 'orders'] });
      const model = createMockModel('db.');
      const position = createMockPosition(1, 4);
      const result = mongodbCompletionProvider(model, position);

      expect(result.suggestions.length).toBeGreaterThan(0);
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('users');
      expect(labels).toContain('orders');
    });

    it('should return collection methods after db.collection.', () => {
      const model = createMockModel('db.users.');
      const position = createMockPosition(1, 10);
      const result = mongodbCompletionProvider(model, position);

      expect(result.suggestions.length).toBeGreaterThan(0);
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('find');
      expect(labels).toContain('findOne');
      expect(labels).toContain('insertOne');
      expect(labels).toContain('aggregate');
    });

    it('should return aggregation stages in pipeline', () => {
      const model = createMockModel('db.users.aggregate([{');
      const position = createMockPosition(1, 22);
      const result = mongodbCompletionProvider(model, position);

      expect(result.suggestions.length).toBeGreaterThan(0);
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('$match');
      expect(labels).toContain('$group');
      expect(labels).toContain('$sort');
    });

    it('should return query operators in find query', () => {
      const model = createMockModel('db.users.find({');
      const position = createMockPosition(1, 16);
      const result = mongodbCompletionProvider(model, position);

      expect(result.suggestions.length).toBeGreaterThan(0);
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('$eq');
      expect(labels).toContain('$gt');
      expect(labels).toContain('$in');
    });

    it('should return update operators in update operation', () => {
      const model = createMockModel('db.users.updateOne({_id: 1}, {');
      const position = createMockPosition(1, 30);
      const result = mongodbCompletionProvider(model, position);

      expect(result.suggestions.length).toBeGreaterThan(0);
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('$set');
      expect(labels).toContain('$inc');
      expect(labels).toContain('$push');
    });

    it('should return global objects and shell commands by default', () => {
      const model = createMockModel('');
      const position = createMockPosition(1, 1);
      const result = mongodbCompletionProvider(model, position);

      expect(result.suggestions.length).toBeGreaterThan(0);
      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('db');
      expect(labels).toContain('show');
      expect(labels).toContain('use');
    });

    it('should return sort values by default', () => {
      const model = createMockModel('');
      const position = createMockPosition(1, 1);
      const result = mongodbCompletionProvider(model, position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('ascending');
      expect(labels).toContain('descending');
      expect(labels).toContain('asc');
      expect(labels).toContain('desc');
    });

    it('should return BSON types by default', () => {
      const model = createMockModel('');
      const position = createMockPosition(1, 1);
      const result = mongodbCompletionProvider(model, position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('string');
      expect(labels).toContain('int');
      expect(labels).toContain('objectId');
      expect(labels).toContain('date');
    });

    it('should handle dynamic options for collections', () => {
      setMongoDynamicOptions('test-model-uri', { collectionNames: ['products', 'categories'] });
      const model = createMockModel('db.');
      const position = createMockPosition(1, 4);
      const result = mongodbCompletionProvider(model, position);

      const labels = result.suggestions.map(s => s.label);
      expect(labels).toContain('products');
      expect(labels).toContain('categories');
    });

    it('should handle empty dynamic options', () => {
      setMongoDynamicOptions('empty-test-uri', {});
      const position = createMockPosition(1, 4);
      const result = mongodbCompletionProvider(
        {
          ...createMockModel('db.'),
          uri: { toString: () => 'empty-test-uri' },
        } as editor.ITextModel,
        position,
      );

      expect(result.suggestions).toEqual([]);
    });
  });
});
