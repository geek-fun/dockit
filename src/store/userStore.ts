import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
  state: () => ({
    accessToken: '', // 访问令牌
  }),
  getters: {
    getToken(): string {
      return this.accessToken;
    },
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
    paths: ['accessToken'],
    storage: localStorage,
  },
});
