/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module '*.css';

export interface IElectronAPI {
  openGitHub: () => void;
}
export interface IStoreAPI {
  get: <T>(key: string, defaultValue: T) => Promise<T>;
  set: <T>(key: string, value: T) => Promise<void>;
}

export interface ISourceFileAPI {
  saveFile: (content: string) => Promise<void>;
  readFile: () => Promise<string>;
  onSaveChortcut: () => string;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
    storeAPI: IStoreAPI;
    sourceFileAPI: ISourceFileAPI;
  }
}
