import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import baseConfig from '../../vite.config';

const stub = (name: string) =>
  fileURLToPath(new URL(`./stubs/${name}`, import.meta.url));

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [
        { find: '@tauri-apps/api/path', replacement: stub('tauri-path.ts') },
        { find: '@tauri-apps/api/core', replacement: stub('tauri-core.ts') },
        { find: '@tauri-apps/plugin-fs', replacement: stub('tauri-fs.ts') },
        { find: '@tauri-apps/plugin-dialog', replacement: stub('tauri-dialog.ts') },
        { find: '@tauri-apps/plugin-os', replacement: stub('tauri-os.ts') },
      ],
    },
  }),
);
