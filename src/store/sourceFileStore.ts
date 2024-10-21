import { open } from '@tauri-apps/api/dialog';
import { readDir } from '@tauri-apps/api/fs';
import { defineStore } from 'pinia';
import { sourceFileApi } from '../datasources';
import { CustomError } from '../common';

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
  state(): { defaultFile: string; folderPath: string; fileList: FileItem[] } {
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
    async openFolder() {
      try {
        this.folderPath = (await open({
          recursive: true,
          directory: true,
        })) as string;
        if (this.folderPath) {
          const files = (await readDir(this.folderPath as string)).sort((a, b) => {
            if (a.children && !b.children) return -1;
            if (!a.children && b.children) return 1;
            return a?.name?.localeCompare(b?.name ?? '') || 0;
          });
          this.fileList = files.map(file => ({
            path: file.path,
            name: file.name,
            type: file.children ? FileType.FOLDER : FileType.FILE,
          }));
        }
      } catch (error) {
        throw new CustomError(500, (error as Error).message);
      }
    },
  },
});
