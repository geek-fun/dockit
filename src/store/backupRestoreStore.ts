import { open } from '@tauri-apps/api/dialog';

import { defineStore } from 'pinia';
import { CustomError } from '../common';
import { get } from 'lodash';
import { Connection } from './connectionStore.ts';
import { loadHttpClient, sourceFileApi } from '../datasources';
// import { loadHttpClient } from '../datasources';
export type typeBackupInput = {
  connection: Connection;
  index: string;
  backupFolder: string;
  backupFileName: string;
  backupFileType: string;
};

export const useBackupRestoreStore = defineStore('backupRestoreStore', {
  state(): {
    folderPath: string;
    fileName: string;
    backupProgress: { complete: number; total: number } | null;
  } {
    return {
      folderPath: '',
      fileName: '',
      backupProgress: null,
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
    async backupToFile(input: typeBackupInput) {
      const client = loadHttpClient(input.connection);
      const filePath = `${input.backupFolder}/${input.backupFileName}.${input.backupFileType}`;
      let searchAfter: any[] | undefined = undefined;
      let hasMore = true;
      try {
        this.backupProgress = {
          complete: 0,
          total: (await client.get(`/${input.index}/_count`)).count,
        };

        while (hasMore) {
          const response = await client.get(
            `/${input.index}/_search`,
            undefined,
            JSON.stringify({
              size: 1000,
              search_after: searchAfter,
              sort: [{ _doc: 'asc' }],
            }),
          );

          const hits = response.hits.hits;

          this.backupProgress.complete += hits.length;
          if (hits.length === 0) {
            hasMore = false;
          } else {
            searchAfter = hits[hits.length - 1].sort;
            const dataToWrite =
              input.backupFileType === 'json'
                ? JSON.stringify(hits)
                : JSON.stringify(convertToCsv(hits));
            await sourceFileApi.saveFile(filePath, dataToWrite, true);
          }
        }
        return filePath;
      } catch (error) {
        sourceFileApi.deleteFileOrFolder(filePath).catch();
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },
  },
});

const flattenObject = (obj: any, parent: string = '', res: any = {}) => {
  for (let key in obj) {
    const propName = parent ? `${parent}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      flattenObject(obj[key], propName, res);
    } else {
      res[propName] = obj[key];
    }
  }
  return res;
};

const convertToCsv = (data: any[]) => {
  if (data.length === 0) {
    return { headers: [], data: [] };
  }

  const flattenedData = data.map(row => flattenObject(row));
  const headers = Array.from(new Set(flattenedData.flatMap(row => Object.keys(row))));
  const csvRows = flattenedData.map(row =>
    headers.map(header => JSON.stringify(row[header] ?? '')).join(','),
  );

  return { headers, data: csvRows };
};
