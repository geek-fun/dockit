import { app, BrowserWindow, BrowserWindowConstructorOptions, ipcMain } from 'electron';
import path from 'path';
import install, { VUEJS3_DEVTOOLS } from 'electron-devtools-installer';

const isDev = process.env.APP_ENV === 'dev';

const createWindow = async () => {
  const BrowserWindowOptions: BrowserWindowConstructorOptions = {
    width: 1200,
    minWidth: 900,
    height: 750,
    minHeight: 600,

    webPreferences: {
      preload: __dirname + '/preload.js',
      devTools: isDev,
    },
    show: false,
    alwaysOnTop: true,
    frame: true,
  };

  const mainWindow = new BrowserWindow(BrowserWindowOptions);

  // and load the index.html of the app.
  // win.loadFile("index.html");
  await mainWindow.loadURL(
    isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, './index.html')}`,
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
      await install(VUEJS3_DEVTOOLS);
      console.log('Added Extension');
    } catch (err) {
      console.log('Can not install extension!', err);
    }
  }

  createWindow().then(() => {
    console.log('Window Created');
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
