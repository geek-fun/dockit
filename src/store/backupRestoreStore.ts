import { open } from '@tauri-apps/plugin-dialog';

import { defineStore } from 'pinia';
import { CustomError, jsonify } from '../common';
import { get } from 'lodash';
import { Connection, DatabaseType } from './connectionStore.ts';
import { loadHttpClient, sourceFileApi } from '../datasources';

export type BackupInput = {
  connection: Connection;
  index: string;
  backupFolder: string;
  backupFileName: string;
  backupFileType: string;
};

export type RestoreInput = {
  connection: Connection;
  index: string;
  restoreFile: string;
};

export const useBackupRestoreStore = defineStore('backupRestoreStore', {
  state(): {
    folderPath: string;
    fileName: string;
    backupProgress: { complete: number; total: number } | null;
    restoreProgress: { complete: number; total: number } | null;
    restoreFile: string;
  } {
    return {
      folderPath: '',
      fileName: '',
      backupProgress: null,
      restoreProgress: null,
      restoreFile: '',
    };
  },
  persist: true,
  getters: {},
  actions: {
    async selectFolder() {
      try {
        this.folderPath = (await open({ recursive: true, directory: true })) as string;
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },
    async selectFile() {
      try {
        this.restoreFile = (await open({
          multiple: false,
          directory: false,
          filters: [
            {
              name: 'Backup/Restore Files',
              extensions: ['csv', 'json'],
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
    async checkFileExist(input: Omit<BackupInput, 'connection'>) {
      const filePath = `/${input.backupFolder}/${input.backupFileName}.${input.backupFileType}`;
      try {
        return await sourceFileApi.exists(filePath);
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },
    async backupToFile(input: BackupInput) {
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
      const filePath = `${input.backupFolder}/${input.backupFileName}.${input.backupFileType}`;
      let searchAfter: any[] | undefined = undefined;
      let hasMore = true;
      let appendFile = false;

      try {
        this.backupProgress = {
          complete: 0,
          total: (await client.get(`/${input.index}/_count`)).count,
        };
        const { [input.index]: backupIndexMapping } = await client.get(`/${input.index}/_mapping`);
        const csvHeaders = buildCsvHeaders(backupIndexMapping);
        let dataToWrite = input.backupFileType === 'json' ? '' : csvHeaders.join(',') + '\r\n';

        while (hasMore) {
          const response = await client.get(
            `/${input.index}/_search`,
            undefined,
            jsonify.stringify({
              size: 1000,
              search_after: searchAfter,
              sort: [{ _doc: 'asc' }],
            }),
          );
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

          this.backupProgress.complete += hits.length;
          if (hits.length === 0) {
            hasMore = false;
          } else {
            searchAfter = hits[hits.length - 1].sort;
            dataToWrite +=
              input.backupFileType === 'json'
                ? jsonify.stringify(hits)
                : convertToCsv(csvHeaders, hits);
            await sourceFileApi.saveFile(filePath, dataToWrite, appendFile);
            dataToWrite = '';
            appendFile = true;
          }
        }
        return filePath;
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },
    async restoreFromFile(input: RestoreInput) {
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
          const hits: Array<{
            _index: string;
            _id: string;
            _score: number;
            _source: unknown;
          }> = jsonify.parse(data);
          this.restoreProgress = {
            complete: 0,
            total: hits.length,
          };
          for (let i = 0; i < hits.length; i += bulkSize) {
            const bulkData = hits
              .slice(i, i + bulkSize)
              .flatMap(hit => [{ index: { _index: input.index, _id: hit._id } }, hit._source])
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
  },
});

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

const buildCsvHeaders = ({
  mappings,
}: {
  mappings: {
    properties: {
      [key: string]: unknown;
    };
  };
}) => {
  return Object.keys(mappings.properties);
};

const convertToCsv = (headers: Array<string>, data: unknown[]) => {
  return data
    .map(item =>
      headers
        .map(header => {
          const data = get(item, `_source.${header}`, null);
          return data === null || !['object', 'symbol', 'function'].includes(typeof data)
            ? data
            : jsonify.stringify(data);
        })
        .join(','),
    )
    .join('\r\n');
};
