import { formatPartiql } from '../../../../src/common/monaco/partiql/formatter';

describe('PartiQL Formatter', () => {
  describe('formatPartiql', () => {
    it('should uppercase keywords', () => {
      const input = 'select * from "users" where pk = \'value\'';
      const result = formatPartiql(input);
      expect(result).toBe('SELECT *\nFROM "users"\nWHERE pk = \'value\'');
    });

    it('should place FROM on a new line', () => {
      const input = 'SELECT * FROM "users"';
      const result = formatPartiql(input);
      expect(result).toBe('SELECT *\nFROM "users"');
    });

    it('should place WHERE on a new line', () => {
      const input = 'SELECT * FROM "users" WHERE pk = \'value\'';
      const result = formatPartiql(input);
      expect(result).toBe('SELECT *\nFROM "users"\nWHERE pk = \'value\'');
    });

    it('should place ORDER BY on a new line', () => {
      const input = 'SELECT * FROM "users" WHERE pk = \'a\' ORDER BY sk ASC';
      const result = formatPartiql(input);
      expect(result).toBe('SELECT *\nFROM "users"\nWHERE pk = \'a\'\nORDER BY sk ASC');
    });

    it('should place LIMIT on a new line', () => {
      const input = 'SELECT * FROM "users" LIMIT 10';
      const result = formatPartiql(input);
      expect(result).toBe('SELECT *\nFROM "users"\nLIMIT 10');
    });

    it('should place OFFSET on a new line', () => {
      const input = 'SELECT * FROM "users" LIMIT 10 OFFSET 5';
      const result = formatPartiql(input);
      expect(result).toBe('SELECT *\nFROM "users"\nLIMIT 10\nOFFSET 5');
    });

    it('should format INSERT statements', () => {
      const input = "insert into \"users\" value {'pk': 'user1', 'name': 'John'}";
      const result = formatPartiql(input);
      expect(result).toBe("INSERT\nINTO \"users\"\nVALUE { 'pk' : 'user1' , 'name' : 'John' }");
    });

    it('should format UPDATE statements with SET', () => {
      const input = "update \"users\" set name = 'Jane' where pk = 'user1'";
      const result = formatPartiql(input);
      expect(result).toBe("UPDATE \"users\"\nSET name = 'Jane'\nWHERE pk = 'user1'");
    });

    it('should format DELETE statements', () => {
      const input = 'delete from "users" where pk = \'user1\'';
      const result = formatPartiql(input);
      expect(result).toBe('DELETE\nFROM "users"\nWHERE pk = \'user1\'');
    });

    it('should preserve string literals', () => {
      const input = 'SELECT * FROM "users" WHERE name = \'hello world\'';
      const result = formatPartiql(input);
      expect(result).toContain("'hello world'");
    });

    it('should preserve double-quoted identifiers', () => {
      const input = 'SELECT * FROM "my-table"';
      const result = formatPartiql(input);
      expect(result).toContain('"my-table"');
    });

    it('should handle empty content', () => {
      expect(formatPartiql('')).toBe('');
      expect(formatPartiql('   ')).toBe('   ');
    });

    it('should handle comments', () => {
      const input = '-- This is a comment\nSELECT * FROM "users"';
      const result = formatPartiql(input);
      expect(result).toContain('-- This is a comment');
      expect(result).toContain('SELECT *');
    });

    it('should format multiple statements separated by semicolons', () => {
      const input = 'select * from "users";\nselect * from "orders";';
      const result = formatPartiql(input);
      expect(result).toContain('SELECT *\nFROM "users";');
      expect(result).toContain('SELECT *\nFROM "orders";');
    });

    it('should format multiple statements separated by empty lines', () => {
      const input = 'select * from "users"\n\nselect * from "orders"';
      const result = formatPartiql(input);
      const lines = result.split('\n');
      expect(lines).toContain('SELECT *');
      expect(lines).toContain('FROM "users"');
      expect(lines).toContain('FROM "orders"');
    });

    it('should handle multi-line input already split across lines', () => {
      const input = 'SELECT *\nFROM "users"\nWHERE pk = \'value\'';
      const result = formatPartiql(input);
      expect(result).toBe('SELECT *\nFROM "users"\nWHERE pk = \'value\'');
    });

    it('should normalize extra whitespace', () => {
      const input = 'SELECT   *   FROM   "users"   WHERE   pk  =  \'value\'';
      const result = formatPartiql(input);
      expect(result).toBe('SELECT *\nFROM "users"\nWHERE pk = \'value\'');
    });

    it('should format RETURNING clause', () => {
      const input = "INSERT INTO \"users\" VALUE {'pk': 'u1'} RETURNING ALL_NEW *";
      const result = formatPartiql(input);
      expect(result).toContain('RETURNING');
      expect(result).toContain('ALL_NEW');
    });

    it('should handle REMOVE clause in UPDATE', () => {
      const input = 'UPDATE "users" REMOVE attr WHERE pk = \'user1\'';
      const result = formatPartiql(input);
      expect(result).toContain('REMOVE');
      expect(result).toContain('WHERE');
    });
  });
});
