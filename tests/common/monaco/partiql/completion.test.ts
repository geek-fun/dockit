// Mock monaco-editor before importing monacoUtils
jest.mock('monaco-editor', () => ({
  self: { MonacoEnvironment: {} },
  editor: {},
  languages: {},
  Range: {},
  Position: {},
  MarkerSeverity: {},
}));

import {
  setPartiqlDynamicOptions,
  getPartiqlDynamicOptions,
  partiqlSampleQueries,
} from '../../../../src/common/monaco/monacoUtils';

// Note: partiqlCompletionProvider is not tested directly because it requires monaco-editor
// which doesn't work in Jest's Node environment. The completion provider will be tested
// through integration tests in the browser environment.

describe('PartiQL Completion', () => {
  describe('Dynamic Options', () => {
    beforeEach(() => {
      // Reset dynamic options before each test
      setPartiqlDynamicOptions({});
    });

    it('should set and get dynamic options', () => {
      const options = {
        tableNames: ['users', 'orders'],
        activeTable: 'users',
        attributeKeys: ['id', 'name', 'email'],
      };

      setPartiqlDynamicOptions(options);
      const result = getPartiqlDynamicOptions();

      expect(result.tableNames).toEqual(['users', 'orders']);
      expect(result.activeTable).toBe('users');
      expect(result.attributeKeys).toEqual(['id', 'name', 'email']);
    });

    it('should handle empty options', () => {
      setPartiqlDynamicOptions({});
      const result = getPartiqlDynamicOptions();

      expect(result.tableNames).toBeUndefined();
      expect(result.activeTable).toBeUndefined();
      expect(result.attributeKeys).toBeUndefined();
    });

    it('should overwrite previous options', () => {
      setPartiqlDynamicOptions({
        tableNames: ['table1'],
        activeTable: 'table1',
      });

      setPartiqlDynamicOptions({
        tableNames: ['table2', 'table3'],
        activeTable: 'table2',
      });

      const result = getPartiqlDynamicOptions();
      expect(result.tableNames).toEqual(['table2', 'table3']);
      expect(result.activeTable).toBe('table2');
    });
  });

  describe('Sample Queries', () => {
    it('should have selectWithPartitionKey sample', () => {
      expect(partiqlSampleQueries.selectWithPartitionKey).toBeDefined();
      expect(partiqlSampleQueries.selectWithPartitionKey).toContain('SELECT');
      expect(partiqlSampleQueries.selectWithPartitionKey).toContain('FROM');
      expect(partiqlSampleQueries.selectWithPartitionKey).toContain('WHERE');
    });

    it('should have selectWithSortKey sample', () => {
      expect(partiqlSampleQueries.selectWithSortKey).toBeDefined();
      expect(partiqlSampleQueries.selectWithSortKey).toContain('SELECT');
      expect(partiqlSampleQueries.selectWithSortKey).toContain('AND');
    });

    it('should have scanAll sample', () => {
      expect(partiqlSampleQueries.scanAll).toBeDefined();
      expect(partiqlSampleQueries.scanAll).toContain('SELECT');
      expect(partiqlSampleQueries.scanAll).toContain('*');
      expect(partiqlSampleQueries.scanAll).toContain('FROM');
    });

    it('should have insertItem sample', () => {
      expect(partiqlSampleQueries.insertItem).toBeDefined();
      expect(partiqlSampleQueries.insertItem).toContain('INSERT');
      expect(partiqlSampleQueries.insertItem).toContain('INTO');
      expect(partiqlSampleQueries.insertItem).toContain('VALUE');
    });

    it('should have updateItem sample', () => {
      expect(partiqlSampleQueries.updateItem).toBeDefined();
      expect(partiqlSampleQueries.updateItem).toContain('UPDATE');
      expect(partiqlSampleQueries.updateItem).toContain('SET');
      expect(partiqlSampleQueries.updateItem).toContain('WHERE');
    });

    it('should have deleteItem sample', () => {
      expect(partiqlSampleQueries.deleteItem).toBeDefined();
      expect(partiqlSampleQueries.deleteItem).toContain('DELETE');
      expect(partiqlSampleQueries.deleteItem).toContain('FROM');
      expect(partiqlSampleQueries.deleteItem).toContain('WHERE');
    });

    it('all samples should use double-quoted table name placeholder', () => {
      Object.values(partiqlSampleQueries).forEach(query => {
        expect(query).toContain('"tablename"');
      });
    });
  });
});
