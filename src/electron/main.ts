import {
  app,
  autoUpdater,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  ipcMain,
  shell,
} from 'electron';
import path from 'path';
import { createMenu } from './menu';
import { debug } from '../common';
import { githubLink } from '../config';
import Store from 'electron-store';
import { registerStoreApiListener } from './storeApi';
import { registerSourceFileApiListener } from './sourceFIleApi';

const isDev = process.env.APP_ENV === 'dev';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const store = new Store();

const BrowserWindowOptions: BrowserWindowConstructorOptions = {
  width: 1200,
  minWidth: 900,
  height: 750,
  minHeight: 600,
  show: false,
  alwaysOnTop: true,
  frame: true,
  webPreferences: {
    preload: path.resolve(__dirname, 'preload.js'),
    devTools: isDev,
    webSecurity: false,
  },
  icon: path.resolve(__dirname, '../../dockit.png'),
};

const bypassCors = (mainWindow: BrowserWindow) => {
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: { Origin: '*', ...details.requestHeaders } });
  });

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        'Access-Control-Allow-Origin': ['*'],
        // We use this to bypass headers
        'Access-Control-Allow-Headers': ['*'],
        ...details.responseHeaders,
      },
    });
  });
};
const loadWindowByUrl = async (mainWindow: BrowserWindow) => {
  for (let i = 0; i < 10; i++) {
    try {
      const response = await fetch('http://localhost:5173');
      if (response.ok) {
        break;
      }
    } catch (e) {
      /* empty */
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  await mainWindow.loadURL(
    isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, './index.html')}`,
  );
};
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
  const mainWindow = new BrowserWindow(BrowserWindowOptions);

  createMenu(mainWindow);
  bypassCors(mainWindow);

  // and load the index.html of the app.
  await loadWindowByUrl(mainWindow);

  mainWindow.show();

  // this will turn off always on top after opening the application
  setTimeout(() => {
    mainWindow.setAlwaysOnTop(false);
  }, 1000);

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

ipcMain.on('open-github', () => {
  shell.openExternal(githubLink);
});

registerStoreApiListener(ipcMain);
registerSourceFileApiListener(ipcMain);

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  await loadDevTools();

  createWindow().then(() => debug('Window Created'));
  // On macOS re-create a window when the dock icon is clicked and there are no other windows open.
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

try {
  autoUpdater.setFeedURL({
    url: `https://dockit-eta.vercel.app//update/${process.platform}/${app.getVersion()}`,
  });
} catch (err) {
  /* empty */
}
