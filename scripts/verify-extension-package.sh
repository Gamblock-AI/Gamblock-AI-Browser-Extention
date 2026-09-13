#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

family="${1:-chromium}"
if [[ "$family" != "chromium" && "$family" != "firefox" ]]; then
  printf 'Usage: %s [chromium|firefox] [archive] [expected-version]\n' "$0" >&2
  exit 2
fi
manifest="manifest.json"
if [[ "$family" == "firefox" ]]; then manifest="manifest.firefox.json"; fi
version="$(node -p "require('./${manifest}').version")"
expected_version="${3:-}"
if [[ -n "$expected_version" && ! "$expected_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  printf 'Expected version must be MAJOR.MINOR.PATCH: %s\n' "$expected_version" >&2
  exit 2
fi
if [[ -n "$expected_version" && "$version" != "$expected_version" ]]; then
  printf '%s version %s does not match expected release version %s\n' \
    "$manifest" "$version" "$expected_version" >&2
  exit 1
fi
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
archive_version="$(ARCHIVE_MANIFEST="$temp_dir/manifest.json" node -e \
  'const fs = require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.env.ARCHIVE_MANIFEST, "utf8")).version || "");')"
if [[ "$archive_version" != "$version" ]]; then
  printf 'Packaged manifest version %s does not match source version %s\n' \
    "$archive_version" "$version" >&2
  exit 1
fi
if [[ -n "$expected_version" && "$archive_version" != "$expected_version" ]]; then
  printf 'Packaged manifest version %s does not match expected release version %s\n' \
    "$archive_version" "$expected_version" >&2
  exit 1
fi

printf 'Extension package verified: %s\n' "$archive_path"
