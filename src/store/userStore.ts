import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
  state: () => ({
    sessionRevision: 0,
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
    applySessionRefresh(
      previousRefreshToken: string,
      accessToken: string,
      refreshToken: string,
    ): void {
      if (!this.isLoggedIn || !previousRefreshToken || this.refreshToken !== previousRefreshToken)
        return;
      this.$patch({ accessToken: accessToken, refreshToken });
    },
    setToken(accessToken: string): void {
      this.accessToken = accessToken;
    },
    setRefreshToken(token: string): void {
      this.refreshToken = token;
    },
    resetToken(): void {
      this.sessionRevision += 1;
      this.accessToken = '';
      this.refreshToken = '';
      this.username = '';
      this.email = '';
      this.userId = '';
      this.avatar = '';
    },
    setAuth(token: string, username: string, email: string, userId = '', avatar = ''): void {
      this.sessionRevision += 1;
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
