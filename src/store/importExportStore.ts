import { open } from '@tauri-apps/plugin-dialog';

import { get } from 'lodash';
import { defineStore } from 'pinia';
import { CustomError, jsonify } from '../common';
import { dynamoApi, loadHttpClient, sourceFileApi } from '../datasources';
import {
  Connection,
  DatabaseType,
  DynamoDBConnection,
  ElasticsearchConnection,
} from './connectionStore.ts';

// Import (Restore) types
export type RestoreInput = {
  connection: Connection;
  index: string;
  restoreFile: string;
};

// Import Metadata types (from exported metadata.json)
export type ImportMetadata = {
  version: string;
  source: {
    dbType: string;
    dbVersion: string;
    sourceType: string;
    sourceName: string;
  };
  export: {
    format: string;
    dataFile: string;
    encoding: string;
    exportedAt: string;
    rowCount: number;
    includedFields: string[];
  };
  schema: {
    properties?: { [key: string]: { type?: string; properties?: unknown } };
  };
  indexes: unknown;
  aliases: unknown;
  stats: unknown;
  comments: string;
};

export type ImportStrategy = 'append' | 'replace';

export type ImportFieldInfo = {
  name: string;
  type: string;
  sampleValue: string;
};

// Export types
export type FileType = 'jsonl' | 'json' | 'csv';

export type FieldInfo = {
  name: string;
  type: string;
  sampleValue: string;
  includeInExport: boolean;
};

export type ExportTask = {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: { complete: number; total: number };
  connection: Connection;
  index: string;
  fileName: string;
  folderPath: string;
  fileType: FileType;
  fields: FieldInfo[];
  startTime?: Date;
  endTime?: Date;
  error?: string;
};

export type ExportInput = {
  connection: Connection;
  index: string;
  exportFolder: string;
  exportFileName: string;
  exportFileType: FileType;
  fields: FieldInfo[];
  filterQuery?: string;
  overwriteExisting: boolean;
  createDirectory: boolean;
  beautifyJson: boolean;
};

