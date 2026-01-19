import { open } from '@tauri-apps/plugin-dialog';

import { defineStore } from 'pinia';
import { CustomError, jsonify } from '../common';
import { get } from 'lodash';
import { Connection, DatabaseType, ElasticsearchConnection } from './connectionStore.ts';
import { loadHttpClient, sourceFileApi } from '../datasources';

export type FileType = 'ndjson' | 'csv';

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

export const useExportStore = defineStore('exportStore', {
  state(): {
    folderPath: string;
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
      folderPath: '',
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
  persist: true,
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
  },
  actions: {
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

    setFilterQuery(query: string) {
      this.filterQuery = query;
    },

    resetExportForm() {
      this.folderPath = '';
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

      if (this.connection.type !== DatabaseType.ELASTICSEARCH) {
        throw new CustomError(400, 'Unsupported connection type');
      }

      const client = loadHttpClient({
        host: this.connection.host,
        port: this.connection.port,
        sslCertVerification: this.connection.sslCertVerification,
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

    async exportToFile(input: ExportInput): Promise<string> {
      let client;
      if (input.connection.type === DatabaseType.ELASTICSEARCH) {
        client = loadHttpClient({
          host: input.connection.host,
          port: input.connection.port,
          sslCertVerification: input.connection.sslCertVerification,
        });
      } else {
        throw new CustomError(400, 'Unsupported connection type');
      }

      const dataFilePath = `${input.exportFolder}/${input.exportFileName}.${input.exportFileType}`;
      const metadataFilePath = `${input.exportFolder}/${input.exportFileName}_metadata.json`;

      let searchAfter: unknown[] | undefined = undefined;
      let hasMore = true;
      let appendFile = false;

      try {
        // Create directory if needed
        if (input.createDirectory) {
          try {
            await sourceFileApi.createFolder(input.exportFolder);
          } catch {
            // Folder might already exist, continue
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

        // Build metadata
        const metadata = {
          version: '1.0',
          exportDate: new Date().toISOString(),
          source: {
            type: input.connection.type,
            index: input.index,
            host: (input.connection as ElasticsearchConnection).host,
          },
          dataFile: `${input.exportFileName}.${input.exportFileType}`,
          format: input.exportFileType,
          encoding: 'UTF-8',
          totalRows: countResponse.count,
          schema: {
            mappings: indexMapping?.mappings || {},
          },
          includedFields: input.fields.filter(f => f.includeInExport).map(f => f.name),
        };

        // Write metadata file
        await sourceFileApi.saveFile(
          metadataFilePath,
          jsonify.stringify(metadata, null, 2),
          false,
        );

        // Build CSV headers if needed
        const includedFieldNames = input.fields.filter(f => f.includeInExport).map(f => f.name);

        if (input.exportFileType === 'csv') {
          // Write CSV header
          await sourceFileApi.saveFile(dataFilePath, includedFieldNames.join(',') + '\r\n', false);
          appendFile = true;
        }

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

          this.exportProgress.complete += hits.length;

          if (hits.length === 0) {
            hasMore = false;
          } else {
            searchAfter = hits[hits.length - 1].sort;

            let dataToWrite: string;

            if (input.exportFileType === 'ndjson') {
              // NDJSON format - one JSON object per line
              dataToWrite = hits
                .map(hit => {
                  const doc = { _id: hit._id, ...hit._source };
                  return input.beautifyJson
                    ? jsonify.stringify(doc)
                    : jsonify.stringify(doc);
                })
                .join('\n');
              if (dataToWrite) {
                dataToWrite += '\n';
              }
            } else {
              // CSV format
              dataToWrite = convertToCsv(includedFieldNames, hits);
            }

            await sourceFileApi.saveFile(dataFilePath, dataToWrite, appendFile);
            appendFile = true;
          }
        }

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
