# Gamblock AI Browser Extension

Follow `AGENTS.md` as the canonical repository instruction file, then read
`docs/ai/README.md` and `README.md`. Context version: `2026-07-15.2`.

This Chrome/Edge MV3 extension is a passive sensor only. Never add content
classification, gambling probabilities, page blocking, redirect/close-tab
behavior, Pattern Interrupt UI, remote telemetry, or transmission of browsing
data to a backend. DOM snapshots may be relayed only to the authenticated local
Windows Service at `ws://127.0.0.1:9090`.

Keep `content_script.js` compatible with classic content-script execution: no
top-level ESM `import` or `export`. Keep manifest permissions minimal and ensure
every referenced locale, script, page, and image is included in release ZIPs.
Do not change WebSocket message shapes without the coordinated peer-service and
README updates required by `AGENTS.md`.

Before completing code, run `npm run lint`. Use
`scripts/verify-ai-context.sh` after changing AI workflow files. Tests,
packaging, and smoke tests run only on the user's explicit request.
