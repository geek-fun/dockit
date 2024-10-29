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
  state(): { fileContent: string; filePath: string; folderPath?: string; fileList: FileItem[] } {
    return {
      fileContent: '',
      filePath: '',
      folderPath: '',
      fileList: [],
    };
  },
  getters: {},
  actions: {
    async readSourceFromFile(path: string | undefined) {
      this.filePath = path && path !== ':filePath' ? path : sourceFilePath;
      this.fileContent = await sourceFileApi.readFile(this.filePath);
    },
    async saveSourceToFile(content: string, path: string | undefined) {
      if (path && path !== ':filePath' && path !== this.filePath) {
        this.filePath = path;
      }
      this.fileContent = content;
      await sourceFileApi.saveFile(this.filePath, content);
    },

    async openFolder(path?: string) {
      try {
        const selectedPath =
          path ?? ((await open({ recursive: true, directory: true, defaultPath: path })) as string);

        if (!(await exists(selectedPath))) {
          throw new CustomError(404, 'Folder not found');
        }

        this.fileList = (await readDir(selectedPath))
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

        this.folderPath = selectedPath;
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },
  },
});
