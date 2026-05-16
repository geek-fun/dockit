import { MarkerSeverity } from 'monaco-editor';
import {
  validateBalancedBrackets,
  validateMongoSyntax,
  validateMethodChains,
  MONGO_VALIDATION_OWNER_CONST,
} from '../../../../src/common/monaco/mongodb/validation';

jest.mock('monaco-editor', () => ({
  editor: {
    setModelMarkers: jest.fn(),
  },
  MarkerSeverity: {
    Error: 8,
    Warning: 4,
    Info: 2,
    Hint: 1,
  },
}));

describe('MongoDB Validation', () => {
  describe('validateBalancedBrackets', () => {
    it('should return no errors for balanced brackets', () => {
      const content = 'db.collection.find({})';
      const errors = validateBalancedBrackets(content, 1);
      expect(errors).toHaveLength(0);
    });

    it('should return no errors for nested balanced brackets', () => {
      const content = 'db.collection.find({ status: { $eq: "active" } })';
      const errors = validateBalancedBrackets(content, 1);
      expect(errors).toHaveLength(0);
    });

    it('should return no errors for array brackets', () => {
      const content = 'db.collection.aggregate([{ $match: {} }])';
      const errors = validateBalancedBrackets(content, 1);
      expect(errors).toHaveLength(0);
    });

    it('should detect unclosed curly brace', () => {
      const content = 'db.collection.find({';
      const errors = validateBalancedBrackets(content, 1);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('Unclosed'))).toBe(true);
    });

    it('should detect unclosed square bracket', () => {
      const content = 'db.collection.aggregate([';
      const errors = validateBalancedBrackets(content, 1);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('Unclosed'))).toBe(true);
    });

    it('should detect unclosed parenthesis', () => {
      const content = 'db.collection.find(';
      const errors = validateBalancedBrackets(content, 1);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Unclosed '('");
    });

    it('should detect unmatched closing bracket', () => {
      const content = 'db.collection.find({})]';
      const errors = validateBalancedBrackets(content, 1);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Unmatched ']'");
    });

    it('should ignore brackets inside strings', () => {
      const content = 'db.collection.find({ text: "hello { world }" })';
      const errors = validateBalancedBrackets(content, 1);
      expect(errors).toHaveLength(0);
    });

    it('should handle escaped quotes in strings', () => {
      const content = "db.collection.find({ text: 'hello \\'world\\'' })";
      const errors = validateBalancedBrackets(content, 1);
      expect(errors).toHaveLength(0);
    });

    it('should handle multi-line content', () => {
      const content = `db.collection.find({
  status: "active"
})`;
      const errors = validateBalancedBrackets(content, 1);
      expect(errors).toHaveLength(0);
    });

    it('should detect errors on correct line numbers', () => {
      const content = `db.collection.find({
  status: "active"
`;
      const errors = validateBalancedBrackets(content, 1);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].startLineNumber).toBe(1);
    });
  });

  describe('validateMongoSyntax', () => {
    it('should return no errors for valid syntax', () => {
      const content = 'db.collection.find({ status: "active" })';
      const errors = validateMongoSyntax(content, 1);
      expect(errors).toHaveLength(0);
    });

    it('should detect unclosed single quote', () => {
      const content = "db.collection.find({ status: 'active })";
      const errors = validateMongoSyntax(content, 1);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Unclosed single quote');
    });

    it('should detect unclosed double quote', () => {
      const content = 'db.collection.find({ status: "active })';
      const errors = validateMongoSyntax(content, 1);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Unclosed double quote');
    });

    it('should ignore comments', () => {
      const content = `// This is a comment
db.collection.find({})`;
      const errors = validateMongoSyntax(content, 1);
      expect(errors).toHaveLength(0);
    });

    it('should ignore block comments', () => {
      const content = `/* This is a
block comment */
db.collection.find({})`;
      const errors = validateMongoSyntax(content, 1);
      expect(errors).toHaveLength(0);
    });

    it('should handle empty lines', () => {
      const content = `
db.collection.find({})
`;
      const errors = validateMongoSyntax(content, 1);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateMethodChains', () => {
    it('should return no errors for known methods', () => {
      const content = 'db.collection.find({}).sort({ _id: 1 }).limit(10)';
      const errors = validateMethodChains(content, 1);
      expect(errors).toHaveLength(0);
    });

    it('should warn about unknown methods', () => {
      const content = 'db.collection.unknownMethod({})';
      const errors = validateMethodChains(content, 1);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Unknown method');
      expect(errors[0].severity).toBe(MarkerSeverity.Warning);
    });

    it('should allow methods starting with underscore', () => {
      const content = 'db.collection._internalMethod({})';
      const errors = validateMethodChains(content, 1);
      expect(errors).toHaveLength(0);
    });

    it('should skip comments', () => {
      const content = `// db.collection.unknownMethod({})
db.collection.find({})`;
      const errors = validateMethodChains(content, 1);
      expect(errors).toHaveLength(0);
    });

    it('should skip empty lines', () => {
      const content = `
db.collection.find({})
`;
      const errors = validateMethodChains(content, 1);
      expect(errors).toHaveLength(0);
    });

    it('should validate multiple methods on different lines', () => {
      const content = `db.collection.find({})
db.collection.sort({})
db.collection.limit(10)`;
      const errors = validateMethodChains(content, 1);
      expect(errors).toHaveLength(0);
    });
  });

  describe('MONGO_VALIDATION_OWNER_CONST', () => {
    it('should be mongodb-validation', () => {
      expect(MONGO_VALIDATION_OWNER_CONST).toBe('mongodb-validation');
    });
  });
});
