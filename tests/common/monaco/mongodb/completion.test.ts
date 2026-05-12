import {
  setMongoDynamicOptions,
  getMongoDynamicOptions,
  mongoSampleQueries,
} from '../../../../src/common/monaco/mongodb/index';

jest.mock('monaco-editor', () => ({
  self: { MonacoEnvironment: {} },
  editor: {},
  languages: {
    register: jest.fn(),
    setMonarchTokensProvider: jest.fn(),
    setLanguageConfiguration: jest.fn(),
    registerCompletionItemProvider: jest.fn(),
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
  Range: {},
  Position: {},
  MarkerSeverity: {},
}));

describe('MongoDB Completion', () => {
  describe('Dynamic Options', () => {
    beforeEach(() => {
      setMongoDynamicOptions({});
    });

    it('should set and get dynamic options', () => {
      const options = {
        collectionNames: ['users', 'orders', 'products'],
        databaseNames: ['mydb', 'testdb'],
        activeCollection: 'users',
      };

      setMongoDynamicOptions(options);
      const result = getMongoDynamicOptions();

      expect(result.collectionNames).toEqual(['users', 'orders', 'products']);
      expect(result.databaseNames).toEqual(['mydb', 'testdb']);
      expect(result.activeCollection).toBe('users');
    });

    it('should handle empty options', () => {
      setMongoDynamicOptions({});
      const result = getMongoDynamicOptions();

      expect(result.collectionNames).toBeUndefined();
      expect(result.databaseNames).toBeUndefined();
      expect(result.activeCollection).toBeUndefined();
    });

    it('should overwrite previous options', () => {
      setMongoDynamicOptions({
        collectionNames: ['col1'],
        activeCollection: 'col1',
      });

      setMongoDynamicOptions({
        collectionNames: ['col2', 'col3'],
        activeCollection: 'col2',
      });

      const result = getMongoDynamicOptions();
      expect(result.collectionNames).toEqual(['col2', 'col3']);
      expect(result.activeCollection).toBe('col2');
    });

    it('should handle partial options', () => {
      setMongoDynamicOptions({
        collectionNames: ['users'],
      });

      const result = getMongoDynamicOptions();
      expect(result.collectionNames).toEqual(['users']);
      expect(result.databaseNames).toBeUndefined();
      expect(result.activeCollection).toBeUndefined();
    });
  });

  describe('Sample Queries', () => {
    it('should have findAll sample', () => {
      expect(mongoSampleQueries.findAll).toBeDefined();
      expect(mongoSampleQueries.findAll).toContain('db.collection.find');
      expect(mongoSampleQueries.findAll).toContain('.limit');
    });

    it('should have findOne sample', () => {
      expect(mongoSampleQueries.findOne).toBeDefined();
      expect(mongoSampleQueries.findOne).toContain('db.collection.findOne');
      expect(mongoSampleQueries.findOne).toContain('ObjectId');
    });

    it('should have findWithFilter sample', () => {
      expect(mongoSampleQueries.findWithFilter).toBeDefined();
      expect(mongoSampleQueries.findWithFilter).toContain('db.collection.find');
      expect(mongoSampleQueries.findWithFilter).toContain('$gt');
      expect(mongoSampleQueries.findWithFilter).toContain('.sort');
    });

    it('should have aggregate sample', () => {
      expect(mongoSampleQueries.aggregate).toBeDefined();
      expect(mongoSampleQueries.aggregate).toContain('db.collection.aggregate');
      expect(mongoSampleQueries.aggregate).toContain('$match');
      expect(mongoSampleQueries.aggregate).toContain('$group');
      expect(mongoSampleQueries.aggregate).toContain('$sort');
      expect(mongoSampleQueries.aggregate).toContain('$limit');
    });

    it('should have countDocuments sample', () => {
      expect(mongoSampleQueries.countDocuments).toBeDefined();
      expect(mongoSampleQueries.countDocuments).toContain('db.collection.countDocuments');
    });

    it('should have insertOne sample', () => {
      expect(mongoSampleQueries.insertOne).toBeDefined();
      expect(mongoSampleQueries.insertOne).toContain('db.collection.insertOne');
      expect(mongoSampleQueries.insertOne).toContain('new Date()');
    });

    it('should have insertMany sample', () => {
      expect(mongoSampleQueries.insertMany).toBeDefined();
      expect(mongoSampleQueries.insertMany).toContain('db.collection.insertMany');
    });

    it('should have updateOne sample', () => {
      expect(mongoSampleQueries.updateOne).toBeDefined();
      expect(mongoSampleQueries.updateOne).toContain('db.collection.updateOne');
      expect(mongoSampleQueries.updateOne).toContain('$set');
    });

    it('should have updateMany sample', () => {
      expect(mongoSampleQueries.updateMany).toBeDefined();
      expect(mongoSampleQueries.updateMany).toContain('db.collection.updateMany');
      expect(mongoSampleQueries.updateMany).toContain('$inc');
    });

    it('should have deleteOne sample', () => {
      expect(mongoSampleQueries.deleteOne).toBeDefined();
      expect(mongoSampleQueries.deleteOne).toContain('db.collection.deleteOne');
    });

    it('should have deleteMany sample', () => {
      expect(mongoSampleQueries.deleteMany).toBeDefined();
      expect(mongoSampleQueries.deleteMany).toContain('db.collection.deleteMany');
    });

    it('should have createIndex sample', () => {
      expect(mongoSampleQueries.createIndex).toBeDefined();
      expect(mongoSampleQueries.createIndex).toContain('db.collection.createIndex');
      expect(mongoSampleQueries.createIndex).toContain('unique');
    });

    it('should have distinct sample', () => {
      expect(mongoSampleQueries.distinct).toBeDefined();
      expect(mongoSampleQueries.distinct).toContain('db.collection.distinct');
    });

    it('should have bulkWrite sample', () => {
      expect(mongoSampleQueries.bulkWrite).toBeDefined();
      expect(mongoSampleQueries.bulkWrite).toContain('db.collection.bulkWrite');
      expect(mongoSampleQueries.bulkWrite).toContain('insertOne');
      expect(mongoSampleQueries.bulkWrite).toContain('updateOne');
      expect(mongoSampleQueries.bulkWrite).toContain('deleteOne');
    });

    it('should have valid JavaScript-like syntax in all samples', () => {
      Object.entries(mongoSampleQueries).forEach(([key, query]) => {
        expect(query).toBeDefined();
        expect(query.length).toBeGreaterThan(0);
        expect(query).toContain('db.');
      });
    });
  });
});
