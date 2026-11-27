import {
  describeSqlImpact,
  highlightCodeHtml,
  parseToolArguments,
  presentToolCall,
  toArgBlocks,
} from '@/common';

const SCREENSHOT_SQL = [
  'INSERT INTO store.orders',
  '  (order_no, user_id, status, order_date, total_amount, discount, shipping_fee, shipping_addr, remarks)',
  'VALUES',
  "('SO-20260400007', 1, 'paid', '2026-04-22', 299.00, 0, 15.00,",
  ' \'{"recipient":"User One","phone":"13800000001","address":"No.1 Sample Road, Shanghai","zip":"200000"}\'::jsonb,',
  " 'sample order 1'),",
  "('SO-20260400008', 2, 'draft', '2026-04-25', 89.90, 0, 8.00,",
  ' \'{"recipient":"User Two","phone":"13800000002","address":"No.2 Demo Avenue, Beijing","zip":"100000"}\'::jsonb,',
  " 'sample order 2')",
  'RETURNING id, order_no, user_id, status, order_date, total_amount, placed_at;',
].join('\n');

describe('toolCallPresentation', () => {
  it('parses boundary payloads from IPC objects or DB JSON strings into typed args', () => {
    const payload = {
      connection_id: 'pg-bastion-password',
      sql: SCREENSHOT_SQL,
    };

    expect(parseToolArguments(payload)).toEqual(payload);
    expect(parseToolArguments(JSON.stringify(payload))).toEqual(payload);
    expect(parseToolArguments('not valid json')).toEqual({});
    expect(parseToolArguments('[1, 2, 3]')).toEqual({});
    expect(parseToolArguments(null)).toEqual({});
  });

  it('presents the screenshot payload as clean SQL with extracted target and operation', () => {
    const result = presentToolCall('sqlkit__execute_write', {
      connection_id: 'pg-bastion-password',
      sql: SCREENSHOT_SQL,
    });

    expect(result.target).toBe('pg-bastion-password');
    expect(result.operation).toEqual({ verb: 'INSERT', object: 'store.orders' });
    expect(result.hints).toEqual([]);
    expect(result.blocks).toEqual([
      {
        kind: 'code',
        key: 'sql',
        language: 'sql',
        text: SCREENSHOT_SQL,
      },
    ]);
  });

  it('keeps multi-line PartiQL statements verbatim without reformatting', () => {
    const statement = "UPDATE \"Orders\"\n  SET status = 'shipped'\nWHERE id = '42'";
    const result = presentToolCall('dynamo__execute_write', {
      connection_id: 'aws-prod',
      statement,
    });

    expect(result.target).toBe('aws-prod');
    expect(result.operation).toEqual({ verb: 'UPDATE', object: 'Orders' });
    expect(result.hints).toEqual([]);
    expect(result.blocks).toEqual([
      { kind: 'code', key: 'statement', language: 'sql', text: statement },
    ]);
  });

  it('decodes JSON string fields and orders scalar fields before code blocks', () => {
    const result = presentToolCall('dynamo__create_item', {
      connection_id: 'aws-prod',
      attributes: '[{"key":"id","value":"42","type":"N"}]',
      table_name: 'Orders',
    });

    expect(result.target).toBe('aws-prod');
    expect(result.operation).toEqual({ verb: 'CREATE ITEM', object: 'Orders' });
    expect(result.blocks).toEqual([
      { kind: 'field', key: 'table_name', value: 'Orders' },
      {
        kind: 'code',
        key: 'attributes',
        language: 'json',
        text: JSON.stringify([{ key: 'id', value: '42', type: 'N' }], null, 2),
      },
    ]);
  });

  it('pretty-prints Elasticsearch bulk NDJSON bodies', () => {
    const bulkBody = '{"index":{"_index":"orders","_id":"1"}}\n{"status":"paid"}\n';
    const result = presentToolCall('es__bulk', {
      connection_id: 'es-prod',
      body: bulkBody,
    });

    expect(result.target).toBe('es-prod');
    expect(result.operation).toEqual({ verb: 'BULK', object: undefined });
    expect(result.blocks).toEqual([
      {
        kind: 'code',
        key: 'body',
        language: 'json',
        text: `${JSON.stringify({ index: { _index: 'orders', _id: '1' } }, null, 2)}\n${JSON.stringify({ status: 'paid' }, null, 2)}`,
      },
    ]);
  });

  it('returns empty blocks for empty args', () => {
    expect(toArgBlocks({})).toEqual([]);
  });

  describe('describeSqlImpact', () => {
    it('flags UPDATE and DELETE without WHERE', () => {
      expect(describeSqlImpact("UPDATE store.orders SET status = 'cancelled'")).toEqual({
        operation: { verb: 'UPDATE', object: 'store.orders' },
        hints: ['noWhereClause'],
      });

      expect(describeSqlImpact('DELETE FROM "store"."orders"')).toEqual({
        operation: { verb: 'DELETE', object: 'store.orders' },
        hints: ['noWhereClause'],
      });
    });

    it('ignores WHERE inside comments and string literals', () => {
      expect(describeSqlImpact('DELETE FROM store.orders -- WHERE id = 1').hints).toContain(
        'noWhereClause',
      );
      expect(
        describeSqlImpact("UPDATE store.orders SET status = 'x' /* WHERE id = 1 */").hints,
      ).toContain('noWhereClause');
      expect(describeSqlImpact("UPDATE store.orders SET note = 'WHERE id = 1'").hints).toContain(
        'noWhereClause',
      );
      expect(describeSqlImpact('UPDATE store.orders SET note = $$WHERE id = 1$$').hints).toContain(
        'noWhereClause',
      );
    });

    it('does not false-positive on keywords inside string literals', () => {
      const sql = "INSERT INTO store.logs (msg) VALUES ('ok; DROP TABLE users; TRUNCATE x');";
      expect(describeSqlImpact(sql)).toEqual({
        operation: { verb: 'INSERT', object: 'store.logs' },
        hints: [],
      });
    });

    it('detects DROP, TRUNCATE, and multi-statement batches', () => {
      expect(describeSqlImpact('DROP TABLE IF EXISTS `store`.`legacy_orders` CASCADE;')).toEqual({
        operation: { verb: 'DROP', object: 'store.legacy_orders' },
        hints: ['dropsObject'],
      });

      expect(describeSqlImpact('TRUNCATE TABLE [dbo].[temp_events]')).toEqual({
        operation: { verb: 'TRUNCATE', object: 'dbo.temp_events' },
        hints: ['truncates'],
      });

      expect(
        describeSqlImpact(
          "UPDATE store.orders SET status = 'a' WHERE id = 1; DELETE FROM store.audit",
        ),
      ).toEqual({
        operation: { verb: 'UPDATE', object: 'store.orders' },
        hints: ['noWhereClause', 'multipleStatements'],
      });
    });
  });

  it('derives operation and hints for non-SQL destructive tools', () => {
    const deleteIndex = presentToolCall('es__delete_index', {
      connection_id: 'es-prod',
      index: 'orders-2025',
    });
    expect(deleteIndex.operation).toEqual({ verb: 'DELETE INDEX', object: 'orders-2025' });
    expect(deleteIndex.hints).toEqual(['dropsObject']);

    const truncateTable = presentToolCall('dynamo__truncate_table', {
      connection_id: 'aws-prod',
      table_name: 'Events',
    });
    expect(truncateTable.operation).toEqual({ verb: 'TRUNCATE TABLE', object: 'Events' });
    expect(truncateTable.hints).toEqual(['truncates']);
  });

  it('highlights SQL and JSON safely with highlight.js', () => {
    const sqlHtml = highlightCodeHtml(
      "INSERT INTO store.orders VALUES ('<script>alert(1)</script>')",
      'sql',
    );
    expect(sqlHtml).toContain('hljs-keyword');
    expect(sqlHtml).not.toContain('<script>');

    const jsonHtml = highlightCodeHtml('{"status": "paid"}', 'json');
    expect(jsonHtml).toContain('hljs-attr');
  });
});
