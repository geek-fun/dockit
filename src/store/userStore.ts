import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
  state: () => ({
    accessToken: '',
    username: '',
    email: '',
  }),
  getters: {
    getToken: state => state.accessToken,
    isLoggedIn: state => state.accessToken.length > 0,
  },
  actions: {
    setToken(accessToken: string): void {
      this.accessToken = accessToken;
    },
    resetToken(): void {
      this.accessToken = '';
    },
    setAuth(token: string, username: string, email: string): void {
      this.accessToken = token;
      this.username = username;
      this.email = email;
    },
  },
  persist: {
    pick: ['accessToken', 'username', 'email'],
    storage: localStorage,
  },
});
