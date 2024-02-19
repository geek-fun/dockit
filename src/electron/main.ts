import { app, BrowserWindow, autoUpdater, ipcMain, shell } from 'electron';
import path from 'path';
import { createMenu } from './menu';
import { debug } from '../common';
import { githubLink } from '../config';
import { registerStoreApiListener } from './storeApi';
import { registerSourceFileApiListener } from './sourceFIleApi';

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

const createWindow = async () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    minWidth: 900,
    height: 750,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: isDev,
      webSecurity: false,
    },
    icon: path.resolve(__dirname, '../../dockit.png'),
  });
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

  // Open the DevTools.
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  ipcMain.handle('versions', () => ({
    node: process.versions.chrome,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    version: app.getVersion(),
    name: app.getName(),
  }));
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  await createWindow();
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
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on('open-github', () => {
  shell.openExternal(githubLink);
});

registerStoreApiListener(ipcMain);
registerSourceFileApiListener(ipcMain);

try {
  autoUpdater.setFeedURL({
    url: `https://dockit-eta.vercel.app//update/${process.platform}/${app.getVersion()}`,
  });
} catch (err) {
  /* empty */
}
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
