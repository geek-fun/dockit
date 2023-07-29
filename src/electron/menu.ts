export const menuTempalte = [
  {
    label: '帮助',
    submenu: [
      {
        label: '关于',
        click: () => {
          console.log('关于');
        },
      },
      {
        label: '检查更新',
        click: () => {
          console.log('检查更新');
        },
      },
    ],
  },
];
