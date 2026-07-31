# AI Workflow — Browser Extension

Context version: `2026-07-31.15`

This directory makes the extension repository usable as a standalone clone.
No parent monorepo, private prompt, or sibling checkout is required to
understand and verify extension-only work.

## Reading order

1. `../../AGENTS.md` — canonical safety and engineering rules
2. `../../README.md` — runtime behavior and WebSocket contract
3. `manifest.yaml` — required context files and canonical commands
4. Adjacent source and tests for the feature being changed

Provider entrypoints such as `CLAUDE.md`, `GEMINI.md`, Copilot instructions,
and Cursor rules must remain thin pointers to the same local source of truth.
They must not define a competing architecture.

## Capability truth table

| Capability | Status in this repository | Evidence |
|---|---|---|
| DOM title/headings/anchor extraction | Implemented | `content_script.js` |
| Pairing-token storage | Implemented | `options.js` |
| Authenticated loopback relay | Implemented | `background/`; bounded in-memory latest scan waits only for the current authentication handshake |
| MV3 reconnect/keepalive | Implemented | `background/local_connection.js` |
| Content classification | Forbidden here | Windows Service boundary |
| Blocking or redirect | Forbidden here | `AGENTS.md`, invariant tests |
| Pattern Interrupt UI | Forbidden here | Windows Service/client boundary |
| End-to-end Windows protection | External code-complete prototype | peer service/agent source and CMake wiring exist; Windows build/VM evidence remains outside this repository |

Do not describe an external dependency as implemented merely because its
protocol is documented here.

Proposal traceability: this repository supports local URL and DOM sensing for
`PKM-AI-002` and `PKM-AI-003`. It does not satisfy Hybrid Analysis, blocking,
or Pattern Interrupt without the Windows service/client and model artifacts.

## Workflow

Keep a change within one verifiable unit:

1. Read the relevant source, test, manifest entry, and local documentation.
2. Preserve the passive-sensor and on-device privacy boundaries.
3. Make the smallest coherent change.
4. Keep tests and documentation aligned with behavior, but run only the default
   lint/static checks unless the user explicitly requests tests/packages.
5. Run the commands appropriate to the touched files.

On a fresh clone, run `npm ci` only when dependencies are absent. Default AI
validation is:

```sh
npm run lint
bash scripts/verify-ai-context.sh --allow-untracked

# Explicit user request only:
npm test
npm run package:extension
npm run verify:package
```

CI runs `scripts/verify-ai-context.sh` without the local-only
`--allow-untracked` escape hatch.

## Change routing

- DOM extraction behavior: `content_script.js`, its tests, and README limits
- Pairing behavior: `options.*`, background reconnect tests, and README
- Manifest permission or asset: `manifest.json`, README permissions, package
  validation, and release contents
- WebSocket message shape: coordinated change across `background.js`, README,
  tests, and the external Windows Service
- AI workflow/context: `AGENTS.md`, this directory, provider entrypoints, and
  context verifier

## Non-negotiable review checks

- No classification keyword list or probability calculation in the extension.
- No `chrome.tabs.update`, redirect, close-tab, or Pattern Interrupt behavior.
- No raw browsing payload sent anywhere except authenticated loopback IPC.
- No top-level ESM syntax in the classic content script.
- No manifest reference missing from the release ZIP.
- No required AI context file left untracked when CI runs.

## Updating context

For a meaningful workflow, boundary, or capability-status change:

1. update the version in `../../AGENTS.md` and `manifest.yaml`;
2. update the capability table and relevant README section;
3. run `bash scripts/verify-ai-context.sh --allow-untracked` locally;
4. ensure the final committed tree passes the verifier without the flag.
