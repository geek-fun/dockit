import { open } from '@tauri-apps/api/dialog';
import { exists, readDir } from '@tauri-apps/api/fs';
import { defineStore } from 'pinia';
import { sourceFileApi } from '../datasources';
import { CustomError } from '../common';
import { get } from 'lodash';

const sourceFilePath = 'search/default.search';

export enum ToolBarAction {
  ADD_DOCUMENT = 'ADD_DOCUMENT',
  ADD_FOLDER = 'ADD_FOLDER',
  OPEN_FOLDER = 'OPEN_FOLDER',
}

export enum FileType {
  FILE = 'FILE',
  FOLDER = 'FOLDER',
}

export type FileItem = {
  path: string;
  name: string | undefined;
  type: FileType;
};

export const useSourceFileStore = defineStore('sourceFileStore', {
  state(): { defaultFile: string; folderPath?: string; fileList: FileItem[] } {
    return {
      defaultFile: '',
      folderPath: '',
      fileList: [],
    };
  },
  getters: {},
  actions: {
    async readSourceFromFile() {
      this.defaultFile = await sourceFileApi.readFile(sourceFilePath);
    },
    async saveSourceToFile(content: string) {
      this.defaultFile = content;
      await sourceFileApi.saveFile(sourceFilePath, content);
    },
    async openFolder(path?: string) {
      this.folderPath = path;
      try {
        this.folderPath = path ?? ((await open({ recursive: true, directory: true })) as string);

        if (!(await exists(this.folderPath))) {
          throw new CustomError(404, 'Folder not found');
        }

        this.fileList = (await readDir(this.folderPath as string))
          .sort((a, b) => {
            if (a.children && !b.children) return -1;
            if (!a.children && b.children) return 1;
            return a?.name?.localeCompare(b?.name ?? '') || 0;
          })
          .map(file => ({
            path: file.path,
            name: file.name,
            type: file.children ? FileType.FOLDER : FileType.FILE,
          }));

        this.folderPath = path;
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },
  },
});
