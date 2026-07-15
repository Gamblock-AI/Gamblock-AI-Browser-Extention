#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

version="$(node -p "require('./manifest.json').version")"
archive="${1:-dist/gamblock-ai-extension-v${version}.zip}"

if [[ ! -f "$archive" ]]; then
  printf 'Extension package not found: %s\n' "$archive" >&2
  exit 1
fi

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

unzip -q "$archive" -d "$temp_dir"
node scripts/validate-extension.mjs "$temp_dir"

printf 'Extension package verified: %s\n' "$archive"
