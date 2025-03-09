import { open } from '@tauri-apps/api/dialog';
import { exists, readDir } from '@tauri-apps/api/fs';

import { defineStore } from 'pinia';
import { sourceFileApi } from '../datasources';
import { CustomError } from '../common';
import { get } from 'lodash';

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

export enum ContextMenuAction {
  CONTEXT_MENU_ACTION_OPEN = 'CONTEXT_MENU_ACTION_OPEN',
  CONTEXT_MENU_ACTION_RENAME = 'CONTEXT_MENU_ACTION_RENAME',
  CONTEXT_MENU_ACTION_DELETE = 'CONTEXT_MENU_ACTION_DELETE',
  CONTEXT_MENU_ACTION_NEW_FILE = 'CONTEXT_MENU_ACTION_NEW_FILE',
  CONTEXT_MENU_ACTION_NEW_FOLDER = 'CONTEXT_MENU_ACTION_NEW_FOLDER',
}

export const useSourceFileStore = defineStore('sourceFileStore', {
  state(): { fileContent: string; filePath: string; fileList: FileItem[] } {
    return {
      fileContent: '',
      filePath: '',
      fileList: [],
    };
  },
  persist: true,
  getters: {},
  actions: {
    async openFolder(path?: string) {
      try {
        const selectedPath =
          path ?? ((await open({ recursive: true, directory: true, defaultPath: path })) as string);

        if (!(await exists(selectedPath))) {
          throw new CustomError(404, 'Folder not found');
        }

        this.fileList = (await readDir(selectedPath))
          .filter(file => !file.name?.startsWith('.'))
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

        this.filePath = selectedPath;
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },
    async createFileOrFolder(action: ToolBarAction, name: string) {
      const path = this.filePath.endsWith('.search')
        ? this.filePath.substring(0, this.filePath.lastIndexOf('/'))
        : this.filePath;

      const targetPath = `${path}/${name}`;
      if (action === ToolBarAction.ADD_DOCUMENT) {
        await sourceFileApi.saveFile(targetPath, '');
      } else {
        await sourceFileApi.createFolder(targetPath);
      }
      await this.openFolder(this.filePath);
    },
    async deleteFileOrFolder(path: string) {
      await sourceFileApi.deleteFileOrFolder(path);
      await this.openFolder(this.filePath);
    },
    async renameFileOrFolder(oldPath: string, newPath: string) {
      await sourceFileApi.renameFileOrFolder(oldPath, newPath);
      await this.openFolder(this.filePath);
    },
  },
});
