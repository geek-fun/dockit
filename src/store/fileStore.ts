import { defineStore } from 'pinia';
import { PathInfo, sourceFileApi } from '../datasources';
import { CustomError } from '../common';
import { get } from 'lodash';

export enum ToolBarAction {
  ADD_DOCUMENT = 'ADD_DOCUMENT',
  ADD_FOLDER = 'ADD_FOLDER',
  OPEN_FOLDER = 'OPEN_FOLDER',
}

export enum ContextMenuAction {
  CONTEXT_MENU_ACTION_OPEN = 'CONTEXT_MENU_ACTION_OPEN',
  CONTEXT_MENU_ACTION_RENAME = 'CONTEXT_MENU_ACTION_RENAME',
  CONTEXT_MENU_ACTION_DELETE = 'CONTEXT_MENU_ACTION_DELETE',
  CONTEXT_MENU_ACTION_NEW_FILE = 'CONTEXT_MENU_ACTION_NEW_FILE',
  CONTEXT_MENU_ACTION_NEW_FOLDER = 'CONTEXT_MENU_ACTION_NEW_FOLDER',
}

export const useFileStore = defineStore('fileStore', {
  state(): {
    fileContent: string;
    fileList: PathInfo[];
    activePath: PathInfo | undefined;
  } {
    return {
      fileContent: '',
      activePath: undefined,
      fileList: [],
    };
  },
  persist: true,
  getters: {
    breadCrumbPath: (state): string => {
      return state.activePath?.displayPath ?? '';
    },
  },
  actions: {
    async selectDirectory(path?: string) {
      try {
        const selectedPath = await sourceFileApi.selectFolder(path);

        const pathInfo = await sourceFileApi.getPathInfo(
          selectedPath ?? this.activePath?.path ?? '',
        );

        await this.fetchFileList(pathInfo?.path);

        this.activePath = pathInfo;
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },

    async changeDirectory(path?: string) {
      try {
        const pathInfo = await sourceFileApi.getPathInfo(
          path ?? this.activePath?.path ?? '.dockit',
        );
        if (!pathInfo) {
          throw new CustomError(404, 'Folder not found');
        }

        await this.fetchFileList(pathInfo.path);

        this.activePath = pathInfo;
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },

    async createFileOrFolder(action: ToolBarAction, name: string) {
      const path = this.activePath?.path.endsWith('.search')
        ? this.activePath?.path.substring(0, this.activePath?.path.lastIndexOf('/'))
        : this.activePath?.path;

      const targetPath = `${path}/${name}`;

      if (action === ToolBarAction.ADD_DOCUMENT) {
        await sourceFileApi.saveFile(targetPath, '');
      } else {
        await sourceFileApi.createFolder(targetPath);
      }
      await this.fetchFileList(this.activePath?.path);
    },

    async deleteFileOrFolder(path: string) {
      await sourceFileApi.deleteFileOrFolder(path);
      await this.fetchFileList(this.activePath?.path);
    },

    async renameFileOrFolder(oldPath: string, newPath: string) {
      await sourceFileApi.renameFileOrFolder(oldPath, newPath);
      await this.fetchFileList(this.activePath?.path);
    },

    async fetchFileList(inputPath?: string) {
      try {
        this.fileList = await sourceFileApi.readDir(inputPath ?? this.activePath?.path);
      } catch (error) {
        throw new CustomError(
          get(error, 'status', 500),
          get(error, 'details', get(error, 'message', '')),
        );
      }
    },
  },
});
