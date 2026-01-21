import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
  state: () => ({
    accessToken: '', // 访问令牌
  }),
  getters: {
    getToken: state => state.accessToken,
  },
  actions: {
    setToken(accessToken: string): void {
      this.accessToken = accessToken;
    },
    resetToken(): void {
      this.accessToken = '';
    },
  },
  persist: {
    pick: ['accessToken'],
    storage: localStorage,
  },
});
