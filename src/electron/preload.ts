// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  openGitHub: () => ipcRenderer.send('open-github'),
  openLink: (link: string) => ipcRenderer.send('open-link', link),
  versions: () => ipcRenderer.invoke('versions'),
});

contextBridge.exposeInMainWorld('storeAPI', {
  get: async (key: string, defaultValue: unknown) =>
    ipcRenderer.invoke('storeAPI', { method: 'GET', key, value: defaultValue }),
  set: async (key: string, value: unknown) =>
    ipcRenderer.invoke('storeAPI', { method: 'SET', key, value }),
});

contextBridge.exposeInMainWorld('sourceFileAPI', {
  saveFile: async (content: string) =>
    ipcRenderer.invoke('sourceFileAPI', { method: 'SAVE_FILE', content }),
  readFile: async () => ipcRenderer.invoke('sourceFileAPI', { method: 'READ_FILE' }),
  onSaveShortcut: (callback: (value: unknown) => void) =>
    ipcRenderer.on('save-shortcout', (_event, value) => callback(value)),
});

contextBridge.exposeInMainWorld('fetchApi', {
  fetch: async (url: string, options: unknown) =>
    ipcRenderer.invoke('fetchApi', { method: 'fetch', url, options }),
});