export const useImportExportStore = defineStore('importExportStore', {
  state(): {
    // Import state
    restoreProgress: {
      complete: number;
      total: number;
      inserted: number;
      updated: number;
      skipped: number;
    } | null;
    restoreFile: string;
    importConnection: Connection | undefined;
    importDataFile: string;
    importMetadataFile: string;
    importMetadata: ImportMetadata | null;
    importTargetIndex: string;
    importIsNewCollection: boolean; // true if user entered a new collection name
    importExistingIndices: string[]; // list of existing indices for the connection
    importStrategy: ImportStrategy;
    importFields: ImportFieldInfo[];
    importSchemaFields: Array<{
      name: string;
      sourceType: string;
      targetType: string;
      matched: boolean;
      exclude: boolean;
    }>; // Schema comparison fields
    importValidationStatus: {
      step1: boolean; // Target configured (connection + index)
      step2: boolean; // Data file selected (+ metadata if new collection)
      step3: boolean; // Schema validated
    };
    importValidationErrors: string[];

    // Export state
    folderPath: string;
    extraPath: string;
    fileName: string;
    fileType: FileType;
    exportProgress: { complete: number; total: number } | null;
    connection: Connection | undefined;
    selectedIndex: string;
    fields: FieldInfo[];
    filterQuery: string;
    overwriteExisting: boolean;
    createDirectory: boolean;
    beautifyJson: boolean;
    validationStatus: {
      step1: boolean;
      step2: boolean;
      step3: boolean;
    };
    estimatedRows: number | null;
    estimatedSize: string | null;
    runningTasks: ExportTask[];
  } {
    return {
      // Import state
      restoreProgress: null,
      restoreFile: '',
      importConnection: undefined,
      importDataFile: '',
      importMetadataFile: '',
      importMetadata: null,
      importTargetIndex: '',
      importIsNewCollection: false,
      importExistingIndices: [],
      importStrategy: 'append',
      importFields: [],
      importSchemaFields: [],
      importValidationStatus: {
        step1: false,
        step2: false,
        step3: false,
      },
      importValidationErrors: [],

      // Export state
      folderPath: '',
      extraPath: '',
      fileName: '',
      fileType: 'jsonl',
      exportProgress: null,
      connection: undefined,
      selectedIndex: '',
      fields: [],
      filterQuery: '',
      overwriteExisting: false,
      createDirectory: true,
      beautifyJson: true,
      validationStatus: {
        step1: false,
        step2: false,
        step3: false,
      },
      estimatedRows: null,
      estimatedSize: null,
      runningTasks: [],
    };
  },
  getters: {
    canStartExport(): boolean {
      return (
        this.validationStatus.step1 && this.validationStatus.step2 && this.validationStatus.step3
      );
    },
    includedFields(): FieldInfo[] {
      return this.fields.filter(f => f.includeInExport);
    },
    hasRunningTasks(): boolean {
      return this.runningTasks.some(t => t.status === 'running');
    },
    getExportPath(): string {
      if (!this.folderPath) return '';
      if (!this.extraPath) return this.folderPath;
      return `${this.folderPath}/${this.extraPath}`;
    },
    // Import getters
    canStartImport(): boolean {
      return (
        this.importValidationStatus.step1 &&
        this.importValidationStatus.step2 &&
        this.importValidationStatus.step3
      );
    },
    importValidationPercentage(): number {
      const steps = [
        this.importValidationStatus.step1,
        this.importValidationStatus.step2,
        this.importValidationStatus.step3,
      ];
      const completed = steps.filter(Boolean).length;
      return Math.round((completed / steps.length) * 100);
    },
    // Check if source scope is ready (depends on whether collection is new or existing)
    isSourceScopeReady(): boolean {
      if (this.importIsNewCollection) {
        // New collection: need metadata + data file
        return !!this.importDataFile && !!this.importMetadata;
      } else {
        // Existing collection: only need data file
        return !!this.importDataFile;
      }
    },
  },
  actions: {
    // ==================== Import (Restore) Actions ====================
    async selectFile() {
      try {
        this.restoreFile = (await open({
          multiple: false,
          directory: false,
          filters: [
            {
              name: 'Import Files',
              extensions: ['csv', 'json', 'ndjson'],
            },
          ],
        })) as string;
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },

    async restoreFromFile(input: RestoreInput) {
      if (input.connection.type === DatabaseType.ELASTICSEARCH) {
        return await this.restoreToElasticsearch(input);
      } else if (input.connection.type === DatabaseType.DYNAMODB) {
        return await this.restoreToDynamoDB(input);
      } else {
        throw new CustomError(400, 'Unsupported connection type');
      }
    },

    async restoreToElasticsearch(input: RestoreInput) {
      const client = loadHttpClient(input.connection as ElasticsearchConnection);
      const fileType = input.restoreFile.split('.').pop();
      const bulkSize = 1000;
      let data: string;
      try {
        data = await sourceFileApi.readFile(input.restoreFile);
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }

      try {
        if (fileType === 'json') {
          // Parse multiple JSON arrays that were concatenated during backup
          const jsonArrays: string[] = [];
          let depth = 0;
          let currentArray = '';

          for (let i = 0; i < data.length; i++) {
            const char = data[i];
            currentArray += char;

            if (char === '[') {
              depth++;
            } else if (char === ']') {
              depth--;
              if (depth === 0 && currentArray.trim()) {
                jsonArrays.push(currentArray.trim());
                currentArray = '';
              }
            }
          }

          // Parse all JSON arrays and flatten into single hits array
          const allHits: Array<{
            _index?: string;
            _id: string;
            _score?: number;
            _source?: unknown;
            sort?: unknown[];
            [key: string]: unknown;
          }> = [];

          for (const jsonArray of jsonArrays) {
            try {
              const hits = jsonify.parse(jsonArray);
              if (Array.isArray(hits)) {
                allHits.push(...hits);
              }
            } catch (_e) {
              // Continue with other arrays even if one fails
            }
          }

          this.restoreProgress = {
            complete: 0,
            total: allHits.length,
            inserted: 0,
            updated: 0,
            skipped: 0,
          };
          for (let i = 0; i < allHits.length; i += bulkSize) {
            const action = this.importStrategy === 'append' ? 'create' : 'index';
            const bulkData = allHits
              .slice(i, i + bulkSize)
              .flatMap(hit => {
                const { _id, _source, _index, _score, sort: _sort, ...otherFields } = hit;

                // Build action metadata
                // - If _id exists: use it (will update in replace mode, skip in append mode via 409)
                // - If _id missing: ES auto-generates (creates new doc in both modes)
                return [{ [action]: { _index: input.index, _id } }, _source || otherFields];
              })
              .map(item => jsonify.stringify(item));

            const stats = await bulkRequest(client, bulkData);

            this.restoreProgress.complete += bulkData.length / 2;
            this.restoreProgress.inserted += stats.inserted;
            this.restoreProgress.updated += stats.updated;
            this.restoreProgress.skipped += stats.skipped;
          }
        } else if (fileType === 'jsonl') {
          // Parse JSONL format - one JSON object per line
          const lines = data.split('\n').filter(line => line.trim());
          this.restoreProgress = {
            complete: 0,
            total: lines.length,
            inserted: 0,
            updated: 0,
            skipped: 0,
          };

          for (let i = 0; i < lines.length; i += bulkSize) {
            const action = this.importStrategy === 'append' ? 'create' : 'index';
            const bulkData = lines
              .slice(i, i + bulkSize)
              .flatMap(line => {
                try {
                  const doc = jsonify.parse(line);
                  const { _id, ...source } = doc;

                  // Build action metadata
                  // - If _id exists: use it (will update in replace mode, skip in append mode via 409)
                  // - If _id missing: ES auto-generates (creates new doc in both modes)
                  const actionMeta: { _index: string; _id?: string } = { _index: input.index };
                  if (_id) {
                    actionMeta._id = _id;
                  }

                  return [{ [action]: actionMeta }, source];
                } catch {
                  return [];
                }
              })
              .map(item => jsonify.stringify(item));

            const stats = await bulkRequest(client, bulkData);

            this.restoreProgress.complete += bulkData.length / 2;
            this.restoreProgress.inserted += stats.inserted;
            this.restoreProgress.updated += stats.updated;
            this.restoreProgress.skipped += stats.skipped;
          }
        } else if (fileType === 'csv') {
          const lines = data.split('\r\n');

          // Parse CSV line properly handling quoted fields
          const parseCsvLine = (line: string): Array<string | null> => {
            const result: Array<string | null> = [];
            let current = '';
            let inQuotes = false;
            let hasQuotes = false;

            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              const nextChar = line[i + 1];

              if (char === '"') {
                hasQuotes = true;
                if (inQuotes && nextChar === '"') {
                  // Escaped quote
                  current += '"';
                  i++; // Skip next quote
                } else {
                  // Toggle quote state
                  inQuotes = !inQuotes;
                }
              } else if (char === ',' && !inQuotes) {
                // Field separator
                // Unquoted empty field → null, Quoted empty field → ''
                result.push(hasQuotes ? current : current === '' ? null : current);
                current = '';
                hasQuotes = false;
              } else {
                current += char;
              }
            }
            // Add last field
            result.push(hasQuotes ? current : current === '' ? null : current);
            return result;
          };

          const headers = parseCsvLine(lines[0]);
          this.restoreProgress = {
            complete: 0,
            total: lines.length - 1,
            inserted: 0,
            updated: 0,
            skipped: 0,
          };

          for (let i = 1; i < lines.length; i += bulkSize) {
            const action = this.importStrategy === 'append' ? 'create' : 'index';
            const bulkData = lines
              .slice(i, i + bulkSize)
              .flatMap(line => {
                if (!line.trim()) return [];

                const values = parseCsvLine(line);
                const body = headers.reduce(
                  (acc, header, index) => {
                    if (header === null) return acc;

                    let value = values[index];

                    // Skip only null/undefined (parseCsvLine returns null for unquoted empty fields)
                    // Preserve '' (parseCsvLine returns '' for quoted empty strings "") for round-trip fidelity
                    if (value === null || value === undefined) {
                      return acc;
                    }

                    if (typeof value === 'string') {
                      try {
                        value = jsonify.parse(value);
                      } catch {
                        // Note: Not valid JSON, keep as string, Empty quoted strings "" are preserved here
                      }
                    }

                    acc[header] = value;
                    return acc;
                  },
                  {} as { [key: string]: unknown },
                );

                const { _id, ...source } = body as { _id?: string; [key: string]: unknown };

                // Build action metadata
                // - If _id exists: use it (will update in replace mode, skip in append mode via 409)
                // - If _id missing: ES auto-generates (creates new doc in both modes)

                return [{ [action]: { _index: input.index, _id } }, source];
              })
              .map(item => jsonify.stringify(item));

            const stats = await bulkRequest(client, bulkData);

            this.restoreProgress.complete += bulkData.length / 2;
            this.restoreProgress.inserted += stats.inserted;
            this.restoreProgress.updated += stats.updated;
            this.restoreProgress.skipped += stats.skipped;
          }
        } else {
          throw new CustomError(400, 'Unsupported file type');
        }
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },

    async restoreToDynamoDB(input: RestoreInput) {
      const dynamoConnection = input.connection as DynamoDBConnection;
      const fileType = input.restoreFile.split('.').pop();
      let data: string;

      try {
        data = await sourceFileApi.readFile(input.restoreFile);
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }

      try {
        let items: Array<Record<string, unknown>> = [];

        if (fileType === 'json') {
          // Parse JSON array
          const parsed = jsonify.parse(data);
          items = Array.isArray(parsed) ? parsed : [parsed];
        } else if (fileType === 'jsonl') {
          // Parse JSONL format - one JSON object per line
          const lines = data.split('\n').filter(line => line.trim());
          items = lines
            .map(line => {
              try {
                return jsonify.parse(line);
              } catch {
                return null;
              }
            })
            .filter(Boolean) as Array<Record<string, unknown>>;
        } else if (fileType === 'csv') {
          // Parse CSV properly handling quoted fields
          const parseCsvLine = (line: string): Array<string | null> => {
            const result: Array<string | null> = [];
            let current = '';
            let inQuotes = false;
            let hasQuotes = false;

            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              const nextChar = line[i + 1];

              if (char === '"') {
                hasQuotes = true;
                if (inQuotes && nextChar === '"') {
                  // Escaped quote
                  current += '"';
                  i++; // Skip next quote
                } else {
                  // Toggle quote state
                  inQuotes = !inQuotes;
                }
              } else if (char === ',' && !inQuotes) {
                // Field separator - unquoted empty becomes null
                result.push(hasQuotes ? current : current === '' ? null : current);
                current = '';
                hasQuotes = false;
              } else {
                current += char;
              }
            }
            // Add last field
            result.push(hasQuotes ? current : current === '' ? null : current);
            return result;
          };

          const lines = data.split('\r\n').filter(line => line.trim());
          const headers = parseCsvLine(lines[0]);
          items = lines.slice(1).map(line => {
            const values = parseCsvLine(line);
            return headers.reduce(
              (acc, header, index) => {
                if (header === null) return acc; // Skip null headers

                let value: unknown = values[index];

                // Skip only null/undefined (parseCsvLine returns null for unquoted empty fields)
                // Preserve '' (parseCsvLine returns '' for quoted empty strings "") for round-trip fidelity
                if (value === null || value === undefined) {
                  return acc;
                }

                // Try to parse as JSON
                if (typeof value === 'string') {
                  try {
                    value = jsonify.parse(value);
                  } catch {
                    // Keep as string
                  }
                }
                acc[header] = value;
                return acc;
              },
              {} as Record<string, unknown>,
            );
          });
        } else {
          throw new CustomError(400, 'Unsupported file type');
        }

        this.restoreProgress = {
          complete: 0,
          total: items.length,
          inserted: 0,
          updated: 0,
          skipped: 0,
        };

        // Get table schema once to ensure correct types during import
        let attributeTypeMap: Map<string, string> | undefined;
        try {
          const tableInfo = await dynamoApi.describeTable(dynamoConnection);
          if (tableInfo?.attributeDefinitions) {
            attributeTypeMap = new Map<string, string>();
            for (const attr of tableInfo.attributeDefinitions) {
              attributeTypeMap.set(attr.attributeName, attr.attributeType);
            }
          }
        } catch {
          // If we can't get schema, proceed without type conversion
        }

        // Import items in batches using createItem
        // Validation of partition keys happens in parseDataFileStructure
        const batchSize = 25; // DynamoDB batch write limit

        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize);

          for (let j = 0; j < batch.length; j++) {
            const item = batch[j];

            // Skip empty items (validated earlier, but check again for safety)
            if (!item || Object.keys(item).length === 0) {
              this.restoreProgress.complete += 1;
              this.restoreProgress.skipped += 1;
              continue;
            }

            // Partition key validation happens in parseDataFileStructure
            // Here we just convert and import the data
            const partitionKeyName = dynamoConnection.partitionKey.name;
            const sortKeyName = dynamoConnection.sortKey?.name;

            // Convert to DynamoDB attribute format, filtering out null/undefined values
            // Preserve empty strings as they are valid DynamoDB values for string types
            const attributes = Object.entries(item)
              .filter(([key, value]) => {
                // Always include partition key and sort key (must not be null/undefined)
                if (key === partitionKeyName || (sortKeyName && key === sortKeyName)) {
                  return value !== null && value !== undefined;
                }
                // Filter out only null and undefined for other fields
                return value !== null && value !== undefined;
              })
              .map(([key, value]) => {
                let typedValue = value;
                let type = this.inferDynamoDBType(value);
                const isKeyAttribute = key === partitionKeyName || key === sortKeyName;

                // Convert value based on schema if available
                if (attributeTypeMap && attributeTypeMap.has(key)) {
                  const schemaType = attributeTypeMap.get(key);
                  if (schemaType === 'N') {
                    // Schema expects number
                    if (typeof value === 'string') {
                      if (value === '' || value.trim() === '') {
                        // Empty string can't be a number
                        // For key attributes, this is a critical error - skip the entire item
                        if (isKeyAttribute) {
                          return null;
                        }
                        // For non-key attributes, skip just this field
                        return null;
                      }
                      const numValue = Number(value);
                      if (!isNaN(numValue)) {
                        typedValue = numValue;
                        type = 'N';
                      } else {
                        // Invalid number - skip field or fail for keys
                        return null;
                      }
                    } else if (typeof value === 'number') {
                      typedValue = value;
                      type = 'N';
                    }
                  } else if (schemaType === 'S') {
                    // Schema expects string
                    if (typeof value !== 'string') {
                      typedValue = String(value);
                    }
                    type = 'S';
                  } else if (schemaType) {
                    // Use other schema types as-is
                    type = schemaType;
                  }
                }

                return {
                  key: key,
                  value: typedValue as string | number | boolean | null,
                  type: type,
                };
              })
              .filter(
                (
                  attr,
                ): attr is { key: string; value: string | number | boolean | null; type: string } =>
                  attr !== null,
              );

            // Validate that we have required keys
            const hasPartitionKey = attributes.some(attr => attr.key === partitionKeyName);
            const hasSortKey = !sortKeyName || attributes.some(attr => attr.key === sortKeyName);

            // Create item if there are valid attributes and required keys
            if (attributes.length > 0 && hasPartitionKey && hasSortKey) {
              try {
                // In append mode, add condition to skip existing items
                if (this.importStrategy === 'append') {
                  const result = await dynamoApi.createItem(dynamoConnection, attributes, {
                    skipExisting: true,
                    partitionKey: partitionKeyName,
                  });
                  // Check message to determine if item was created or skipped
                  if (result.message.includes('already exists')) {
                    this.restoreProgress.skipped += 1;
                  } else {
                    this.restoreProgress.inserted += 1;
                  }
                } else {
                  await dynamoApi.createItem(dynamoConnection, attributes);
                  // In replace mode, we don't know if it's insert or update, count as updated
                  this.restoreProgress.updated += 1;
                }
              } catch (_error) {
                // Import error - count as skipped
                // Error details available in _error object for debugging if needed
                this.restoreProgress.skipped += 1;
              }
            } else {
              // No valid attributes, skip this item
              this.restoreProgress.skipped += 1;
            }
            this.restoreProgress.complete += 1;
          }
        }
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },

    inferDynamoDBType(value: unknown): string {
      if (typeof value === 'string') return 'S';
      if (typeof value === 'number') return 'N';
      if (typeof value === 'boolean') return 'BOOL';
      if (value === null) return 'NULL';
      if (Array.isArray(value)) return 'L';
      if (typeof value === 'object') return 'M';
      return 'S'; // Default to string
    },

    // ==================== Enhanced Import Actions ====================
    async selectImportDataFile() {
      try {
        const selected = await open({
          multiple: false,
          directory: false,
          filters: [
            {
              name: 'Data Files',
              extensions: ['csv', 'json', 'jsonl'],
            },
          ],
        });
        if (selected) {
          this.importDataFile = selected as string;
          // Clear previous validation errors when selecting a new file
          this.importValidationErrors = [];
          this.validateImportStep2();

          // Parse data file to validate structure
          await this.parseDataFileStructure();
        }
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },

    async parseDataFileStructure() {
      if (!this.importDataFile) return;

      try {
        const fileType = this.importDataFile.split('.').pop()?.toLowerCase() || 'json';
        const data = await sourceFileApi.readFile(this.importDataFile);

        let sampleDoc: Record<string, unknown> | null = null;

        if (fileType === 'json') {
          try {
            const parsed = jsonify.parse(data);
            if (Array.isArray(parsed) && parsed.length > 0) {
              sampleDoc = parsed[0];
            } else if (typeof parsed === 'object') {
              sampleDoc = parsed;
            }
          } catch {
            // If JSON parsing fails, try JSONL format (common for exported data)
            const lines = data.split('\n').filter((line: string) => line.trim());
            if (lines.length > 0) {
              sampleDoc = jsonify.parse(lines[0]);
            }
          }
        } else if (fileType === 'jsonl') {
          const lines = data.split('\n').filter((line: string) => line.trim());
          if (lines.length > 0) {
            sampleDoc = jsonify.parse(lines[0]);
          }
        } else if (fileType === 'csv') {
          // Note: Basic CSV parsing - complex CSV with quoted commas may not parse correctly
          const lines = data.split('\n').filter((line: string) => line.trim());
          if (lines.length > 1) {
            const headers = lines[0].split(',').map((h: string) => h.trim().replace(/^"|"$/g, ''));
            const values = lines[1].split(',').map((v: string) => v.trim().replace(/^"|"$/g, ''));
            sampleDoc = {};
            headers.forEach((header: string, idx: number) => {
              sampleDoc![header] = values[idx] || '';
            });
          }
        }

        if (sampleDoc) {
          // Extract field structure from sample document
          const dataFields = this.extractFieldsFromObject(sampleDoc);
          this.importFields = dataFields.map(f => ({
            name: f.name,
            type: f.type,
            sampleValue: String(f.value).substring(0, 50),
          }));

          // Validate data structure for DynamoDB imports (both new and existing collections)
          if (this.importConnection && this.importConnection.type === DatabaseType.DYNAMODB) {
            await this.validateDataStructureForDynamoDB(data, fileType);
          }

          // Only build schema comparison if there are no validation errors
          if (this.importValidationErrors.length === 0) {
            await this.buildSchemaComparison();
          } else {
            // Clear schema fields when validation errors exist
            this.importSchemaFields = [];
          }
        }
      } catch {
        this.importValidationErrors.push('Failed to parse data file structure');
      } finally {
        // Always revalidate after parsing completes
        this.validateImportStep2();
        this.validateImportStep3();
      }
    },

    async validateDataStructureForDynamoDB(data: string, fileType: string) {
      const dynamoConnection = this.importConnection as DynamoDBConnection;
      const partitionKeyName = dynamoConnection.partitionKey.name;
      const invalidItems: Array<{ index: number; reason: string }> = [];

      try {
        let items: Array<Record<string, unknown>> = [];

        if (fileType === 'json') {
          const parsed = jsonify.parse(data);
          items = Array.isArray(parsed) ? parsed : [parsed];
        } else if (fileType === 'jsonl') {
          const lines = data.split('\n').filter(line => line.trim());
          items = lines
            .map(line => {
              try {
                return jsonify.parse(line);
              } catch {
                return null;
              }
            })
            .filter(Boolean) as Array<Record<string, unknown>>;
        } else if (fileType === 'csv') {
          const lines = data.split('\n').filter(line => line.trim());
          if (lines.length > 1) {
            const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            items = lines.slice(1).map(line => {
              const values = line.split(',');
              return headers.reduce(
                (acc, header, index) => {
                  acc[header] = values[index] || '';
                  return acc;
                },
                {} as Record<string, unknown>,
              );
            });
          }
        }

        // Validate each item has the required partition key
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item || Object.keys(item).length === 0) {
            invalidItems.push({
              index: i + 1,
              reason: 'Item is empty',
            });
            continue;
          }

          if (
            !(partitionKeyName in item) ||
            item[partitionKeyName] === null ||
            item[partitionKeyName] === undefined ||
            (typeof item[partitionKeyName] === 'string' && item[partitionKeyName] === '')
          ) {
            invalidItems.push({
              index: i + 1,
              reason: `Missing required partition key: ${partitionKeyName}`,
            });
          }
        }

        // Add validation errors if found
        if (invalidItems.length > 0) {
          const errorMsg = `Found ${invalidItems.length} invalid item(s):\n${invalidItems
            .slice(0, 5)
            .map(item => `Row ${item.index}: ${item.reason}`)
            .join(', ')}${invalidItems.length > 5 ? `, and ${invalidItems.length - 5} more` : ''}`;
          this.importValidationErrors.push(errorMsg);
        }
      } catch (error) {
        this.importValidationErrors.push(
          `Failed to validate data structure: ${get(error, 'message', 'Unknown error')}`,
        );
      }
    },

    extractFieldsFromObject(
      obj: Record<string, unknown>,
      prefix = '',
    ): Array<{ name: string; type: string; value: unknown }> {
      const fields: Array<{ name: string; type: string; value: unknown }> = [];

      // Only extract root-level fields for simplicity
      if (prefix) {
        return fields;
      }

      for (const [key, value] of Object.entries(obj)) {
        const fieldName = key;
        const fieldType = this.inferFieldType(value);
        fields.push({ name: fieldName, type: fieldType, value });
      }

      return fields;
    },

    inferFieldType(value: unknown): string {
      if (value === null || value === undefined) return 'NULL';
      if (typeof value === 'string') {
        // Try to detect if it's a date
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'DATE';
        return 'TEXT';
      }
      if (typeof value === 'number') {
        return Number.isInteger(value) ? 'INTEGER' : 'FLOAT';
      }
      if (typeof value === 'boolean') return 'BOOLEAN';
      if (Array.isArray(value)) return 'ARRAY';
      if (typeof value === 'object') return 'OBJECT';
      return 'TEXT';
    },

    async buildSchemaComparison() {
      this.importSchemaFields = [];

      if (this.importIsNewCollection) {
        // New collection: compare data fields with metadata schema
        if (this.importMetadata?.schema?.properties) {
          const metadataFields = Object.entries(this.importMetadata.schema.properties);
          const dataFieldNames = this.importFields.map(f => f.name);

          for (const [fieldName, fieldInfo] of metadataFields) {
            const dataField = this.importFields.find(f => f.name === fieldName);
            const fieldType = (fieldInfo as { type?: string }).type || 'unknown';

            this.importSchemaFields.push({
              name: fieldName,
              sourceType: fieldType.toUpperCase(),
              targetType: dataField?.type || '-',
              matched: dataFieldNames.includes(fieldName),
              exclude: false,
            });
          }

          // Add fields that are in data but not in metadata
          for (const dataField of this.importFields) {
            if (!this.importSchemaFields.find(f => f.name === dataField.name)) {
              this.importSchemaFields.push({
                name: dataField.name,
                sourceType: dataField.type,
                targetType: '-',
                matched: false,
                exclude: false,
              });
            }
          }
        } else {
          // No metadata schema, just use data fields
          for (const dataField of this.importFields) {
            this.importSchemaFields.push({
              name: dataField.name,
              sourceType: dataField.type,
              targetType: dataField.type,
              matched: true,
              exclude: false,
            });
          }
        }
      } else {
        // Existing collection: compare data fields with existing table schema
        const existingSchema = await this.fetchExistingCollectionSchema();

        if (existingSchema) {
          const dataFieldNames = this.importFields.map(f => f.name);

          for (const [fieldName, fieldType] of Object.entries(existingSchema)) {
            const dataField = this.importFields.find(f => f.name === fieldName);

            this.importSchemaFields.push({
              name: fieldName,
              sourceType: dataField?.type || '-',
              targetType: String(fieldType).toUpperCase(),
              matched: dataFieldNames.includes(fieldName),
              exclude: false,
            });
          }

          // Add fields that are in data but not in existing schema
          // Exclude _id for Elasticsearch as it's a system field
          for (const dataField of this.importFields) {
            if (
              !this.importSchemaFields.find(f => f.name === dataField.name) &&
              !(
                this.importConnection?.type === DatabaseType.ELASTICSEARCH &&
                dataField.name === '_id'
              )
            ) {
              this.importSchemaFields.push({
                name: dataField.name,
                sourceType: dataField.type,
                targetType: '-',
                matched: false,
                exclude: false,
              });
            }
          }
        } else {
          // No existing schema available, just use data fields
          for (const dataField of this.importFields) {
            this.importSchemaFields.push({
              name: dataField.name,
              sourceType: dataField.type,
              targetType: dataField.type,
              matched: true,
              exclude: false,
            });
          }
        }
      }

      this.validateImportStep3();
    },

    async fetchExistingCollectionSchema(): Promise<Record<string, string> | null> {
      if (!this.importConnection || !this.importTargetIndex) return null;

      if (this.importConnection.type === DatabaseType.ELASTICSEARCH) {
        const client = loadHttpClient(this.importConnection as ElasticsearchConnection);

        const response = await client.get<{
          [index: string]: { mappings: { properties?: Record<string, { type?: string }> } };
        }>(`/${this.importTargetIndex}/_mapping`);

        const indexData = response[this.importTargetIndex];
        if (indexData?.mappings?.properties) {
          const schema: Record<string, string> = {};
          for (const [fieldName, fieldInfo] of Object.entries(indexData.mappings.properties)) {
            schema[fieldName] = fieldInfo.type || 'unknown';
          }
          return schema;
        }

        // If no properties found, return empty schema (valid for empty index)
        return {};
      } else if (this.importConnection.type === DatabaseType.DYNAMODB) {
        // For DynamoDB, we need to describe the table
        const dynamoConnection = {
          ...(this.importConnection as DynamoDBConnection),
          tableName: this.importTargetIndex,
        };
        const tableInfo = await dynamoApi.describeTable(dynamoConnection);
        if (tableInfo?.attributeDefinitions) {
          const schema: Record<string, string> = {};
          for (const attr of tableInfo.attributeDefinitions) {
            schema[attr.attributeName] = attr.attributeType === 'N' ? 'NUMBER' : 'STRING';
          }
          return schema;
        }
      }
      return null;
    },

    async selectImportMetadataFile() {
      try {
        const selected = await open({
          multiple: false,
          directory: false,
          filters: [
            {
              name: 'Metadata File',
              extensions: ['json'],
            },
          ],
        });
        if (selected) {
          this.importMetadataFile = selected as string;
          await this.loadImportMetadata();
        }
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },

    async loadImportMetadata() {
      if (!this.importMetadataFile) {
        this.importMetadata = null;
        this.importFields = [];
        this.importValidationErrors = ['Metadata file is required'];
        this.validateImportStep2();
        return;
      }

      try {
        const content = await sourceFileApi.readFile(this.importMetadataFile);
        const metadata = jsonify.parse(content) as ImportMetadata;

        // Validate metadata structure
        const errors: string[] = [];

        if (!metadata.version) {
          errors.push('Missing schema version in metadata');
        }

        if (!metadata.source?.dbType) {
          errors.push('Missing database type in metadata');
        }

        if (!metadata.export?.dataFile) {
          errors.push('Missing data file reference in metadata');
        }

        if (typeof metadata.export?.rowCount !== 'number') {
          errors.push('Missing row count in metadata');
        }

        this.importValidationErrors = errors;

        if (errors.length === 0) {
          this.importMetadata = metadata;

          // Extract fields from schema
          if (metadata.schema?.properties) {
            this.importFields = Object.entries(metadata.schema.properties).map(
              ([name, config]) => ({
                name,
                type: ((config as { type?: string }).type || 'object').toUpperCase(),
                sampleValue: '',
              }),
            );
          }

          // Rebuild schema comparison if data file is already loaded and validation passes
          this.validateImportStep2();
          if (this.importDataFile && this.importValidationStatus.step2) {
            await this.buildSchemaComparison();
          }
        } else {
          this.importMetadata = null;
          this.importFields = [];
        }

        this.validateImportStep2();
      } catch (error) {
        this.importMetadata = null;
        this.importFields = [];
        this.importValidationErrors = ['Failed to parse metadata file: Invalid JSON format'];
        this.validateImportStep2();
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', 'Failed to parse metadata file')),
        );
      }
    },

    // Step 1: Target configured (connection + index selected)
    validateImportStep1() {
      this.importValidationStatus.step1 = !!(this.importConnection && this.importTargetIndex);
    },

    // Step 2: Source files ready (data file + metadata if new collection)
    validateImportStep2() {
      if (this.importIsNewCollection) {
        // New collection: need both metadata and data file
        this.importValidationStatus.step2 =
          !!this.importDataFile &&
          !!this.importMetadata &&
          this.importValidationErrors.length === 0;
      } else {
        // Existing collection: only need data file and no validation errors
        this.importValidationStatus.step2 =
          !!this.importDataFile && this.importValidationErrors.length === 0;
      }

      // Clear schema-related state if validation fails
      if (!this.importValidationStatus.step2) {
        this.importFields = [];
        this.importSchemaFields = [];
        this.importValidationStatus.step3 = false;
      } else if (this.importValidationErrors.length > 0) {
        // If there are validation errors, also fail step3
        this.importValidationStatus.step3 = false;
      }
    },

    // Step 3: Schema validated
    validateImportStep3() {
      // Step 3 is valid when schema comparison is done, there are schema fields, and no validation errors
      this.importValidationStatus.step3 =
        this.importSchemaFields.length > 0 && this.importValidationErrors.length === 0;
    },

    setImportConnection(connection: Connection | undefined) {
      this.importConnection = connection;
      this.importTargetIndex = '';
      this.importIsNewCollection = false;
      this.importExistingIndices = [];
      // Reset source files when connection changes
      this.importDataFile = '';
      this.importMetadataFile = '';
      this.importMetadata = null;
      this.importFields = [];
      this.importSchemaFields = [];
      this.validateImportStep1();
      this.validateImportStep2();
      this.validateImportStep3();
    },

    setImportTargetIndex(index: string, existingIndices: string[] = []) {
      this.importTargetIndex = index;
      this.importExistingIndices = existingIndices;
      // Check if this is an existing collection or new
      this.importIsNewCollection = index !== '' && !existingIndices.includes(index);
      // Reset source files when index changes
      this.importDataFile = '';
      this.importMetadataFile = '';
      this.importMetadata = null;
      this.importFields = [];
      this.importSchemaFields = [];
      this.validateImportStep1();
      this.validateImportStep2();
      this.validateImportStep3();
    },

    setImportStrategy(strategy: ImportStrategy) {
      this.importStrategy = strategy;
      // Reset progress when strategy changes
      this.restoreProgress = null;
    },

    toggleSchemaFieldExclude(fieldName: string) {
      const field = this.importSchemaFields.find(f => f.name === fieldName);
      if (field) {
        field.exclude = !field.exclude;
      }
    },

    clearImportDataFile() {
      this.importDataFile = '';
      this.importSchemaFields = [];
      this.validateImportStep2();
      this.validateImportStep3();
    },

    clearImportMetadataFile() {
      this.importMetadataFile = '';
      this.importMetadata = null;
      this.importFields = [];
      this.importSchemaFields = [];
      this.importValidationErrors = [];
      this.validateImportStep2();
      this.validateImportStep3();
    },

    async validateDatabaseCompatibility(): Promise<{ valid: boolean; errors: string[] }> {
      const errors: string[] = [];

      if (!this.importConnection) {
        errors.push('Connection is required for validation');
        return { valid: false, errors };
      }

      // For new collections with metadata
      if (this.importMetadata) {
        // Check database type compatibility
        const sourceDbType = this.importMetadata.source.dbType.toLowerCase();
        const targetDbType = this.importConnection.type.toLowerCase();

        if (sourceDbType !== targetDbType) {
          errors.push(
            `Database type mismatch: source is ${sourceDbType}, target is ${targetDbType}`,
          );
        }

        return { valid: errors.length === 0, errors };
      }

      // For existing collections, validate against current schema
      if (!this.importIsNewCollection && this.importTargetIndex && this.importFields.length > 0) {
        // DynamoDB is schema-less, so skip schema validation for existing collections
        if (this.importConnection.type === DatabaseType.DYNAMODB) {
          return { valid: true, errors };
        }

        try {
          const existingSchema = await this.fetchExistingCollectionSchema();

          if (!existingSchema) {
            errors.push('Unable to fetch existing collection schema');
            return { valid: false, errors };
          }
          return { valid: true, errors };
        } catch (error) {
          errors.push(`Failed to validate schema: ${get(error, 'message', 'Unknown error')}`);
          return { valid: false, errors };
        }
      }

      return { valid: true, errors };
    },

    resetImportForm() {
      this.restoreProgress = null;
      this.restoreFile = '';
      this.importConnection = undefined;
      this.importDataFile = '';
      this.importMetadataFile = '';
      this.importMetadata = null;
      this.importTargetIndex = '';
      this.importIsNewCollection = false;
      this.importExistingIndices = [];
      this.importStrategy = 'append';
      this.importFields = [];
      this.importSchemaFields = [];
      this.importValidationStatus = {
        step1: false,
        step2: false,
        step3: false,
      };
      this.importValidationErrors = [];
    },

    async executeImport() {
      if (!this.importConnection || !this.importTargetIndex || !this.importDataFile) {
        throw new CustomError(400, 'Import configuration is incomplete');
      }

      // Validate database compatibility
      const compatibility = await this.validateDatabaseCompatibility();
      if (!compatibility.valid) {
        throw new CustomError(400, compatibility.errors.join('; '));
      }

      // Use existing restoreFromFile logic with the new data file
      const restoreInput: RestoreInput = {
        connection: this.importConnection,
        index: this.importTargetIndex,
        restoreFile: this.importDataFile,
      };

      await this.restoreFromFile(restoreInput);

      // Verify row count if metadata is available
      if (this.importMetadata && this.restoreProgress) {
        const expectedCount = this.importMetadata.export.rowCount;
        const actualCount = this.restoreProgress.complete;

        if (actualCount !== expectedCount) {
          // Return warning but don't fail
          return {
            success: true,
            warning: `Row count mismatch: expected ${expectedCount}, imported ${actualCount}`,
          };
        }
      }

      return { success: true };
    },

    // ==================== Export Actions ====================
    async selectFolder() {
      try {
        this.folderPath = (await open({ recursive: true, directory: true })) as string;
        this.validateStep3();
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },

    async checkFileExist(input: Omit<ExportInput, 'connection' | 'fields'>) {
      const filePath = `${input.exportFolder}/${input.exportFileName}.${input.exportFileType}`;
      try {
        return await sourceFileApi.exists(filePath);
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },

    validateStep1() {
      this.validationStatus.step1 = !!(this.connection && this.selectedIndex);
    },

    validateStep2() {
      this.validationStatus.step2 = this.fields.length > 0 && this.includedFields.length > 0;
    },

    validateStep3() {
      this.validationStatus.step3 = !!(this.folderPath && this.fileName && this.fileType);
    },

    setConnection(connection: Connection | undefined) {
      this.connection = connection;
      this.selectedIndex = '';
      this.fields = [];
      this.estimatedRows = null;
      this.estimatedSize = null;
      this.validateStep1();
      this.validateStep2();
    },

    setSelectedIndex(index: string) {
      this.selectedIndex = index;
      this.fields = [];
      this.estimatedRows = null;
      this.estimatedSize = null;
      this.validateStep1();
      this.validateStep2();
    },

    setFields(fields: FieldInfo[]) {
      this.fields = fields;
      this.validateStep2();
    },

    toggleFieldInclusion(fieldName: string) {
      const field = this.fields.find(f => f.name === fieldName);
      if (field) {
        field.includeInExport = !field.includeInExport;
        this.validateStep2();
      }
    },

    setFileName(name: string) {
      this.fileName = name;
      this.validateStep3();
    },

    setFileType(type: FileType) {
      this.fileType = type;
      this.validateStep3();
    },

    setExtraPath(path: string) {
      this.extraPath = path;
      this.validateStep3();
    },

    setFilterQuery(query: string) {
      this.filterQuery = query;
    },

    resetExportForm() {
      this.folderPath = '';
      this.extraPath = '';
      this.fileName = '';
      this.fileType = 'jsonl';
      this.exportProgress = null;
      this.connection = undefined;
      this.selectedIndex = '';
      this.fields = [];
      this.filterQuery = '';
      this.overwriteExisting = false;
      this.createDirectory = true;
      this.beautifyJson = true;
      this.validationStatus = {
        step1: false,
        step2: false,
        step3: false,
      };
      this.estimatedRows = null;
      this.estimatedSize = null;
    },

    async fetchSchemaAndSamples() {
      if (!this.connection || !this.selectedIndex) {
        throw new CustomError(400, 'Connection and index are required');
      }

      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await this.fetchElasticsearchSchema();
      } else if (this.connection.type === DatabaseType.DYNAMODB) {
        await this.fetchDynamoDBSchema();
      } else {
        throw new CustomError(400, 'Unsupported connection type');
      }
    },

    async fetchElasticsearchSchema() {
      if (!this.connection || !this.selectedIndex) return;
      if (this.connection.type !== DatabaseType.ELASTICSEARCH) return;

      const client = loadHttpClient(this.connection as ElasticsearchConnection);

      try {
        // Get mapping
        const mappingResponse = await client.get<{
          [key: string]: {
            mappings: {
              properties: {
                [key: string]: { type?: string; properties?: unknown };
              };
            };
          };
        }>(`/${this.selectedIndex}/_mapping`);

        const { mappings = { properties: {} } } = mappingResponse[this.selectedIndex];

        // Get sample documents
        const sampleResponse = await client.get<{
          hits: {
            hits: Array<{
              _id: string;
              _source: { [key: string]: unknown };
            }>;
          };
        }>(`/${this.selectedIndex}/_search`, undefined, jsonify.stringify({ size: 1 }));

        const sampleDoc = sampleResponse.hits?.hits?.[0]?._source || {};
        const sampleId = sampleResponse.hits?.hits?.[0]?._id || '';

        // Get document count
        const countResponse = await client.get<{ count: number }>(`/${this.selectedIndex}/_count`);
        this.estimatedRows = countResponse.count;

        // Build fields array - only root-level fields for simplicity
        // First add _id as a special field
        const fields: FieldInfo[] = [
          {
            name: '_id',
            type: 'KEYWORD',
            sampleValue: sampleId,
            includeInExport: true,
          },
        ];

        // Then add fields from mappings (if any exist)
        fields.push(
          ...Object.entries(mappings.properties || {})
            .filter(([name]) => !name.includes('.')) // Only root-level fields
            .map(([name, config]) => {
              const type = (config as { type?: string }).type || 'object';
              let sampleValue = '';

              const value = sampleDoc[name];
              if (value !== undefined && value !== null) {
                if (typeof value === 'object') {
                  sampleValue = jsonify.stringify(value);
                  if (sampleValue.length > 50) {
                    sampleValue = sampleValue.substring(0, 47) + '...';
                  }
                } else {
                  sampleValue = String(value);
                  if (sampleValue.length > 50) {
                    sampleValue = sampleValue.substring(0, 47) + '...';
                  }
                }
              }

              return {
                name,
                type: type.toUpperCase(),
                sampleValue,
                includeInExport: true,
              };
            }),
        );

        this.fields = fields;
        this.validateStep2();

        // Estimate size (rough calculation)
        if (this.estimatedRows && sampleDoc) {
          const avgDocSize = JSON.stringify(sampleDoc).length;
          const totalBytes = avgDocSize * this.estimatedRows;
          this.estimatedSize = formatBytes(totalBytes);
        }

        return fields;
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },

    async fetchDynamoDBSchema() {
      if (!this.connection || !this.selectedIndex) return;

      const dynamoConnection = this.connection as DynamoDBConnection;

      try {
        // Get table info to ensure we have attribute definitions
        const tableInfo = await dynamoApi.describeTable(dynamoConnection);

        // Always scan the base table to get schema information (not GSI/LSI)
        const queryResult = await dynamoApi.scanTable(dynamoConnection, {
          tableName: dynamoConnection.tableName,
          indexName: null,
          partitionKey: {
            name: dynamoConnection.partitionKey.name,
            value: null,
          },
          limit: 1,
        });

        const sampleDoc = queryResult.items?.[0] || {};

        // Estimate row count (DynamoDB doesn't provide exact count easily)
        // Use itemCount from table info if available
        this.estimatedRows = tableInfo.itemCount || null;

        // Build fields array from attribute definitions and sample document
        const attributeMap = new Map<string, string>();

        // Add known attribute definitions from table
        if (tableInfo.attributeDefinitions) {
          tableInfo.attributeDefinitions.forEach(attr => {
            attributeMap.set(attr.attributeName, attr.attributeType);
          });
        }

        // Merge with sample document to get all fields - only root-level fields for simplicity
        const allFields = new Set([...Array.from(attributeMap.keys()), ...Object.keys(sampleDoc)]);

        const fields: FieldInfo[] = Array.from(allFields)
          .filter(name => !name.includes('.')) // Only root-level fields
          .map(name => {
            const type = attributeMap.get(name) || 'S'; // Default to String
            let sampleValue = '';

            const value = sampleDoc[name];
            if (value !== undefined && value !== null) {
              if (typeof value === 'object') {
                sampleValue = jsonify.stringify(value);
                if (sampleValue.length > 50) {
                  sampleValue = sampleValue.substring(0, 47) + '...';
                }
              } else {
                sampleValue = String(value);
                if (sampleValue.length > 50) {
                  sampleValue = sampleValue.substring(0, 47) + '...';
                }
              }
            }

            return {
              name,
              type: type.toUpperCase(),
              sampleValue,
              includeInExport: true,
            };
          });

        this.fields = fields;
        this.validateStep2();

        // Estimate size (rough calculation)
        if (this.estimatedRows && Object.keys(sampleDoc).length > 0) {
          const avgDocSize = JSON.stringify(sampleDoc).length;
          const totalBytes = avgDocSize * this.estimatedRows;
          this.estimatedSize = formatBytes(totalBytes);
        }

        return fields;
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },

    async exportToFile(input: ExportInput): Promise<string> {
      // Reset progress at the start of each export
      this.exportProgress = null;

      if (input.connection.type === DatabaseType.ELASTICSEARCH) {
        return await this.exportElasticsearchToFile(input);
      } else if (input.connection.type === DatabaseType.DYNAMODB) {
        return await this.exportDynamoDBToFile(input);
      } else {
        throw new CustomError(400, 'Unsupported connection type');
      }
    },

    async exportElasticsearchToFile(input: ExportInput): Promise<string> {
      if (input.connection.type !== DatabaseType.ELASTICSEARCH) {
        throw new CustomError(400, 'Connection must be Elasticsearch');
      }
      const esConnection = input.connection as ElasticsearchConnection;
      const client = loadHttpClient(esConnection);
      const dbVersion = esConnection.version || '';

      // Use the configured fileName from input
      const dataFileName = `${input.exportFileName}.${input.exportFileType}`;
      const dataFilePath = `${input.exportFolder}/${dataFileName}`;
      const metadataFileName = `${input.exportFileName}_metadata.json`;
      const metadataFilePath = `${input.exportFolder}/${metadataFileName}`;

      let searchAfter: unknown[] | undefined = undefined;
      let hasMore = true;
      let appendFile = false;

      try {
        // Create directory if needed (UI validation ensures this is appropriate)
        if (input.createDirectory) {
          const folderExists = await sourceFileApi.exists(input.exportFolder);
          if (!folderExists) {
            await sourceFileApi.createFolder(input.exportFolder);
          }
        }

        // Get total count
        const countResponse = await client.get<{ count: number }>(`/${input.index}/_count`);
        this.exportProgress = {
          complete: 0,
          total: countResponse.count,
        };

        // Get mapping for metadata
        const mappingResponse = await client.get<{
          [key: string]: {
            mappings: {
              properties: {
                [key: string]: unknown;
              };
            };
          };
        }>(`/${input.index}/_mapping`);

        const indexMapping = mappingResponse[input.index];

        // Get aliases
        let aliases = {};
        try {
          const aliasResponse = await client.get<{
            [key: string]: { aliases: { [key: string]: unknown } };
          }>(`/${input.index}/_alias`);
          aliases = aliasResponse[input.index]?.aliases || {};
        } catch {
          // Aliases might not be available
        }

        // Get index stats
        let stats = {};
        try {
          const statsResponse = await client.get<{
            indices: { [key: string]: { total: unknown } };
          }>(`/${input.index}/_stats`);
          stats = statsResponse.indices?.[input.index]?.total || {};
        } catch {
          // Stats might not be available
        }

        // Build metadata according to required format
        const metadata = {
          version: '1.0.0',
          source: {
            dbType: input.connection.type.toLowerCase(),
            dbVersion: dbVersion,
            sourceType: 'index',
            sourceName: input.index,
          },
          export: {
            format: input.exportFileType,
            dataFile: dataFileName,
            encoding: 'utf-8',
            exportedAt: new Date().toISOString(),
            rowCount: countResponse.count,
            includedFields: input.fields.filter(f => f.includeInExport).map(f => f.name),
          },
          schema: indexMapping?.mappings || {},
          indexes: {},
          aliases: aliases,
          stats: stats,
          comments: '',
        };

        // Write metadata file (beautify based on user preference)
        await sourceFileApi.saveFile(
          metadataFilePath,
          input.beautifyJson ? jsonify.stringify(metadata, null, 2) : jsonify.stringify(metadata),
          false,
        );

        // Build CSV headers if needed
        const includedFieldNames = input.fields.filter(f => f.includeInExport).map(f => f.name);

        // Initialize file based on format
        if (input.exportFileType === 'csv') {
          // Write CSV header
          await sourceFileApi.saveFile(dataFilePath, includedFieldNames.join(',') + '\r\n', false);
          appendFile = true;
        } else if (input.exportFileType === 'json') {
          // Start JSON array
          await sourceFileApi.saveFile(dataFilePath, '[\n', false);
          appendFile = true;
        }

        let isFirstBatch = true;

        while (hasMore) {
          const searchBody: {
            size: number;
            search_after?: unknown[];
            sort: Array<{ [key: string]: string }>;
            _source?: string[];
            query?: unknown;
          } = {
            size: 1000,
            sort: [{ _doc: 'asc' }],
          };

          if (searchAfter) {
            searchBody.search_after = searchAfter;
          }

          // Add field filtering
          if (includedFieldNames.length < input.fields.length) {
            searchBody._source = includedFieldNames;
          }

          // Add filter query if provided
          if (input.filterQuery) {
            try {
              searchBody.query = jsonify.parse(input.filterQuery);
            } catch {
              // Invalid query, ignore
            }
          }

          const response = await client.get<{
            status?: number;
            hits: {
              hits: Array<{
                _index: string;
                _id: string;
                _score: number;
                _source: { [key: string]: unknown };
                sort: unknown[];
              }>;
            };
          }>(`/${input.index}/_search`, undefined, jsonify.stringify(searchBody));

          if (response.status && response.status !== 200) {
            throw new CustomError(
              response.status,
              get(
                response,
                'details',
                get(response, 'message', jsonify.stringify(get(response, 'error.root_cause', ''))),
              ),
            );
          }

          const hits = response.hits.hits;

          if (this.exportProgress) {
            this.exportProgress.complete += hits.length;
          }

          if (hits.length === 0) {
            hasMore = false;
          } else {
            searchAfter = hits[hits.length - 1].sort;

            let dataToWrite: string;

            if (input.exportFileType === 'jsonl') {
              // JSONL format - one JSON object per line (compact format)
              dataToWrite = hits
                .map(hit => {
                  const doc = { _id: hit._id, ...hit._source };
                  return jsonify.stringify(doc);
                })
                .join('\n');
              if (dataToWrite) {
                dataToWrite += '\n';
              }
            } else if (input.exportFileType === 'json') {
              // JSON array format
              const jsonDocs = hits.map(hit => {
                const doc = { _id: hit._id, ...hit._source };
                return input.beautifyJson
                  ? jsonify.stringify(doc, null, 2)
                  : jsonify.stringify(doc);
              });
              // Add comma separator between batches
              const prefix = isFirstBatch ? '' : ',\n';
              dataToWrite = prefix + jsonDocs.join(',\n');
              isFirstBatch = false;
            } else {
              // CSV format
              dataToWrite = convertToCsv(includedFieldNames, hits);
            }

            await sourceFileApi.saveFile(dataFilePath, dataToWrite, appendFile);
            appendFile = true;
          }
        }

        // Close JSON array if needed
        if (input.exportFileType === 'json') {
          await sourceFileApi.saveFile(dataFilePath, '\n]', true);
        }

        // Update metadata with actual row count exported
        metadata.export.rowCount = this.exportProgress?.complete || 0;
        await sourceFileApi.saveFile(
          metadataFilePath,
          input.beautifyJson ? jsonify.stringify(metadata, null, 2) : jsonify.stringify(metadata),
          false,
        );

        return dataFilePath;
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },

    async exportDynamoDBToFile(input: ExportInput): Promise<string> {
      const dynamoConnection = input.connection as DynamoDBConnection;

      // Use the configured fileName from input
      const dataFileName = `${input.exportFileName}.${input.exportFileType}`;
      const dataFilePath = `${input.exportFolder}/${dataFileName}`;
      const metadataFileName = `${input.exportFileName}_metadata.json`;
      const metadataFilePath = `${input.exportFolder}/${metadataFileName}`;

      let exclusiveStartKey: Record<string, unknown> | undefined = undefined;
      let hasMore = true;
      let appendFile = false;
      let totalItems = 0;

      try {
        // Create directory if needed (UI validation ensures this is appropriate)
        if (input.createDirectory) {
          const folderExists = await sourceFileApi.exists(input.exportFolder);
          if (!folderExists) {
            await sourceFileApi.createFolder(input.exportFolder);
          }
        }

        // Get table info for metadata
        const tableInfo = await dynamoApi.describeTable(dynamoConnection);

        // Initialize progress
        this.exportProgress = {
          complete: 0,
          total: tableInfo.itemCount || 0,
        };

        // Build metadata
        const metadata = {
          version: '1.0.0',
          source: {
            dbType: input.connection.type.toLowerCase(),
            dbVersion: 'dynamodb',
            sourceType: 'table',
            sourceName: input.index,
          },
          export: {
            format: input.exportFileType,
            dataFile: dataFileName,
            encoding: 'utf-8',
            exportedAt: new Date().toISOString(),
            rowCount: 0, // Will be updated after scan
            includedFields: input.fields.filter(f => f.includeInExport).map(f => f.name),
          },
          schema: {
            attributeDefinitions: tableInfo.attributeDefinitions,
            keySchema: tableInfo.keySchema,
          },
          indexes: tableInfo.indices || [],
          aliases: {},
          stats: {
            itemCount: tableInfo.itemCount,
            sizeBytes: tableInfo.sizeBytes,
          },
          comments: '',
        };

        // Build field names
        const includedFieldNames = input.fields.filter(f => f.includeInExport).map(f => f.name);

        // Initialize file based on format
        if (input.exportFileType === 'csv') {
          // Write CSV header
          await sourceFileApi.saveFile(dataFilePath, includedFieldNames.join(',') + '\r\n', false);
          appendFile = true;
        } else if (input.exportFileType === 'json') {
          // Start JSON array
          await sourceFileApi.saveFile(dataFilePath, '[\n', false);
          appendFile = true;
        }

        let isFirstBatch = true;

        // Determine if we're scanning a GSI or the base table
        const isGSI = input.index !== dynamoConnection.tableName;

        // Scan table in batches
        while (hasMore) {
          const queryResult = await dynamoApi.scanTable(dynamoConnection, {
            tableName: dynamoConnection.tableName,
            indexName: isGSI ? input.index : null,
            partitionKey: {
              name: dynamoConnection.partitionKey.name,
              value: null,
            },
            limit: 1000,
            exclusiveStartKey: exclusiveStartKey || undefined,
          });

          const items = queryResult.items || [];
          totalItems += items.length;

          if (this.exportProgress) {
            this.exportProgress.complete += items.length;
          }

          if (items.length === 0) {
            hasMore = false;
            break;
          }

          // Write data for this batch
          let dataToWrite: string;

          if (input.exportFileType === 'jsonl') {
            // JSONL format - one JSON object per line
            dataToWrite = items
              .map(item => {
                // Filter fields if needed
                if (includedFieldNames.length < input.fields.length) {
                  const filteredItem: Record<string, unknown> = {};
                  includedFieldNames.forEach(field => {
                    if (field in item) {
                      filteredItem[field] = item[field];
                    }
                  });
                  return jsonify.stringify(filteredItem);
                }
                return jsonify.stringify(item);
              })
              .join('\n');
            if (dataToWrite) {
              dataToWrite += '\n';
            }
          } else if (input.exportFileType === 'json') {
            // JSON array format
            const jsonDocs = items.map(item => {
              // Filter fields if needed
              let docToExport = item;
              if (includedFieldNames.length < input.fields.length) {
                const filteredItem: Record<string, unknown> = {};
                includedFieldNames.forEach(field => {
                  if (field in item) {
                    filteredItem[field] = item[field];
                  }
                });
                docToExport = filteredItem;
              }
              return input.beautifyJson
                ? jsonify.stringify(docToExport, null, 2)
                : jsonify.stringify(docToExport);
            });
            // Add comma separator between batches
            const prefix = isFirstBatch ? '' : ',\n';
            dataToWrite = prefix + jsonDocs.join(',\n');
            isFirstBatch = false;
          } else {
            // CSV format
            // For DynamoDB, items are already flat objects, no need to wrap in _source
            dataToWrite = convertToCsv(includedFieldNames, items);
          }

          await sourceFileApi.saveFile(dataFilePath, dataToWrite, appendFile);
          appendFile = true;

          // Check if there are more pages
          if (!queryResult.last_evaluated_key) {
            hasMore = false;
          } else {
            exclusiveStartKey = queryResult.last_evaluated_key;
          }
        }

        // Close JSON array if needed
        if (input.exportFileType === 'json') {
          await sourceFileApi.saveFile(dataFilePath, '\n]', true);
        }

        // Update metadata with actual row count
        metadata.export.rowCount = totalItems;
        await sourceFileApi.saveFile(
          metadataFilePath,
          input.beautifyJson ? jsonify.stringify(metadata, null, 2) : jsonify.stringify(metadata),
          false,
        );

        return dataFilePath;
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },

    addRunningTask(task: ExportTask) {
      this.runningTasks.push(task);
    },

    updateTaskStatus(
      taskId: string,
      status: ExportTask['status'],
      progress?: { complete: number; total: number },
      error?: string,
    ) {
      const task = this.runningTasks.find(t => t.id === taskId);
      if (task) {
        task.status = status;
        if (progress) {
          task.progress = progress;
        }
        if (error) {
          task.error = error;
        }
        if (status === 'completed' || status === 'failed') {
          task.endTime = new Date();
        }
      }
    },

    removeTask(taskId: string) {
      const index = this.runningTasks.findIndex(t => t.id === taskId);
      if (index !== -1) {
        this.runningTasks.splice(index, 1);
      }
    },

    clearCompletedTasks() {
      this.runningTasks = this.runningTasks.filter(
        t => t.status === 'pending' || t.status === 'running',
      );
    },
  },
});

// Helper functions
const bulkRequest = async (
  client: { post: Function },
  bulkData: Array<unknown>,
): Promise<{ inserted: number; updated: number; skipped: number }> => {
  const response = await client.post(`/_bulk`, undefined, bulkData.join('\r\n') + '\r\n');

  if (response.status && response.status !== 200) {
    throw new CustomError(
      response.status,
      get(
        response,
        'details',
        get(response, 'message', jsonify.stringify(get(response, 'error.root_cause', ''))),
      ),
    );
  }

  // Parse bulk response to count operations
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const items = response?.items || [];
  for (const item of items) {
    const operation = item.index || item.create || item.update || item.delete;
    if (operation) {
      // Check for errors first
      if (operation.error) {
        // Check if it's a conflict error (document already exists in append mode)
        if (
          operation.status === 409 ||
          operation.error?.type === 'version_conflict_engine_exception'
        ) {
          skipped++;
        } else {
          // Other errors are also considered skipped
          skipped++;
        }
      } else if (operation.status >= 200 && operation.status < 300) {
        // Success - check result to determine if insert or update
        if (operation.result === 'created') {
          inserted++;
        } else if (operation.result === 'updated') {
          updated++;
        } else if (operation.result === 'noop') {
          // Document unchanged, count as updated (successful operation)
          updated++;
        } else {
          // Other successful results (e.g., deleted) count as updated
          updated++;
        }
      } else {
        // Unknown status, count as skipped to be safe
        skipped++;
      }
    }
  }

  return { inserted, updated, skipped };
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const convertToCsv = (
  headers: string[],
  data: Array<{ _id?: string; _source?: { [key: string]: unknown }; [key: string]: unknown }>,
): string => {
  return (
    data
      .map(item =>
        headers
          .map(header => {
            // Handle _id specially as it's a top-level property for Elasticsearch
            let value;
            if (header === '_id' && '_id' in item) {
              value = item._id;
            } else if ('_source' in item && item._source) {
              // Elasticsearch format: data is in _source
              value = get(item, `_source.${header}`, null);
            } else {
              // DynamoDB format: data is flat on the item
              value = item[header];
            }

            // Distinguish between null/undefined and empty string
            if (value === null || value === undefined) {
              // Export as empty field (will be null on import)
              return '';
            }

            if (value === '') {
              // Export empty string as quoted empty to preserve it
              return '""';
            }

            if (typeof value === 'object') {
              // Escape and quote JSON values
              const jsonStr = jsonify.stringify(value);
              return `"${jsonStr.replace(/"/g, '""')}"`;
            }
            // Handle strings with commas, quotes, or newlines
            const strValue = String(value);
            if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
              return `"${strValue.replace(/"/g, '""')}"`;
            }
            return strValue;
          })
          .join(','),
      )
      .join('\r\n') + '\r\n'
  );
};
