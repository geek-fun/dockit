#!/bin/bash -e
set -o pipefail

cd "$(dirname "$0")/.." || exit


VERSION=$(node -p "require('./package.json').version")
TARGET=${TARGET:-""}
TARGET=${TARGET#"--target "}

if [ ! -d artifacts ]; then
  mkdir artifacts
fi

if [[ -z "$TARGET" ]]; then
  exit 0
fi

BUNDLE_DIR="src-tauri/target/${TARGET}/release/bundle"

collect_sig() {
  local sig_file="$1"
  if [[ ! -f "$sig_file" ]]; then
    echo "Error: signature file not found: ${sig_file}" >&2
    exit 1
  fi
  cat "$sig_file"
}

case "$TARGET" in
  universal-apple-darwin)
    mv "${BUNDLE_DIR}"/dmg/*.dmg artifacts/
    TAR_FILES=("${BUNDLE_DIR}"/macos/*.app.tar.gz)
    SIG=$(collect_sig "${TAR_FILES[0]}.sig")
    TAR_NAME=$(basename "${TAR_FILES[0]}")
    jq -n \
      --arg version "$VERSION" \
      --arg sig "$SIG" \
      --arg url "https://github.com/geek-fun/dockit/releases/download/v${VERSION}/${TAR_NAME}" \
      '{version: $version, platforms: {"darwin-universal": {signature: $sig, url: $url}}}' \
      > "artifacts/latest-${TARGET}.json"
    mv "${TAR_FILES[0]}" artifacts/
    ;;

  x86_64-pc-windows-msvc)
    EXE_FILES=("${BUNDLE_DIR}"/nsis/*.exe)
    SIG=$(collect_sig "${EXE_FILES[0]}.sig")
    mv "${EXE_FILES[0]}" "artifacts/DocKit_${VERSION}_x64-setup.exe"
    jq -n \
      --arg version "$VERSION" \
      --arg sig "$SIG" \
      --arg url "https://github.com/geek-fun/dockit/releases/download/v${VERSION}/DocKit_${VERSION}_x64-setup.exe" \
      '{version: $version, platforms: {"windows-x86_64": {signature: $sig, url: $url}}}' \
      > "artifacts/latest-${TARGET}.json"
    ;;

  x86_64-unknown-linux-gnu)
    APPIMAGE_FILES=("${BUNDLE_DIR}"/appimage/*.AppImage)
    SIG=$(collect_sig "${APPIMAGE_FILES[0]}.sig")
    mv "${BUNDLE_DIR}"/deb/*.deb "artifacts/DocKit_${VERSION}_amd64.deb"
    mv "${APPIMAGE_FILES[0]}" "artifacts/DocKit_${VERSION}_amd64.AppImage"
    jq -n \
      --arg version "$VERSION" \
      --arg sig "$SIG" \
      --arg url "https://github.com/geek-fun/dockit/releases/download/v${VERSION}/DocKit_${VERSION}_amd64.AppImage" \
      '{version: $version, platforms: {"linux-x86_64": {signature: $sig, url: $url}}}' \
      > "artifacts/latest-${TARGET}.json"
    ;;
esac