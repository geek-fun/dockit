#!/bin/bash -e
set -o pipefail

cd "$(dirname "$0")/.." || exit

echo "clean up distributions..."
rm -rf ./out
rm -rf ./dist


platform=$(uname | tr '[:upper:]' '[:lower:]')

if [[ $platform == mingw64_nt* ]]; then
  platform="win32"
fi
echo "make distributions, platform: ${platform}"

npx electron-forge make --arch="x64" --platform="${platform}"

npx electron-forge make --arch="arm64" --platform="${platform}"

# rename distributions
if [[ $platform == "win32" ]]; then
  version=$(node -p "require('./package.json').version")
  mv out/make/squirrel.windows/x64/DocKit-${version}\ Setup.exe out/make/squirrel.windows/x64/DocKit-${version}-x64.Setup.exe
  mv out/make/squirrel.windows/arm64/DocKit-${version}\ Setup.exe out/make/squirrel.windows/arm64/DocKit-${version}-arm64.Setup.exe
fi
