import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('browserWindow', {
  versions: () => ipcRenderer.invoke('versions'),
});

contextBridge.exposeInMainWorld('electronAPI', {
  openGitHub: () => ipcRenderer.send('open-github'),
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
