#!/bin/bash -e
set -o pipefail

cd "$(dirname "$0")/.." || exit


VERSION=$(node -p "require('./package.json').version")
PLATFORM=${PLATFORM:-"macos-latest"}

if [ ! -d artifacts ]; then
  mkdir artifacts
fi

if [[ $PLATFORM == "windows-latest" ]]; then
  mv src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*.exe artifacts/
fi

if [[ $PLATFORM == "macos-latest" ]]; then
  mv src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg artifacts/
fi

if [[ $PLATFORM == "ubuntu-latest" ]]; then
  mv src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/deb/*.deb artifacts/DocKit_"${VERSION}"_amd64.deb
  mv src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/appimage/*.AppImage artifacts/DocKit_"${VERSION}"_amd64.AppImage
fi
