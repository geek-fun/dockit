#!/bin/bash -e


VERSION=$(node -p "require('./package.json').version")
PREVIOUS_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")

CHANGELOG=$(awk -v version="$VERSION" '
  $0 ~ "^## \\[" version "\\]" { found=1; next }
  found && /^## \[/ { exit }
  found { print }
' CHANGELOG.md)

if [ -z "$CHANGELOG" ]; then
  echo "::warning::No CHANGELOG.md entry found for version ${VERSION}, using fallback"
  CHANGELOG="See the assets to download this version and install."
fi

if [ -n "$PREVIOUS_TAG" ]; then
  CONTRIBUTORS=$(git log ${PREVIOUS_TAG}..HEAD --pretty=format:"%an" 2>/dev/null | sort | uniq)
else
  CONTRIBUTORS=$(git log HEAD --pretty=format:"%an" 2>/dev/null | sort | uniq)
fi

CONTRIBUTORS_MD=""
if [ -n "$CONTRIBUTORS" ]; then
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    if [ -n "$PREVIOUS_TAG" ]; then
      COUNT=$(git log ${PREVIOUS_TAG}..HEAD --author="$name" --oneline 2>/dev/null | wc -l | tr -d ' ')
    else
      COUNT=$(git log HEAD --author="$name" --oneline 2>/dev/null | wc -l | tr -d ' ')
    fi
    SUFFIX=""; [ "$COUNT" -gt 1 ] && SUFFIX="s"
    CONTRIBUTORS_MD="${CONTRIBUTORS_MD}- **${name}** (${COUNT} commit${SUFFIX})\n"
  done <<< "$CONTRIBUTORS"
fi

if [ -n "$PREVIOUS_TAG" ]; then
  COMMITS=$(git log ${PREVIOUS_TAG}..HEAD --pretty=format:"- %h %s (%an, %ar)" --no-merges 2>/dev/null | head -50)
  RANGE_LABEL="_Changes from ${PREVIOUS_TAG} to v${VERSION}_"
else
  COMMITS=$(git log HEAD --pretty=format:"- %h %s (%an, %ar)" --no-merges 2>/dev/null | head -50)
  RANGE_LABEL="_Initial release_"
fi

{
  echo "$CHANGELOG"
  echo ""
  echo "## 👥 Contributors"
  echo ""
  echo -e "$CONTRIBUTORS_MD"
  echo "---"
  echo ""
  echo "## 📋 Full Commit History"
  echo ""
  echo "$RANGE_LABEL"
  echo ""
  echo "$COMMITS"
  echo ""
  echo ""
  echo "---"
  echo ""
  echo "## 📦 Downloads"
  echo ""
  echo "See the assets below to download this version and install for your platform:"
  echo "- **macOS**: Universal binary (Intel & Apple Silicon)"
  echo "- **Windows**: x64 installer"
  echo "- **Linux**: x64 AppImage/deb"
} > release-notes.md
