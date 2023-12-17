import { defineStore } from 'pinia';

const { sourceFileAPI } = window;
export const useSourceFileStore = defineStore('sourceFileStore', {
  state(): { defaultFile: string } {
    return {
      defaultFile: '',
    };
  },
  getters: {},
  actions: {
    async readSourceFromFile() {
      this.defaultFile = await sourceFileAPI.readFile();
    },
    async saveSourceToFile(content: string) {
      this.defaultFile = content;
      await sourceFileAPI.saveFile(content);
    },
  },
});
