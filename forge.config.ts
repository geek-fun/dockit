import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { version, author, description, homepage } from './package.json';

const iconPath = './public/dockit';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: iconPath,
    executableName: 'DocKit',
    osxSign: {},
    osxNotarize: {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      authors: author,
      description,
      iconUrl: 'https://gitee.com/geek-fun/dockit/raw/master/public/dockit.png',
      setupIcon: `${iconPath}.ico`,
    }),
    new MakerRpm({
      options: { homepage, icon: `${iconPath}.png` },
    }),
    new MakerDeb({
      options: {
        maintainer: author,
        homepage,
        icon: `${iconPath}.png`,
        version,
      },
    }),
    new MakerDMG({ icon: `${iconPath}.icns` }),
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/electron/main.ts',
          config: 'vite.main.config.ts',
        },
        {
          entry: 'src/electron/preload.ts',
          config: 'vite.preload.config.ts',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'geek-fun',
          name: 'dockit',
        },
        prerelease: true,
      },
    },
  ],
};

export default config;
