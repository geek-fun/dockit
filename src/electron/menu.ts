import { app, dialog, Menu, MenuItemConstructorOptions, BrowserWindow } from 'electron';

const buildMenuTemplate = (mainWindow: BrowserWindow) =>
  [
    {
      label: 'DocKit',
      submenu: [
        {
          label: 'About DocKit',
          click() {
            dialog.showMessageBox({
              title: 'About DocKit',
              message: `About DocKit v${app.getVersion()}`,
              detail: '"DocKit - GUI Client for Elasticsearch/OpenSearch',
              icon: './dockit.png',
            });
          },
        },
        {
          type: 'separator',
        },
        {
          label: 'Services',
          submenu: [],
        },
        {
          type: 'separator',
        },
        {
          label: 'Hide App',
          accelerator: 'CmdOrCtrl+H',
          selector: 'hide:',
        },
        {
          label: 'Hide Others',
          accelerator: 'CmdOrCtrl+Shift+H',
          selector: 'hideOtherApplications:',
        },
        {
          label: 'Show All',
          selector: 'unhideAllApplications:',
        },
        {
          type: 'separator',
        },
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          selector: 'save:',
          click: () => {
            mainWindow.webContents.send('save-shortcout', {});
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          selector: 'undo:',
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          selector: 'redo:',
        },
        {
          type: 'separator',
        },
        {
          label: 'Cut',
          accelerator: 'CmdOrCtrl+X',
          selector: 'cut:',
        },
        {
          label: 'Copy',
          accelerator: 'CmdOrCtrl+C',
          selector: 'copy:',
        },
        {
          label: 'Paste',
          accelerator: 'CmdOrCtrl+V',
          selector: 'paste:',
        },
        {
          label: 'Select All',
          accelerator: 'CmdOrCtrl+A',
          selector: 'selectAll:',
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'Command+M',
          selector: 'performMiniaturize:',
        },
        {
          label: 'Close',
          accelerator: 'Command+W',
          selector: 'performClose:',
        },
        {
          type: 'separator',
        },
        {
          label: 'Bring All to Front',
          selector: 'arrangeInFront:',
        },
      ],
    },
    {
      label: 'Developer',
      submenu: [
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          },
        },
      ],
    },
  ] as Array<MenuItemConstructorOptions>;

export const createMenu = (mainWindow: BrowserWindow) => {
  const menu = Menu.buildFromTemplate(buildMenuTemplate(mainWindow));
  Menu.setApplicationMenu(menu);
};
