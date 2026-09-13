# Browser store publishing handoff

Gamblock-AI prepares two review artifacts from the same passive-sensor source:

| Artifact | Store targets | Manifest |
| --- | --- | --- |
| `gamblock-ai-extension-chromium-v<version>.zip` | Chrome Web Store and Microsoft Edge Add-ons | `manifest.json` |
| `gamblock-ai-extension-firefox-v<version>.zip` | Firefox Add-ons (AMO) | `manifest.firefox.json` |

Publishing is a manual external release action. Do not submit either artifact
until its package verification, privacy disclosure, permission justification,
and store listing have been reviewed by the release owner. Store approval is
not proof of Windows runtime compatibility.

After approval, record these public values in the private deployment handoff:

- Chrome Web Store extension ID;
- Microsoft Edge Add-ons extension ID;
- Firefox extension ID (`sensor@gamblock-ai.com`) and the official AMO latest
  XPI URL.

The IDs are release inputs for the Windows MSI's opt-in managed-browser mode.
They are not secrets, but they must come from the approved listings. Never
substitute an unpacked/developer build ID in a pilot MSI.

The extension remains passive in every store build. Store configuration must
not add remote code, telemetry, blocking, redirects, tab closing, or Pattern
Interrupt UI.
