# Gamblock AI — Browser Extension Agent Rules


This repository is the standalone Chrome/Edge Manifest V3 extension for
Gamblock AI. It must remain understandable and safe when cloned without any
other Gamblock repository. Read these files before changing code:

1. `AGENTS.md` — canonical engineering and safety rules (this file)
2. `docs/ai/README.md` — AI workflow, implementation status, and verification
3. `README.md` — user-facing setup, architecture, and WebSocket contract
4. `docs/ai/manifest.yaml` — machine-readable context inventory and commands

Provider-specific files are entrypoints only. If they conflict with this file,
this file wins.

Context version: `2026-08-28.1`

## Product boundary: passive sensor only

The extension MUST NOT:

- classify content or compute gambling probabilities;
- decide to block, redirect, or close a page;
- render its own Pattern Interrupt UI;
- send DOM text, URLs, domains, or browsing history to a remote backend.

It may extract the current page title, headings, anchor text, and URL, then
relay that data only to the authenticated local Windows Service at
`ws://127.0.0.1:9090`. Classification, blocking, and Pattern Interrupt are the
Windows Service's authority. All inference stays on-device.

## Current implementation status

- DOM extraction, pairing-token storage, authenticated relay, reconnect, and
  keepalive behavior are implemented in this repository.
- The extension is independently unit-testable and packageable.
- End-to-end protection also requires the separate Windows Service. Do not
  claim end-to-end blocking from this repository alone.

## WebSocket contract

`README.md` under “WebSocket protocol” is the canonical contract for this
repository. Preserve the existing message shapes. Any protocol change is a
coordinated cross-repository change and must update all of the following:

- `background.js`;
- the protocol section in `README.md`;
- the peer Windows implementation in repository `Gamblock-AI-Apps`
  (`https://github.com/Gamblock-AI/Gamblock-AI-Apps`), at peer-relative path
  `windows/service/protection_service_websocket.cpp`.

Never add block or redirect command handling to `background.js`. A service
message requesting either action is a protocol violation and must be ignored.

## Manifest and runtime rules

- `content_script.js` is loaded as a classic MV3 content script. Do not add
  top-level ESM `import` or `export` syntax unless a real bundling step and its
  manifest changes are introduced together.
- Preserve the `chrome.runtime.id` auto-run guard so DOM extraction remains
  testable without browser side effects.
- Authenticate with `gamblock_pairing_token` from `chrome.storage.local` before
  relaying any `dom_scan` message.
- Keep permissions minimal and explain every permission in `README.md`.
- Every path referenced by `manifest.json`, including locale and icon assets,
  must exist and be included in the release ZIP.
- Do not introduce remote code, remotely hosted scripts, or telemetry.

## Files and responsibilities

- `manifest.json` — MV3 registration, permissions, locale, icon, and scripts
- `background.js` / `background/` — local WebSocket orchestration, bounded
  payloads, pairing storage, and authenticated relay
- `content_script.js` — passive DOM extraction only
- `options.html` / `options.js` — local pairing-token configuration
- `_locales/` — Chrome message catalogs
- `images/` — manifest-referenced extension assets
- `scripts/` — context, manifest, and package verification

## Proposal role and validation policy

The proposal requires local URL + DOM Hybrid Analysis on Windows. This
extension implements only the supporting local sensor portion; the Windows
service/client must perform rules, BoW, Logistic Regression, blocking, and
Pattern Interrupt.

Use npm and the committed `package-lock.json`. On a fresh clone, run `npm ci`
only when dependencies are absent. During normal AI development, run only
static/context validation:

```sh
npm run lint
bash scripts/verify-ai-context.sh --allow-untracked

# Explicit user request only:
npm test
npm run package:extension
npm run verify:package
```

Before completing a normal change:

1. Passive-sensor and privacy invariants still hold.
2. `npm run lint` passes (Node syntax plus manifest/static validation; this is
   not ESLint).
3. Context validation passes when context changed.
4. `README.md`, this file, and `docs/ai/` reflect behavioral changes.
5. A WebSocket change has been coordinated with the peer repository.

Tests and package smoke checks remain available but run only when the user asks
for them explicitly.

CI runs the context verifier without `--allow-untracked`; this ensures all
required AI context files are committed. The flag exists only for validating a
local worktree while new context files have not yet been staged.

## Testing conventions

- Vitest uses jsdom; `vitest.setup.js` owns the shared Chrome API stubs.
- `content_script.test.js` tests the classic script through its test-only global
  API, not through ESM exports.
- `background.test.js` enforces token-gated relay and the passive-sensor
  invariant. Keep Chrome API stubs aligned with every API used at module load.
- Tests and validation must never connect to a real WebSocket or remote API.

## Documentation maintenance

Update `context_version` in both this file and `docs/ai/manifest.yaml` for a
meaningful workflow or architecture-context change. Run
`scripts/verify-ai-context.sh` after editing any AI entrypoint. Do not copy
instructions from a missing parent directory; this repository is intentionally
self-contained.
