#!/bin/bash -e
# Run all tests (JS + Rust) and write exit code to GITHUB_ENV.
# Usage: bash scripts/run-tests.sh

set +e

export PATH="$HOME/.cargo/bin:$PATH"

npm run test:ci; EXIT_CODE=$?

echo "TEST_EXIT=$EXIT_CODE" >> "$GITHUB_ENV"
exit $EXIT_CODE
