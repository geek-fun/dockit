#!/bin/bash -e
set -o pipefail

cd "$(dirname "$0")/.." || exit

ARTIFACTS_DIR="${ARTIFACTS_DIR:-artifacts}"

FILES=$(find "$ARTIFACTS_DIR" -name "latest-*.json" -type f | sort)

if [[ -z "$FILES" ]]; then
  echo "Error: no latest-*.json files found in ${ARTIFACTS_DIR}/" >&2
  exit 1
fi

# shellcheck disable=SC2086
jq -s '.[0].platforms = ([.[].platforms] | add) | .[0]' $FILES > "$ARTIFACTS_DIR/latest.json"
# shellcheck disable=SC2086
rm -f $FILES
