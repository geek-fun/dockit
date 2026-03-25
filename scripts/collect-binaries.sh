#!/bin/bash -e
set -o pipefail

cd "$(dirname "$0")/.." || exit


VERSION=$(node -p "require('./package.json').version")
TARGET=${TARGET:-""}
TARGET=${TARGET#"--target "}

if [ ! -d artifacts ]; then
  mkdir artifacts
fi

if [[ -n "$TARGET" ]]; then
  BUNDLE_DIR="src-tauri/target/${TARGET}/release/bundle"

  case "$TARGET" in
    universal-apple-darwin)
      mv "${BUNDLE_DIR}"/dmg/*.dmg artifacts/
      ;;
    x86_64-pc-windows-msvc)
      mv "${BUNDLE_DIR}"/nsis/*.exe artifacts/DocKit_"${VERSION}"_x64-setup.exe
      ;;
    aarch64-pc-windows-msvc)
      mv "${BUNDLE_DIR}"/nsis/*.exe artifacts/DocKit_"${VERSION}"_arm64-setup.exe
      ;;
    x86_64-unknown-linux-gnu)
      mv "${BUNDLE_DIR}"/deb/*.deb artifacts/DocKit_"${VERSION}"_amd64.deb
      mv "${BUNDLE_DIR}"/appimage/*.AppImage artifacts/DocKit_"${VERSION}"_amd64.AppImage
      ;;
    aarch64-unknown-linux-gnu)
      mv "${BUNDLE_DIR}"/deb/*.deb artifacts/DocKit_"${VERSION}"_arm64.deb
      mv "${BUNDLE_DIR}"/appimage/*.AppImage artifacts/DocKit_"${VERSION}"_arm64.AppImage
      ;;
  esac

  LATEST_JSON="${BUNDLE_DIR}/latest.json"
  if [[ -f "$LATEST_JSON" ]]; then
    cp "$LATEST_JSON" "artifacts/latest-${TARGET}.json"
  else
    echo "Error: latest.json not found at ${LATEST_JSON}" >&2
    exit 1
  fi
fi
