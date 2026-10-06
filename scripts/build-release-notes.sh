#!/bin/bash -e

# Compose the GitHub release body from CHANGELOG.md + git metadata.
#
# Presentation conventions (shared shape across geek-fun repos):
#   - Changelog sections get emoji headings (### Added -> ### ✨ Added)
#   - "(#N)" references are linkified to the originating GitHub PR
#   - Contributors section is omitted when only one author contributed
#   - The full commit list is kept but collapsed inside <details>
#   - .github/release-notes-footer.md (if present) is appended verbatim —
#     per-repo commercial tail: mirrors, upgrade guidance, support links.

VERSION=${RELEASE_NOTES_VERSION:-$(node -p "require('./package.json').version")}
PREVIOUS_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")

# Derive the GitHub repo URL from the origin remote (works for https/ssh).
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
REPO_URL=$(echo "$REMOTE_URL" | sed -E 's#^git@github\.com:#https://github.com/#; s#^https?://(www\.)?github\.com/#https://github.com/#; s#\.git$##')

CHANGELOG=$(awk -v version="$VERSION" '
  $0 ~ "^## \\[" version "\\]" { found=1; next }
  found && /^## \[/ { exit }
  found { print }
' CHANGELOG.md)

if [ -z "$CHANGELOG" ]; then
  echo "::warning::No CHANGELOG.md entry found for version ${VERSION}, using fallback"
  CHANGELOG="See the assets to download this version and install."
fi

# Decorate known Keep-a-Changelog sections with emoji headings and turn
# "(#N)" into PR links. Section decoration is language-neutral: whatever
# language the repo writes entries in is preserved.
CHANGELOG=$(echo "$CHANGELOG" \
  | sed -E \
      -e 's/^### Added$/### ✨ Added/' \
      -e 's/^### Fixed$/### 🐛 Fixed/' \
      -e 's/^### Changed$/### 🔧 Changed/' \
      -e 's/^### Security$/### 🔒 Security/' \
      -e 's/^### Deprecated$/### ⚠️ Deprecated/' \
      -e 's/^### Removed$/### 🗑 Removed/')
if [ -n "$REPO_URL" ]; then
  CHANGELOG=$(echo "$CHANGELOG" | sed -E "s|\(#([0-9]+)\)|([#\1](${REPO_URL}/pull/\1))|g")
fi

if [ -n "$PREVIOUS_TAG" ]; then
  AUTHORS=$(git log ${PREVIOUS_TAG}..HEAD --pretty=format:"%an" 2>/dev/null | sort -u)
  AUTHOR_COUNT=$(echo "$AUTHORS" | grep -c . || true)
else
  AUTHORS=$(git log HEAD --pretty=format:"%an" 2>/dev/null | sort -u)
  AUTHOR_COUNT=$(echo "$AUTHORS" | grep -c . || true)
fi

CONTRIBUTORS_MD=""
# Community acknowledgment only makes sense with outside contributors —
# a solo-author release reads as noise, so skip it entirely.
if [ "$AUTHOR_COUNT" -gt 1 ]; then
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    if [ -n "$PREVIOUS_TAG" ]; then
      COUNT=$(git log ${PREVIOUS_TAG}..HEAD --author="$name" --oneline 2>/dev/null | wc -l | tr -d ' ')
    else
      COUNT=$(git log HEAD --author="$name" --oneline 2>/dev/null | wc -l | tr -d ' ')
    fi
    SUFFIX=""; [ "$COUNT" -gt 1 ] && SUFFIX="s"
    CONTRIBUTORS_MD="${CONTRIBUTORS_MD}- **${name}** (${COUNT} commit${SUFFIX})\n"
  done <<< "$AUTHORS"
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
  if [ -n "$CONTRIBUTORS_MD" ]; then
    echo "## 👥 Contributors"
    echo ""
    echo -e "$CONTRIBUTORS_MD"
    echo ""
  fi
  echo "---"
  echo ""
  echo "<details>"
  echo "<summary>📋 Full commit history</summary>"
  echo ""
  echo "$RANGE_LABEL"
  echo ""
  echo "$COMMITS"
  echo ""
  echo "</details>"
  echo ""
  echo "---"
  echo ""
  echo "## 📦 Downloads"
  echo ""
  echo "See the assets below to download this version and install for your platform:"
  echo "- **macOS**: Apple Silicon & Intel"
  echo "- **Windows**: x64 installer"
  echo "- **Linux**: AppImage / deb"
  if [ -f .github/release-notes-footer.md ]; then
    echo ""
    cat .github/release-notes-footer.md
  fi
} > release-notes.md
