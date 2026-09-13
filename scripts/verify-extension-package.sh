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

if [[ ! -f "$archive_path" ]]; then
  printf 'Extension package not found: %s\n' "$archive_path" >&2
  exit 1
fi

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

unzip -q "$archive_path" -d "$temp_dir"
node scripts/validate-extension.mjs "$temp_dir" manifest.json

printf 'Extension package verified: %s\n' "$archive_path"
