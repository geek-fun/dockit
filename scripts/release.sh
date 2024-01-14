#!/bin/bash -e
set -o pipefail

cd "$(dirname "$0")/.." || exit

GITHUB_TOKEN="${{ secrets.GITHUB_TOKEN }}" npx electron-forge publish
