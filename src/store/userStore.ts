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
    /** Signature expiry of `avatar` (unix seconds, 0 = unknown). */
    avatarExpiresAt: 0,
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
      this.avatarExpiresAt = 0;
    },
    setAuth(
      token: string,
      username: string,
      email: string,
      userId = '',
      avatar = '',
      avatarExpiresAt = 0,
    ): void {
      this.sessionRevision += 1;
      this.accessToken = token;
      this.username = username;
      this.email = email;
      this.userId = userId ?? '';
      this.avatar = avatar ?? '';
      this.avatarExpiresAt = avatarExpiresAt ?? 0;
      // A web login has no device lease yet — never carry one over.
      this.refreshToken = '';
    },
    setAvatar(avatar: string, avatarExpiresAt = 0): void {
      this.avatar = avatar;
      this.avatarExpiresAt = avatarExpiresAt;
    },
  },
  persist: {
    pick: [
      'accessToken',
      'refreshToken',
      'userId',
      'avatar',
      'avatarExpiresAt',
      'username',
      'email',
    ],
    storage: localStorage,
  },
});
