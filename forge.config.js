const author = 'geekfun <support@geekfun.club>';
const homepage = 'https://dockit.geekfun.club';
const description = 'A faster, better and more stable NoSQL desktop tools';
const iconPath = './public/dockit';

module.exports = {
  packagerConfig: {
    asar: true,
    productName: 'DocKit',
    icon: iconPath,
    executableName: 'DocKit',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        authors: author,
        description,
        iconUrl: 'https://gitee.com/geek-fun/dockit/raw/master/public/dockit.png',
        setupIcon: `${iconPath}.ico`,
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      config: { icon: `${iconPath}.icns` },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: { maintainer: author, homepage, icon: `${iconPath}.png` },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: { homepage, icon: `${iconPath}.png` },
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
