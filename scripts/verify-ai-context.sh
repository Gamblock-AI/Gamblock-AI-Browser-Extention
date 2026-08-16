#!/usr/bin/env bash
set -euo pipefail

context_version="2026-08-16.4"
allow_untracked=false

usage() {
  printf 'Usage: %s [--allow-untracked]\n' "$0"
}

for arg in "$@"; do
  case "$arg" in
    --allow-untracked)
      allow_untracked=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

required_files=(
  ".gitattributes"
  ".nvmrc"
  ".agents/skills/verify-gamblock-change/SKILL.md"
  ".agents/skills/verify-gamblock-change/agents/openai.yaml"
  "AGENTS.md"
  "README.md"
  "docs/ai/README.md"
  "docs/ai/manifest.yaml"
  "CLAUDE.md"
  "GEMINI.md"
  "COPILOT.md"
  ".github/copilot-instructions.md"
  ".cursor/rules/gamblock-ai.mdc"
  ".cursorrules"
  "scripts/verify-ai-context.sh"
)

failed=false

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    printf 'Missing required AI context file: %s\n' "$file" >&2
    failed=true
    continue
  fi

  if [[ "$allow_untracked" == false ]] &&
     ! git ls-files --error-unmatch -- "$file" >/dev/null 2>&1; then
    printf 'Required AI context file is not tracked: %s\n' "$file" >&2
    failed=true
  fi
done

if ! grep -Fq "Context version: \`$context_version\`" AGENTS.md; then
  printf 'AGENTS.md context version is not %s\n' "$context_version" >&2
  failed=true
fi

if ! grep -Eq "^context_version: [\"']?$context_version[\"']?$" docs/ai/manifest.yaml; then
  printf 'docs/ai/manifest.yaml context version is not %s\n' "$context_version" >&2
  failed=true
fi

for entrypoint in CLAUDE.md GEMINI.md; do
  if ! grep -Fxq '@./AGENTS.md' "$entrypoint"; then
    printf '%s must import @./AGENTS.md\n' "$entrypoint" >&2
    failed=true
  fi
done

if ! grep -Fq 'AGENTS.md' .github/copilot-instructions.md; then
  printf '.github/copilot-instructions.md must reference AGENTS.md\n' >&2
  failed=true
fi

if ! grep -Fq 'alwaysApply: true' .cursor/rules/gamblock-ai.mdc; then
  printf '.cursor/rules/gamblock-ai.mdc must be always-applied\n' >&2
  failed=true
fi

if ! grep -Fq '.cursor/rules/gamblock-ai.mdc' .cursorrules; then
  printf '.cursorrules must point to the canonical Cursor rule\n' >&2
  failed=true
fi

if [[ "$failed" == true ]]; then
  exit 1
fi

tracking_mode="tracked files required"
if [[ "$allow_untracked" == true ]]; then
  tracking_mode="untracked files allowed"
fi

printf 'AI context verified: %s (%s)\n' "$context_version" "$tracking_mode"
