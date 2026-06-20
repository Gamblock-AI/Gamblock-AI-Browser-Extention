# Gamblock AI — Browser Extension

Passive DOM sensor for Gamblock AI on Windows. Reads textual page content
(title, headings, anchor text) and forwards it to the local **Windows Service**
over an authenticated WebSocket for on-device AI classification.

## Architecture role (PRD §3.1 / §3.3)

This extension is a **passive sensor only**. It:

- Extracts DOM text and relays it to the local protection service.
- Authenticates to the service with a **pairing token**.
- Does **not** classify content, make blocking decisions, or redirect tabs.

All classification, blocking, and Pattern Interrupt execution is the sole
authority of the **Windows Service** (`gamblock_ai_apps/windows/runner`).

## Files

- `manifest.json` — MV3 manifest. Permissions: `activeTab`, `tabs`, `storage`.
- `background.js` — service worker; manages the authenticated WebSocket and
  relays DOM scans. Watches `chrome.storage.local` for token changes.
- `content_script.js` — injected per page; extracts DOM text and forwards it.
- `options.html` / `options.js` — pairing UI to enter the token from the
  Gamblock desktop client.

## Pairing flow

1. The Gamblock desktop client generates a pairing token (PRD §3.1).
2. Open the extension's options page (right-click the extension → Options).
3. Paste the token and save. `background.js` reconnects automatically.

## WebSocket protocol

Connection: `ws://127.0.0.1:9090`

1. Extension sends `{ "type": "auth", "token": "<pairing token>" }` on open.
2. Service replies `{ "type": "auth_ok" }` (accepted) or `{ "type": "auth_denied" }`
   (rejected, then closes the socket).
3. On `auth_ok`, the extension relays DOM scans as
   `{ "type": "dom_scan", "url", "title", "headings", "anchorTexts", "timestamp" }`.
4. The service must **never** instruct the extension to block or redirect; that
   authority stays server-side.

## TODO

- Add icons under `icons/` (`icon16.png`, `icon48.png`, `icon128.png`) and
  re-add the `icons` block to `manifest.json` once assets exist. They are
  intentionally omitted now so MV3 validation does not reference missing files.
