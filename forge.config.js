const author = 'geekfun <support@geekfun.club>';
const homepage = 'https://dockit.geekfun.club';
const description = 'A faster, better and more stable NoSQL desktop tools';
const iconICO = './public/dockit.ico';
const iconPNG = './public/dockit.png';

module.exports = {
  packagerConfig: {
    asar: true,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        authors: author,
        description,
        iconUrl: 'https://gitee.com/geek-fun/dockit/raw/master/public/dockit.png',
        setupIcon: iconICO,
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      config: { icon: iconPNG },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: { maintainer: author, homepage, icon: iconPNG },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: { homepage, icon: iconPNG },
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
          owner: 'geek-fun',
          name: 'dockit',
        },
        prerelease: true,
      },
    },
  ],
};
