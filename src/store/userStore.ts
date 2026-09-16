import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
  state: () => ({
    accessToken: '',
    /** Device-bound 30-day lease (geekfun#59) — lives with the session so a
     * logout (or a web re-login) invalidates it with the rest. */
    refreshToken: '',
    /** Console account identity, delivered by the web login deep link. */
    userId: '',
    avatar: '',
    username: '',
    email: '',
  }),
  getters: {
    getToken: state => state.accessToken,
    isLoggedIn: state => state.accessToken.length > 0,
    /** Best available label for the signed-in account. */
    displayName: state => state.username || state.email || '',
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
    setAuth(token: string, username: string, email: string, userId = '', avatar = ''): void {
      this.accessToken = token;
      this.username = username;
      this.email = email;
      this.userId = userId ?? '';
      this.avatar = avatar ?? '';
      // A web login has no device lease yet — never carry one over.
      this.refreshToken = '';
    },
  },
  persist: {
    pick: ['accessToken', 'refreshToken', 'userId', 'avatar', 'username', 'email'],
    storage: localStorage,
  },
});
