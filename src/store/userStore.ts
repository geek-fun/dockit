import { defineStore } from 'pinia';
import type { AuthCallbackData } from '../datasources/authService';

export type UserState = {
  accessToken: string;
  userId: string;
  username: string;
  email: string;
  avatar: string;
};

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    accessToken: '',
    userId: '',
    username: '',
    email: '',
    avatar: '',
  }),
  getters: {
    getToken: state => state.accessToken,
    isLoggedIn: state => !!state.accessToken,
    getUser: state => ({
      id: state.userId,
      username: state.username,
      email: state.email,
      avatar: state.avatar,
    }),
  },
  actions: {
    setToken(accessToken: string): void {
      this.accessToken = accessToken;
    },
    resetToken(): void {
      this.accessToken = '';
      this.userId = '';
      this.username = '';
      this.email = '';
      this.avatar = '';
    },
    setAuthFromCallback(data: AuthCallbackData): void {
      this.userId = '';
      this.username = '';
      this.email = '';
      this.avatar = '';
      this.accessToken = data.token;
      this.userId = data.userId || '';
      this.username = data.username || '';
      this.email = data.email || '';
      this.avatar = data.avatar || '';
    },
    logout(): void {
      this.resetToken();
    },
  },
  persist: {
    pick: ['accessToken', 'userId', 'username', 'email', 'avatar'],
    storage: localStorage,
  },
});
