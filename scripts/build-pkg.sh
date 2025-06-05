#!/bin/bash -e
set -o pipefail

cd "$(dirname "$0")/.." || exit

#source .env

unset APPLE_SIGNING_IDENTITY

unset APPLE_CERTIFICATE

APP_NAME="DocKit"

SIGN_APP="Apple Distribution: Lisheng Zi (Z44247ZSR9)"

SIGN_INSTALL="3rd Party Mac Developer Installer: Lisheng Zi (Z44247ZSR9)"


TARGET="universal-apple-darwin"


DOCKIT_DISTRIBUTION="APP_STORE" npx tauri build --target "${TARGET}" --verbose

# cargo tauri build --target "${target}" --verbose


APP_PATH="src-tauri/target/${TARGET}/release/bundle/macos/${APP_NAME}.app"

BUILD_NAME="src-tauri/target/${TARGET}/release/bundle/macos/${APP_NAME}.pkg"

CP_DIR="src-tauri/target/${TARGET}/release/bundle/macos/${APP_NAME}.app/Contents/embedded.provisionprofile"

ENTITLEMENTS="src-tauri/entitlements/${APP_NAME}.entitlements"

PROFILE="src-tauri/entitlements/${APP_NAME}_Distribution.provisionprofile"

cp "${PROFILE}" "${CP_DIR}"


codesign --deep --force -s "${SIGN_APP}" --entitlements ${ENTITLEMENTS} "${APP_PATH}"

productbuild --component "${APP_PATH}" /Applications/ --sign "${SIGN_INSTALL}" "${BUILD_NAME}"
