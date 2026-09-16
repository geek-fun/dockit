import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
  state: () => ({
    accessToken: '',
    /** Device-bound 30-day lease (geekfun#59) — lives with the session so a
     * logout (or a web re-login) invalidates it with the rest. */
    refreshToken: '',
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
    setRefreshToken(token: string): void {
      this.refreshToken = token;
    },
    resetToken(): void {
      this.accessToken = '';
      this.refreshToken = '';
      this.username = '';
      this.email = '';
    },
    setAuth(token: string, username: string, email: string): void {
      this.accessToken = token;
      this.username = username;
      this.email = email;
      // A web login has no device lease yet — never carry one over.
      this.refreshToken = '';
    },
  },
  persist: {
    pick: ['accessToken', 'refreshToken', 'username', 'email'],
    storage: localStorage,
  },
});
