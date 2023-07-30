import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
  state() {
    return {
      userInfo: {
        id: 1,
      },
    };
  },
  getters: {},
  actions: {},
});
