export type PartiqlDynamicOptions = {
  tableNames?: string[];
  attributeKeys?: string[];
  activeTable?: string;
};

let dynamicOptions: PartiqlDynamicOptions = {};

export const setPartiqlDynamicOptions = (options: PartiqlDynamicOptions): void => {
  dynamicOptions = options;
};

export const getPartiqlDynamicOptions = (): PartiqlDynamicOptions => {
  return dynamicOptions;
};

export const partiqlSampleQueries = {
  selectWithPartitionKey: `SELECT * FROM "tablename" WHERE pk = 'value'`,
  selectWithSortKey: `SELECT * FROM "tablename" WHERE pk = 'value' AND sk > 100`,
  scanAll: `SELECT * FROM "tablename"`,
  insertItem: `INSERT INTO "tablename" VALUE {'pk': 'value', 'sk': 123, 'data': 'example'}`,
  updateItem: `UPDATE "tablename" SET data = 'new value' WHERE pk = 'value' AND sk = 123`,
  deleteItem: `DELETE FROM "tablename" WHERE pk = 'value' AND sk = 123`,
};
