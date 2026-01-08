import {
  parsePartiqlStatements,
  getStatementAtLine,
  isStatementStart,
  getPartiqlStatementDecorations,
  partiqlExecutionGutterClass,
} from '../../../../src/common/monaco/partiql/utils';

describe('PartiQL Statement Parsing Utilities', () => {
  describe('isStatementStart', () => {
    it('should return true for SELECT statements', () => {
      expect(isStatementStart('SELECT * FROM table')).toBe(true);
      expect(isStatementStart('  SELECT * FROM table')).toBe(true);
      expect(isStatementStart('select * from table')).toBe(true);
    });

    it('should return true for INSERT statements', () => {
      expect(isStatementStart('INSERT INTO table VALUE {}')).toBe(true);
      expect(isStatementStart('  INSERT INTO table VALUE {}')).toBe(true);
      expect(isStatementStart('insert into table value {}')).toBe(true);
    });

    it('should return true for UPDATE statements', () => {
      expect(isStatementStart('UPDATE table SET col = 1')).toBe(true);
      expect(isStatementStart('  UPDATE table SET col = 1')).toBe(true);
      expect(isStatementStart('update table set col = 1')).toBe(true);
    });

    it('should return true for DELETE statements', () => {
      expect(isStatementStart('DELETE FROM table WHERE id = 1')).toBe(true);
      expect(isStatementStart('  DELETE FROM table WHERE id = 1')).toBe(true);
      expect(isStatementStart('delete from table where id = 1')).toBe(true);
    });

    it('should return false for non-statement lines', () => {
      expect(isStatementStart('')).toBe(false);
      expect(isStatementStart('  ')).toBe(false);
      expect(isStatementStart('-- comment')).toBe(false);
      expect(isStatementStart('WHERE id = 1')).toBe(false);
      expect(isStatementStart('AND col = 2')).toBe(false);
    });
  });

  describe('parsePartiqlStatements', () => {
    it('should parse a single SELECT statement', () => {
      const content = 'SELECT * FROM "users"';
      const statements = parsePartiqlStatements(content);

      expect(statements).toHaveLength(1);
      expect(statements[0].statement).toBe('SELECT * FROM "users"');
      expect(statements[0].position.startLineNumber).toBe(1);
      expect(statements[0].position.endLineNumber).toBe(1);
    });

    it('should parse a single statement with semicolon', () => {
      const content = 'SELECT * FROM "users";';
      const statements = parsePartiqlStatements(content);

      expect(statements).toHaveLength(1);
      expect(statements[0].statement).toBe('SELECT * FROM "users"');
    });

    it('should parse multiple statements separated by semicolons', () => {
      const content = `SELECT * FROM "users";
SELECT * FROM "orders";`;
      const statements = parsePartiqlStatements(content);

      expect(statements).toHaveLength(2);
      expect(statements[0].statement).toBe('SELECT * FROM "users"');
      expect(statements[0].position.startLineNumber).toBe(1);
      expect(statements[1].statement).toBe('SELECT * FROM "orders"');
      expect(statements[1].position.startLineNumber).toBe(2);
    });

    it('should parse multiple statements separated by empty lines', () => {
      const content = `SELECT * FROM "users"

SELECT * FROM "orders"`;
      const statements = parsePartiqlStatements(content);

      expect(statements).toHaveLength(2);
      expect(statements[0].statement).toBe('SELECT * FROM "users"');
      expect(statements[1].statement).toBe('SELECT * FROM "orders"');
    });

    it('should parse multi-line statements', () => {
      const content = `SELECT *
FROM "users"
WHERE pk = 'value';`;
      const statements = parsePartiqlStatements(content);

      expect(statements).toHaveLength(1);
      expect(statements[0].statement).toBe(`SELECT *
FROM "users"
WHERE pk = 'value'`);
      expect(statements[0].position.startLineNumber).toBe(1);
      expect(statements[0].position.endLineNumber).toBe(3);
    });

    it('should skip comment lines', () => {
      const content = `-- This is a comment
SELECT * FROM "users";`;
      const statements = parsePartiqlStatements(content);

      expect(statements).toHaveLength(1);
      expect(statements[0].statement).toBe('SELECT * FROM "users"');
      expect(statements[0].position.startLineNumber).toBe(2);
    });

    it('should handle empty content', () => {
      const statements = parsePartiqlStatements('');
      expect(statements).toHaveLength(0);
    });

    it('should handle content with only comments', () => {
      const content = `-- comment 1
-- comment 2`;
      const statements = parsePartiqlStatements(content);
      expect(statements).toHaveLength(0);
    });

    it('should parse INSERT statements', () => {
      const content = `INSERT INTO "users" VALUE {'pk': 'user1', 'name': 'John'}`;
      const statements = parsePartiqlStatements(content);

      expect(statements).toHaveLength(1);
      expect(statements[0].statement).toContain('INSERT INTO');
    });

    it('should parse UPDATE statements', () => {
      const content = `UPDATE "users" SET name = 'Jane' WHERE pk = 'user1'`;
      const statements = parsePartiqlStatements(content);

      expect(statements).toHaveLength(1);
      expect(statements[0].statement).toContain('UPDATE');
    });

    it('should parse DELETE statements', () => {
      const content = `DELETE FROM "users" WHERE pk = 'user1'`;
      const statements = parsePartiqlStatements(content);

      expect(statements).toHaveLength(1);
      expect(statements[0].statement).toContain('DELETE FROM');
    });

    it('should handle mixed statement types', () => {
      const content = `SELECT * FROM "users";
INSERT INTO "users" VALUE {'pk': 'new'};
UPDATE "users" SET name = 'Updated' WHERE pk = 'new';
DELETE FROM "users" WHERE pk = 'old';`;
      const statements = parsePartiqlStatements(content);

      expect(statements).toHaveLength(4);
      expect(statements[0].statement).toContain('SELECT');
      expect(statements[1].statement).toContain('INSERT');
      expect(statements[2].statement).toContain('UPDATE');
      expect(statements[3].statement).toContain('DELETE');
    });
  });

  describe('getStatementAtLine', () => {
    const content = `SELECT * FROM "users"

INSERT INTO "orders" VALUE {'pk': 'order1'}`;
    const statements = parsePartiqlStatements(content);

    it('should find statement at start line', () => {
      const statement = getStatementAtLine(statements, 1);
      expect(statement).toBeDefined();
      expect(statement?.statement).toBe('SELECT * FROM "users"');
    });

    it('should find statement at middle line of multi-line statement', () => {
      const multiLineContent = `SELECT *
FROM "users"
WHERE pk = 'value'`;
      const multiStatements = parsePartiqlStatements(multiLineContent);
      const statement = getStatementAtLine(multiStatements, 2);
      expect(statement).toBeDefined();
      expect(statement?.statement).toContain('SELECT');
    });

    it('should return undefined for empty lines', () => {
      const statement = getStatementAtLine(statements, 2);
      expect(statement).toBeUndefined();
    });

    it('should return undefined for line numbers outside statements', () => {
      const statement = getStatementAtLine(statements, 100);
      expect(statement).toBeUndefined();
    });

    it('should return undefined for empty statements array', () => {
      const statement = getStatementAtLine([], 1);
      expect(statement).toBeUndefined();
    });
  });

  describe('getPartiqlStatementDecorations', () => {
    it('should generate decorations for statements', () => {
      const content = `SELECT * FROM "users";
SELECT * FROM "orders";`;
      const statements = parsePartiqlStatements(content);
      const decorations = getPartiqlStatementDecorations(statements);

      expect(decorations).toHaveLength(2);
      expect(decorations[0].id).toBe(1);
      expect(decorations[1].id).toBe(2);
    });

    it('should have correct decoration options', () => {
      const content = 'SELECT * FROM "users"';
      const statements = parsePartiqlStatements(content);
      const decorations = getPartiqlStatementDecorations(statements);

      expect(decorations[0].options.isWholeLine).toBe(true);
      expect(decorations[0].options.linesDecorationsClassName).toBe(partiqlExecutionGutterClass);
    });

    it('should sort decorations by line number', () => {
      const content = `SELECT * FROM "users";

DELETE FROM "orders";

INSERT INTO "products" VALUE {}`;
      const statements = parsePartiqlStatements(content);
      const decorations = getPartiqlStatementDecorations(statements);

      expect(decorations[0].id).toBeLessThan(decorations[1].id);
      expect(decorations[1].id).toBeLessThan(decorations[2].id);
    });

    it('should return empty array for empty statements', () => {
      const decorations = getPartiqlStatementDecorations([]);
      expect(decorations).toHaveLength(0);
    });
  });

  describe('partiqlExecutionGutterClass', () => {
    it('should be defined', () => {
      expect(partiqlExecutionGutterClass).toBe('partiql-execute-decoration');
    });
  });
});
