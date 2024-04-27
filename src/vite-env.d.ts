/// <reference types="vite/client" />

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module '*.css';

export interface IElectronAPI {
  openGitHub: () => void;
  openLink: (link: string) => void;
  versions: () => Promise<{
    node: string;
    chrome: string;
    electron: string;
    version: string;
    name: string;
  }>;
}
export interface IStoreAPI {
  get: <T>(key: string, defaultValue: T) => Promise<T>;
  set: <T>(key: string, value: T) => Promise<void>;
  getSecret: <T>(key: string, defaultValue: T) => Promise<T>;
  setSecret: <T>(key: string, value: T) => Promise<void>;
}
export interface IChatBotAPI {
  initialize: ({
    question,
    apiKey,
    prompt,
    model,
  }: {
    apiKey: string;
    prompt: string;
    model: string;
  }) => Promise<{ assistantId: string; threadId: string }>;
  ask: (args: {
    question: string;
    assistantId: string;
    threadId: string;
    apiKey: string;
  }) => Promise<void>;
  onMessageReceived: (
    fn: (value: {
      msgEvent: string;
      delta?: {
        content: Array<{
          index: number;
          type: string;
          text: {
            value: string;
            annotations: Array<string>;
          };
        }>;
      };
      message: string;
    }) => void,
  ) => void;
  modifyAssistant: ({
    apiKey,
    prompt,
    model,
    assistantId,
  }: {
    apiKey: string;
    prompt: string;
    model: string;
    assistantId: string;
  }) => Promise<void>;
  findAssistant: (args: { apiKey: string; assistantId: string }) => Promise<unknown>;
}

export interface ISourceFileAPI {
  saveFile: (content: string) => Promise<void>;
  readFile: () => Promise<string>;
  onSaveShortcut: (fn: () => void) => string;
}
export interface IFetchAPI {
  fetch: (
    url: string,
    options: {
      method: string;
      payload: unknown;
      headers: {
        [key: string]: string | number;
      };
      agent: { ssl: boolean } | undefined;
    },
  ) => Promise<{ data: unknown; status: number; details: string }>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
    storeAPI: IStoreAPI;
    sourceFileAPI: ISourceFileAPI;
    fetchApi: IFetchAPI;
    chatBotApi: IChatBotAPI;
  }
}
