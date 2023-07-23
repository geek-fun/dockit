import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('browserWindow', {
  versions: () => ipcRenderer.invoke('versions'),
});
