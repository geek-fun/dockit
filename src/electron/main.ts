import { app, BrowserWindow, BrowserWindowConstructorOptions, ipcMain, Menu } from 'electron';
import path from 'path';
import install, { VUEJS_DEVTOOLS } from 'electron-devtools-assembler';
import { menuTemplate } from './menu';
import { debug } from '@/common/debug';

const isDev = process.env.APP_ENV === 'dev';

const createWindow = async () => {
  const BrowserWindowOptions: BrowserWindowConstructorOptions = {
    width: 1200,
    minWidth: 900,
    height: 750,
    minHeight: 600,

    webPreferences: {
      preload: path.resolve(__dirname, 'preload.js'),
      devTools: isDev,
    },
    show: false,
    alwaysOnTop: true,
    frame: true,
  };
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
  const mainWindow = new BrowserWindow(BrowserWindowOptions);
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
  // and load the index.html of the app.
  // win.loadFile("index.html");
  await mainWindow.loadURL(
    isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, './index.html')}`,
  );

  mainWindow.show();

  // this will turn off always on top after opening the application
  setTimeout(() => {
    mainWindow.setAlwaysOnTop(false);
  }, 1000);

  // Open the DevTools.
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  ipcMain.handle('versions', () => {
    return {
      node: process.versions.chrome,
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      version: app.getVersion(),
      name: app.getName(),
    };
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // if dev
  if (isDev) {
    try {
      await install(VUEJS_DEVTOOLS);
      debug('Added Extension');
    } catch (err) {
      debug(`Can not install extension! ${err}`);
    }
  }

  createWindow().then(() => {
    debug('Window Created');
  });

  app.on('activate', function () {
    // On macOS, it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
