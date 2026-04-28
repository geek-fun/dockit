import { getDocLanguage } from '../../src/lang/index';

const mockLocalStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    clear: () => {
      Object.keys(store).forEach(key => delete store[key]);
    },
  };
};

describe('lang/index', () => {
  describe('getDocLanguage', () => {
    let originalLocalStorage: Storage;
    let originalNavigator: Navigator;

    beforeEach(() => {
      originalLocalStorage = global.localStorage;
      originalNavigator = global.navigator;
    });

    afterEach(() => {
      global.localStorage = originalLocalStorage;
      global.navigator = originalNavigator;
    });

    it('should return "en" when localStorage is undefined', () => {
      Object.defineProperty(global, 'localStorage', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(getDocLanguage()).toBe('en');
    });

    it('should return "en" when lang is "auto" and navigator.language is not zh-CN', () => {
      const store = mockLocalStorage();
      store.setItem('lang', 'auto');
      Object.defineProperty(global, 'localStorage', {
        value: store,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(global, 'navigator', {
        value: { language: 'en-US' },
        writable: true,
        configurable: true,
      });
      expect(getDocLanguage()).toBe('en');
    });

    it('should return "cn" when lang is "auto" and navigator.language is zh-CN', () => {
      const store = mockLocalStorage();
      store.setItem('lang', 'auto');
      Object.defineProperty(global, 'localStorage', {
        value: store,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(global, 'navigator', {
        value: { language: 'zh-CN' },
        writable: true,
        configurable: true,
      });
      expect(getDocLanguage()).toBe('cn');
    });

    it('should return "en" when lang is "enUS"', () => {
      const store = mockLocalStorage();
      store.setItem('lang', 'enUS');
      Object.defineProperty(global, 'localStorage', {
        value: store,
        writable: true,
        configurable: true,
      });
      expect(getDocLanguage()).toBe('en');
    });

    it('should return "cn" when lang is "zhCN"', () => {
      const store = mockLocalStorage();
      store.setItem('lang', 'zhCN');
      Object.defineProperty(global, 'localStorage', {
        value: store,
        writable: true,
        configurable: true,
      });
      expect(getDocLanguage()).toBe('cn');
    });

    it('should return "en" when lang is not set', () => {
      const store = mockLocalStorage();
      Object.defineProperty(global, 'localStorage', {
        value: store,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(global, 'navigator', {
        value: { language: 'en-US' },
        writable: true,
        configurable: true,
      });
      expect(getDocLanguage()).toBe('en');
    });

    it('should return "en" when navigator is undefined', () => {
      const store = mockLocalStorage();
      store.setItem('lang', 'auto');
      Object.defineProperty(global, 'localStorage', {
        value: store,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(global, 'navigator', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(getDocLanguage()).toBe('en');
    });
  });
});
