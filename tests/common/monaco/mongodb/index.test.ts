import {
  registerMongodbLanguage,
  mongoSampleQueries,
  setMongoDynamicOptions,
  getMongoDynamicOptions,
  validateMongoModel,
  clearMongoValidation,
  createMongoDebouncedValidator,
  mongodb,
} from '../../../../src/common/monaco/mongodb/index';

jest.mock('monaco-editor', () => ({
  self: { MonacoEnvironment: {} },
  editor: {
    setModelMarkers: jest.fn(),
  },
  languages: {
    register: jest.fn(),
    setMonarchTokensProvider: jest.fn(),
    setLanguageConfiguration: jest.fn(),
    registerCompletionItemProvider: jest.fn(),
    CompletionItemKind: {},
    CompletionItemInsertTextRule: {},
  },
  Range: {},
  Position: {},
  MarkerSeverity: {
    Error: 8,
    Warning: 4,
  },
}));

describe('MongoDB Language Registration', () => {
  describe('mongodb language definition', () => {
    it('should have mongodb id', () => {
      expect(mongodb.id).toBe('mongodb');
    });

    it('should have rules', () => {
      expect(mongodb.rules).toBeDefined();
    });

    it('should have languageConfiguration', () => {
      expect(mongodb.languageConfiguration).toBeDefined();
    });

    it('should have tokenizer in rules', () => {
      expect(mongodb.rules.tokenizer).toBeDefined();
    });

    it('should have keywords in rules', () => {
      expect(mongodb.rules.keywords).toBeDefined();
      expect(Array.isArray(mongodb.rules.keywords)).toBe(true);
    });

    it('should have mongoGlobals in rules', () => {
      expect(mongodb.rules.mongoGlobals).toBeDefined();
      expect(Array.isArray(mongodb.rules.mongoGlobals)).toBe(true);
    });

    it('should have mongoMethods in rules', () => {
      expect(mongodb.rules.mongoMethods).toBeDefined();
      expect(Array.isArray(mongodb.rules.mongoMethods)).toBe(true);
    });

    it('should have aggregationStages in rules', () => {
      expect(mongodb.rules.aggregationStages).toBeDefined();
      expect(Array.isArray(mongodb.rules.aggregationStages)).toBe(true);
    });

    it('should have comments configuration', () => {
      expect(mongodb.languageConfiguration.comments).toBeDefined();
      expect(mongodb.languageConfiguration.comments.lineComment).toBe('//');
      expect(mongodb.languageConfiguration.comments.blockComment).toEqual(['/*', '*/']);
    });

    it('should have brackets configuration', () => {
      expect(mongodb.languageConfiguration.brackets).toBeDefined();
      expect(mongodb.languageConfiguration.brackets).toContainEqual(['{', '}']);
      expect(mongodb.languageConfiguration.brackets).toContainEqual(['[', ']']);
      expect(mongodb.languageConfiguration.brackets).toContainEqual(['(', ')']);
    });

    it('should have autoClosingPairs configuration', () => {
      expect(mongodb.languageConfiguration.autoClosingPairs).toBeDefined();
      expect(mongodb.languageConfiguration.autoClosingPairs.length).toBeGreaterThan(0);
    });

    it('should have surroundingPairs configuration', () => {
      expect(mongodb.languageConfiguration.surroundingPairs).toBeDefined();
      expect(mongodb.languageConfiguration.surroundingPairs.length).toBeGreaterThan(0);
    });
  });

  describe('registerMongodbLanguage', () => {
    it('should register the language', () => {
      const mockMonaco = {
        languages: {
          register: jest.fn(),
          setMonarchTokensProvider: jest.fn(),
          setLanguageConfiguration: jest.fn(),
          registerCompletionItemProvider: jest.fn(),
        },
      };

      registerMongodbLanguage(mockMonaco as any);

      expect(mockMonaco.languages.register).toHaveBeenCalledWith({ id: 'mongodb' });
    });

    it('should set monarch tokens provider', () => {
      const mockMonaco = {
        languages: {
          register: jest.fn(),
          setMonarchTokensProvider: jest.fn(),
          setLanguageConfiguration: jest.fn(),
          registerCompletionItemProvider: jest.fn(),
        },
      };

      registerMongodbLanguage(mockMonaco as any);

      expect(mockMonaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith(
        'mongodb',
        expect.any(Object),
      );
    });

    it('should set language configuration', () => {
      const mockMonaco = {
        languages: {
          register: jest.fn(),
          setMonarchTokensProvider: jest.fn(),
          setLanguageConfiguration: jest.fn(),
          registerCompletionItemProvider: jest.fn(),
        },
      };

      registerMongodbLanguage(mockMonaco as any);

      expect(mockMonaco.languages.setLanguageConfiguration).toHaveBeenCalledWith(
        'mongodb',
        expect.any(Object),
      );
    });

    it('should register completion item provider', () => {
      const mockMonaco = {
        languages: {
          register: jest.fn(),
          setMonarchTokensProvider: jest.fn(),
          setLanguageConfiguration: jest.fn(),
          registerCompletionItemProvider: jest.fn(),
        },
      };

      registerMongodbLanguage(mockMonaco as any);

      expect(mockMonaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith(
        'mongodb',
        expect.objectContaining({
          triggerCharacters: expect.any(Array),
          provideCompletionItems: expect.any(Function),
        }),
      );
    });
  });

  describe('setMongoDynamicOptions', () => {
    beforeEach(() => {
      setMongoDynamicOptions({});
    });

    it('should set collection names', () => {
      setMongoDynamicOptions({ collectionNames: ['users', 'orders'] });
      const options = getMongoDynamicOptions();
      expect(options.collectionNames).toEqual(['users', 'orders']);
    });

    it('should set database names', () => {
      setMongoDynamicOptions({ databaseNames: ['mydb', 'testdb'] });
      const options = getMongoDynamicOptions();
      expect(options.databaseNames).toEqual(['mydb', 'testdb']);
    });

    it('should set active collection', () => {
      setMongoDynamicOptions({ activeCollection: 'users' });
      const options = getMongoDynamicOptions();
      expect(options.activeCollection).toBe('users');
    });

    it('should handle empty options', () => {
      setMongoDynamicOptions({});
      const options = getMongoDynamicOptions();
      expect(options.collectionNames).toBeUndefined();
      expect(options.databaseNames).toBeUndefined();
      expect(options.activeCollection).toBeUndefined();
    });
  });

  describe('getMongoDynamicOptions', () => {
    beforeEach(() => {
      setMongoDynamicOptions({});
    });

    it('should return empty options by default', () => {
      const options = getMongoDynamicOptions();
      expect(options).toEqual({});
    });

    it('should return previously set options', () => {
      setMongoDynamicOptions({
        collectionNames: ['col1'],
        databaseNames: ['db1'],
        activeCollection: 'col1',
      });

      const options = getMongoDynamicOptions();
      expect(options.collectionNames).toEqual(['col1']);
      expect(options.databaseNames).toEqual(['db1']);
      expect(options.activeCollection).toBe('col1');
    });
  });

  describe('mongoSampleQueries', () => {
    it('should have all required sample queries', () => {
      const requiredQueries = [
        'findAll',
        'findOne',
        'findWithFilter',
        'aggregate',
        'countDocuments',
        'insertOne',
        'insertMany',
        'updateOne',
        'updateMany',
        'deleteOne',
        'deleteMany',
        'createIndex',
        'distinct',
        'bulkWrite',
      ];

      requiredQueries.forEach(query => {
        expect(mongoSampleQueries[query as keyof typeof mongoSampleQueries]).toBeDefined();
      });
    });

    it('should have valid MongoDB shell syntax in all samples', () => {
      Object.entries(mongoSampleQueries).forEach(([key, query]) => {
        expect(query).toBeDefined();
        expect(typeof query).toBe('string');
        expect(query.length).toBeGreaterThan(0);
        expect(query).toContain('db.');
      });
    });
  });

  describe('createMongoDebouncedValidator', () => {
    it('should return a function', () => {
      const validator = createMongoDebouncedValidator();
      expect(typeof validator).toBe('function');
    });
  });
});
