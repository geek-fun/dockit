#!/bin/bash -e
set -o pipefail

cd "$(dirname "$0")/.." || exit

npx electron-forge publish
