## Testing

- `npm test` (vitest, jsdom). `vitest.setup.js` stubs the `chrome` API.
- `content_script.js` exports `extractDOM` and guards its auto-run behind
  `chrome.runtime.id` so it is importable in tests without side effects. Keep
  that guard when editing.
- `background.test.js` enforces the passive-sensor invariant: no `block`/
  redirect logic, token-gated relay. Do not reintroduce blocking in the
  extension (PRD §3.1/§3.3).

# Gamblock AI — Browser Extension Agent Rules

This directory is the Chrome/Edge MV3 extension. See the root `AGENTS.md` for
the full architecture and PRD alignment.

## Core invariant: PASSIVE SENSOR ONLY (PRD §3.3)

This extension MUST NOT:
- classify content or compute gambling probabilities,
- decide to block a page,
- redirect or close tabs,
- show its own Pattern Interrupt UI.

It only extracts DOM text (title, headings, anchor text) and relays it to the
local Windows Service over the authenticated WebSocket. Blocking, Pattern
Interrupt, and process termination are the Windows Service's authority.

## When editing

- Keep `background.js` free of any `block`/redirect command handling. If the
  service ever sends such a command, it is a protocol violation — do not act on
  it.
- Always authenticate the WebSocket with the pairing token from
  `chrome.storage.local` before relaying `dom_scan` messages.
- Do not add `webNavigation` or broad host-script permissions without need;
  keep the manifest permission set minimal.
- Do not reference icon files in `manifest.json` until they exist under
  `icons/` (MV3 validation fails on missing files).

## Protocol contract

See `README.md` → "WebSocket protocol". Any change to message shapes must be
mirrored in `gamblock_ai_apps/windows/runner/gamblock_service.cpp` (the service
side) and documented here.
