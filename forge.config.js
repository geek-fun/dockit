const author = 'geekfun <support@geekfun.club>';
const homepage = 'https://dockit.geekfun.club';
const description = 'A faster, better and more stable NoSQL desktop tools';
module.exports = {
  packagerConfig: {
    asar: true,
    outDir: 'distributions',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: { authors: author, description },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-dmg',
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: { maintainer: author, homepage },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: { homepage },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'geekfun',
          name: 'dockit',
        },
        prerelease: true,
      },
    },
  ],
};
