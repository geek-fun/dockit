import { defineStore } from 'pinia';

export const useCodeActionStore = defineStore('codeAction', {
  state: (): {
    insertBuffer: string;
  } => ({
    insertBuffer: '',
  }),
  actions: {
    setInsertBuffer(content: string) {
      this.insertBuffer = content;
    },
    clearInsertBuffer() {
      this.insertBuffer = '';
    },
  },
});
