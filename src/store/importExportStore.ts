import { open } from '@tauri-apps/plugin-dialog';

import { defineStore } from 'pinia';
import { CustomError, jsonify } from '../common';
import { get } from 'lodash';
import {
  Connection,
  DatabaseType,
  ElasticsearchConnection,
  DynamoDBConnection,
} from './connectionStore.ts';
import { loadHttpClient, sourceFileApi, dynamoApi } from '../datasources';

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
export type FileType = 'ndjson' | 'json' | 'csv';

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
    restoreProgress: { complete: number; total: number } | null;
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
      fileType: 'ndjson',
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
      const client = loadHttpClient({
        host: input.connection.host,
        port: input.connection.port,
        sslCertVerification: input.connection.sslCertVerification,
      });
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
            _index: string;
            _id: string;
            _score: number;
            _source: unknown;
            sort: unknown[];
          }> = [];

          for (const jsonArray of jsonArrays) {
            try {
              const hits = jsonify.parse(jsonArray);
              if (Array.isArray(hits)) {
                allHits.push(...hits);
              }
            } catch (e) {
              // Continue with other arrays even if one fails
            }
          }

          this.restoreProgress = {
            complete: 0,
            total: allHits.length,
          };
          for (let i = 0; i < allHits.length; i += bulkSize) {
            const bulkData = allHits
              .slice(i, i + bulkSize)
              .flatMap(hit => [{ index: { _index: input.index, _id: hit._id } }, hit._source])
              .map(item => jsonify.stringify(item));

            await bulkRequest(client, bulkData);

            this.restoreProgress.complete += bulkData.length / 2;
          }
        } else if (fileType === 'ndjson') {
          // Parse NDJSON format - one JSON object per line
          const lines = data.split('\n').filter(line => line.trim());
          this.restoreProgress = {
            complete: 0,
            total: lines.length,
          };

          for (let i = 0; i < lines.length; i += bulkSize) {
            const bulkData = lines
              .slice(i, i + bulkSize)
              .flatMap(line => {
                try {
                  const doc = jsonify.parse(line);
                  const { _id, ...source } = doc;
                  return [{ index: { _index: input.index, _id } }, source];
                } catch {
                  return [];
                }
              })
              .map(item => jsonify.stringify(item));

            await bulkRequest(client, bulkData);

            this.restoreProgress.complete += bulkData.length / 2;
          }
        } else if (fileType === 'csv') {
          const lines = data.split('\r\n');
          const headers = lines[0].split(',');
          this.restoreProgress = {
            complete: 0,
            total: lines.length - 1,
          };

          for (let i = 1; i < lines.length; i += bulkSize) {
            const bulkData = lines
              .slice(i, i + bulkSize)
              .flatMap(line => {
                const values = line.split(',');
                const body = headers.reduce(
                  (acc, header, index) => {
                    let value = values[index];
                    try {
                      value = jsonify.parse(value);
                    } catch (e) {
                      // value is not a JSON string, keep it as is
                    }
                    acc[header] = value;
                    return acc;
                  },
                  {} as { [key: string]: unknown },
                );

                return [{ index: { _index: input.index } }, body];
              })
              .map(item => jsonify.stringify(item));

            await bulkRequest(client, bulkData);

            this.restoreProgress.complete += bulkData.length / 2;
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
        } else if (fileType === 'ndjson') {
          // Parse NDJSON format - one JSON object per line
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
          // Parse CSV
          const lines = data.split('\r\n').filter(line => line.trim());
          const headers = lines[0].split(',');
          items = lines.slice(1).map(line => {
            const values = line.split(',');
            return headers.reduce(
              (acc, header, index) => {
                let value: unknown = values[index];
                try {
                  value = jsonify.parse(values[index]);
                } catch {
                  // Keep as string
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
        };

        // Import items in batches using createItem
        const batchSize = 25; // DynamoDB batch write limit
        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize);

          for (const item of batch) {
            // Convert to DynamoDB attribute format
            const attributes = Object.entries(item).map(([key, value]) => ({
              name: key,
              value: value,
              type: this.inferDynamoDBType(value),
            }));

            await dynamoApi.createItem(dynamoConnection, attributes);
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
              extensions: ['csv', 'json', 'ndjson'],
            },
          ],
        });
        if (selected) {
          this.importDataFile = selected as string;
          this.validateImportStep2();

          // Parse the data file to extract structure
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
        const fileType = this.importDataFile.split('.').pop()?.toLowerCase();
        const data = await sourceFileApi.readFile(this.importDataFile);

        let sampleDoc: Record<string, unknown> | null = null;

        if (fileType === 'json') {
          const parsed = jsonify.parse(data);
          if (Array.isArray(parsed) && parsed.length > 0) {
            sampleDoc = parsed[0];
          } else if (typeof parsed === 'object') {
            sampleDoc = parsed;
          }
        } else if (fileType === 'ndjson') {
          const lines = data.split('\n').filter((line: string) => line.trim());
          if (lines.length > 0) {
            sampleDoc = jsonify.parse(lines[0]);
          }
        } else if (fileType === 'csv') {
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

          // Build schema comparison
          await this.buildSchemaComparison();
        }
      } catch (error) {
        console.error('Error parsing data file:', error);
        this.importValidationErrors.push('Failed to parse data file structure');
      }
    },

    extractFieldsFromObject(
      obj: Record<string, unknown>,
      prefix = '',
    ): Array<{ name: string; type: string; value: unknown }> {
      const fields: Array<{ name: string; type: string; value: unknown }> = [];

      for (const [key, value] of Object.entries(obj)) {
        const fieldName = prefix ? `${prefix}.${key}` : key;
        const fieldType = this.inferFieldType(value);

        if (fieldType === 'OBJECT' && value && typeof value === 'object' && !Array.isArray(value)) {
          // Recursively extract nested fields
          fields.push(...this.extractFieldsFromObject(value as Record<string, unknown>, fieldName));
        } else {
          fields.push({ name: fieldName, type: fieldType, value });
        }
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

      try {
        if (this.importConnection.type === DatabaseType.ELASTICSEARCH) {
          const client = loadHttpClient({
            host: this.importConnection.host,
            port: this.importConnection.port,
            sslCertVerification: this.importConnection.sslCertVerification,
          });

          const response = await client.get<{
            [index: string]: { mappings: { properties?: Record<string, { type?: string }> } };
          }>(`/${this.importTargetIndex}/_mapping`);

          const indexData = response.data[this.importTargetIndex];
          if (indexData?.mappings?.properties) {
            const schema: Record<string, string> = {};
            for (const [fieldName, fieldInfo] of Object.entries(indexData.mappings.properties)) {
              schema[fieldName] = fieldInfo.type || 'unknown';
            }
            return schema;
          }
        } else if (this.importConnection.type === DatabaseType.DYNAMODB) {
          // For DynamoDB, we need to describe the table
          const tableInfo = await dynamoApi.describeTable(
            this.importConnection as DynamoDBConnection,
            this.importTargetIndex,
          );
          if (tableInfo?.Table?.AttributeDefinitions) {
            const schema: Record<string, string> = {};
            for (const attr of tableInfo.Table.AttributeDefinitions) {
              schema[attr.AttributeName] = attr.AttributeType === 'N' ? 'NUMBER' : 'STRING';
            }
            return schema;
          }
        }
      } catch (error) {
        console.error('Error fetching existing schema:', error);
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

          // Rebuild schema comparison if data file is already loaded
          if (this.importDataFile) {
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
        // Existing collection: only need data file
        this.importValidationStatus.step2 = !!this.importDataFile;
      }
    },

    // Step 3: Schema validated
    validateImportStep3() {
      // Step 3 is valid when schema comparison is done and there are schema fields
      this.importValidationStatus.step3 = this.importSchemaFields.length > 0;
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

    validateDatabaseCompatibility(): { valid: boolean; errors: string[] } {
      const errors: string[] = [];

      if (!this.importMetadata || !this.importConnection) {
        errors.push('Metadata and connection are required for validation');
        return { valid: false, errors };
      }

      // Check database type compatibility
      const sourceDbType = this.importMetadata.source.dbType.toLowerCase();
      const targetDbType = this.importConnection.type.toLowerCase();

      if (sourceDbType !== targetDbType) {
        errors.push(`Database type mismatch: source is ${sourceDbType}, target is ${targetDbType}`);
      }

      return { valid: errors.length === 0, errors };
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
      const compatibility = this.validateDatabaseCompatibility();
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
      this.validateStep1();
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
      this.fileType = 'ndjson';
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

      const esConnection = this.connection as ElasticsearchConnection;
      const client = loadHttpClient({
        host: esConnection.host,
        port: esConnection.port,
        sslCertVerification: esConnection.sslCertVerification,
      });

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

        const indexMapping = mappingResponse[this.selectedIndex];
        if (!indexMapping?.mappings?.properties) {
          throw new CustomError(404, 'No mapping found for index');
        }

        // Get sample documents
        const sampleResponse = await client.get<{
          hits: {
            hits: Array<{
              _source: { [key: string]: unknown };
            }>;
          };
        }>(`/${this.selectedIndex}/_search`, undefined, jsonify.stringify({ size: 1 }));

        const sampleDoc = sampleResponse.hits?.hits?.[0]?._source || {};

        // Get document count
        const countResponse = await client.get<{ count: number }>(`/${this.selectedIndex}/_count`);
        this.estimatedRows = countResponse.count;

        // Build fields array
        const fields: FieldInfo[] = Object.entries(indexMapping.mappings.properties).map(
          ([name, config]) => {
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
          },
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

        // Scan to get a sample document - always use the base table name
        const queryResult = await dynamoApi.scanTable(dynamoConnection, {
          tableName: dynamoConnection.tableName,
          indexName: this.selectedIndex,
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

        // Merge with sample document to get all fields
        const allFields = new Set([...Array.from(attributeMap.keys()), ...Object.keys(sampleDoc)]);

        const fields: FieldInfo[] = Array.from(allFields).map(name => {
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
      const client = loadHttpClient({
        host: esConnection.host,
        port: esConnection.port,
        sslCertVerification: esConnection.sslCertVerification,
      });
      const dbVersion = esConnection.version || '';

      // Use the configured fileName from input
      // NDJSON files use .json extension
      const fileExtension = input.exportFileType === 'ndjson' ? 'json' : input.exportFileType;
      const dataFileName = `${input.exportFileName}.${fileExtension}`;
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
            format: input.exportFileType === 'ndjson' ? 'json' : input.exportFileType,
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

            if (input.exportFileType === 'ndjson') {
              // NDJSON format - one JSON object per line (compact format as per NDJSON spec)
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
      // NDJSON files use .json extension
      const fileExtension = input.exportFileType === 'ndjson' ? 'json' : input.exportFileType;
      const dataFileName = `${input.exportFileName}.${fileExtension}`;
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
            format: input.exportFileType === 'ndjson' ? 'json' : input.exportFileType,
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

          if (input.exportFileType === 'ndjson') {
            // NDJSON format - one JSON object per line
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
            dataToWrite = convertToCsv(
              includedFieldNames,
              items.map(item => ({ _source: item })),
            );
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
const bulkRequest = async (client: { post: Function }, bulkData: Array<unknown>) => {
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
  data: Array<{ _source: { [key: string]: unknown } }>,
): string => {
  return (
    data
      .map(item =>
        headers
          .map(header => {
            const value = get(item, `_source.${header}`, null);
            if (value === null || value === undefined) {
              return '';
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
