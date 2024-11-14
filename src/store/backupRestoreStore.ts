import { open } from '@tauri-apps/api/dialog';

import { defineStore } from 'pinia';
import { CustomError } from '../common';
import { get } from 'lodash';

export const useBackupRestoreStore = defineStore('backupRestoreStore', {
  state(): { folderPath: string; fileName: string } {
    return {
      folderPath: '',
      fileName: '',
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
  },
});
