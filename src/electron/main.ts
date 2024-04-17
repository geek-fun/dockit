import { app, BrowserWindow, ipcMain, IpcMain, shell } from 'electron';
import path from 'path';
import { createMenu } from './menu';
import { debug } from '../common';
import { githubLink } from '../config';
import { registerStoreApiListener } from './storeApi';
import { registerSourceFileApiListener } from './sourceFIleApi';
import { registerFetchApiListener } from './fetchApi';
import { registerChatBotApiListener } from './chatBotApi';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

const isDev = process.env.APP_ENV === 'dev';
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const loadDevTools = async () => {
  // if dev
  if (isDev) {
    try {
      const { default: install, VUEJS_DEVTOOLS } = await import('electron-devtools-assembler');
      await install(VUEJS_DEVTOOLS);
      debug('Added Extension');
    } catch (err) {
      debug(`Can not install extension! ${err}`);
    }
  }
};

const registerListeners = (ipcMain: IpcMain, mainWindow: BrowserWindow) => {
  registerStoreApiListener(ipcMain);
  registerSourceFileApiListener(ipcMain);
  registerFetchApiListener(ipcMain);
  registerChatBotApiListener(ipcMain, mainWindow);

  ipcMain.handle('versions', () => ({
    node: process.versions.chrome,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    version: app.getVersion(),
    name: app.getName(),
  }));
};

const renderMainWindow = async (mainWindow: BrowserWindow) => {
  createMenu(mainWindow);
  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    for (let i = 0; i < 10; i++) {
      try {
        const response = await fetch(MAIN_WINDOW_VITE_DEV_SERVER_URL);
        if (response.ok) {
          break;
        }
      } catch (e) {
        /* empty */
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
};

const createWindow = () => {
  // Create the browser window.
  return new BrowserWindow({
    width: 1200,
    minWidth: 900,
    height: 750,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
    },
    icon: path.resolve(__dirname, '../../dockit.png'),
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  const mainWindow = createWindow();
  await renderMainWindow(mainWindow);
  registerListeners(ipcMain, mainWindow);
  await loadDevTools();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On OS X it's common to re-create a window in the app when the
// dock icon is clicked and there are no other windows open.
app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const mainWindow = createWindow();
    await renderMainWindow(mainWindow);
  }
});

ipcMain.on('open-github', () => {
  shell.openExternal(githubLink);
});
ipcMain.on('open-link', (_event, link: string) => {
  shell.openExternal(link);
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
