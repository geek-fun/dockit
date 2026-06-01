#!/bin/bash -e
# Run JS and Rust tests sequentially, writing exit codes to GITHUB_ENV.
# Usage: bash scripts/run-tests.sh
#
# GITHUB_ENV variables set:
#   JS_TEST   — exit code of `npm run test:ci`
#   RUST_TEST — exit code of `cargo test`

set +e

# Ensure cargo is on PATH (Git Bash on Windows uses Unix paths)
export PATH="$HOME/.cargo/bin:$PATH"

npm run test:ci; JS_EXIT=$?

cd src-tauri && cargo test; RS_EXIT=$?

echo "JS_TEST=$JS_EXIT" >> "$GITHUB_ENV"
echo "RUST_TEST=$RS_EXIT" >> "$GITHUB_ENV"
