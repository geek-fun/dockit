import { defineStore } from 'pinia';
import { sourceFileApi } from '../datasources';

const sourceFilePath = 'search/default.search';

export const useSourceFileStore = defineStore('sourceFileStore', {
  state(): { defaultFile: string } {
    return {
      defaultFile: '',
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
  },
});
