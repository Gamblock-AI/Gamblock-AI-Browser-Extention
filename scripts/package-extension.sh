#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

family="${1:-chromium}"
if [[ "$family" != "chromium" && "$family" != "firefox" ]]; then
  printf 'Usage: %s [chromium|firefox] [archive]\n' "$0" >&2
  exit 2
fi
manifest="manifest.json"
if [[ "$family" == "firefox" ]]; then manifest="manifest.firefox.json"; fi
version="$(node -p "require('./${manifest}').version")"
archive="${2:-dist/gamblock-ai-extension-${family}-v${version}.zip}"
archive_path="$archive"
if [[ "$archive_path" != /* ]]; then archive_path="$repo_root/$archive_path"; fi

mkdir -p "$(dirname "$archive_path")"
rm -f "$archive_path"

node scripts/validate-extension.mjs . "$manifest"

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
cp "$manifest" "$temp_dir/manifest.json"
cp -R background.js background content_script.js options.html options.js \
  _locales images "$temp_dir/"
(cd "$temp_dir" && zip -rq "$archive_path" \
  manifest.json \
  background.js \
  background \
  content_script.js \
  options.html \
  options.js \
  _locales \
  images)

printf 'Created extension package: %s\n' "$archive_path"
