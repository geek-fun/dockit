import { defineStore } from 'pinia';
export const useAppStore = defineStore('app', {
  state() {
    return {
      themeType: 0, // 0 auto, 1: dark, 2: light
    };
  },
  actions: {
    setThemeType(args: number) {
      this.themeType = args;
    },
  },
});
