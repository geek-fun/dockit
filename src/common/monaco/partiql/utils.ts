/**
 * PartiQL Sample Queries and Dynamic Options
 * Pure TypeScript utilities that don't depend on Monaco
 */

/**
 * Dynamic options for PartiQL completions (table names, attribute keys)
 */
export type PartiqlDynamicOptions = {
  /** Available table names in the connected DynamoDB */
  tableNames?: string[];
  /** Available attribute keys for the active table */
  attributeKeys?: string[];
  /** Active table name */
  activeTable?: string;
};

let dynamicOptions: PartiqlDynamicOptions = {};

/**
 * Set dynamic completion options
 */
export const setPartiqlDynamicOptions = (options: PartiqlDynamicOptions): void => {
  dynamicOptions = options;
};

/**
 * Get current dynamic options
 */
export const getPartiqlDynamicOptions = (): PartiqlDynamicOptions => {
  return dynamicOptions;
};

/**
 * Sample PartiQL queries for quick insertion
 */
export const partiqlSampleQueries = {
  selectWithPartitionKey: `SELECT * FROM "tablename" WHERE pk = 'value'`,
  selectWithSortKey: `SELECT * FROM "tablename" WHERE pk = 'value' AND sk > 100`,
  scanAll: `SELECT * FROM "tablename"`,
  insertItem: `INSERT INTO "tablename" VALUE {'pk': 'value', 'sk': 123, 'data': 'example'}`,
  updateItem: `UPDATE "tablename" SET data = 'new value' WHERE pk = 'value' AND sk = 123`,
  deleteItem: `DELETE FROM "tablename" WHERE pk = 'value' AND sk = 123`,
};
