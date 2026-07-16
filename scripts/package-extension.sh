#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

version="$(node -p "require('./manifest.json').version")"
archive="${1:-dist/gamblock-ai-extension-v${version}.zip}"

mkdir -p "$(dirname "$archive")"
rm -f "$archive"

node scripts/validate-extension.mjs

zip -rq "$archive" \
  manifest.json \
  background.js \
  background \
  content_script.js \
  options.html \
  options.js \
  _locales \
  images

printf 'Created extension package: %s\n' "$archive"
