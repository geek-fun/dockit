#!/bin/bash -e
set -o pipefail

cd "$(dirname "$0")/.." || exit

echo "clean up distributions..."
rm -rf ../out
rm -rf ../dist


platform=$(uname | tr '[:upper:]' '[:lower:]')
echo "make distributions, platform: ${platform}"

npx electron-forge make --arch="x64" --platform="${platform}"

npx electron-forge make --arch="arm64" --platform="${platform}"
