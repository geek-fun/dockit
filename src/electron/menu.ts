import { debug } from '@/common/debug';

export const menuTemplate = [
  {
    label: '帮助',
    submenu: [
      {
        label: '关于',
        click: () => {
          debug('关于');
        },
      },
      {
        label: '检查更新',
        click: () => {
          debug('检查更新');
        },
      },
    ],
  },
];
