// Gamblock AI — Content Script (Passive DOM Sensor)
//
// ROLE (PRD §3.3): Reads key textual DOM elements (title, headings, anchor
// text) from the active page and forwards them to the extension background
// worker. This script performs NO analysis, NO classification, and NO
// blocking. It is a passive sensor only.

// Extract key DOM elements for the local AI classifier (PRD proposal §3:
// DOM analysis using title, heading, and anchor text -> Bag-of-Words).
// Kept as a plain function because manifest content scripts are classic scripts,
// not ES modules. Tests receive a reference through the guarded test API below.
function extractDOM() {
  const title = document.title || '';
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .map((h) => h.textContent.trim())
    .filter((t) => t.length > 0)
    .slice(0, 10);
  const anchorTexts = Array.from(document.querySelectorAll('a'))
    .map((a) => a.textContent.trim())
    .filter((t) => t.length > 0 && t.length < 200)
    .slice(0, 50);

  return { title, headings, anchorTexts };
}

// Expose only in the Vitest environment. This preserves direct unit-test access
// without adding ESM `export` syntax that would make Chrome reject the classic
// content script at runtime.
if (typeof globalThis !== 'undefined' && globalThis.__GAMBLOCK_TEST__ === true) {
  globalThis.__gamblockContentScriptTestApi = Object.freeze({ extractDOM });
}

// Forward the DOM snapshot to the background worker, which relays it to the
// local Windows Service over the authenticated WebSocket.
function sendDOM() {
  const scanStartedAtMs = Date.now();
  const extractionStartedAt = performance.now();
  const dom = extractDOM();
  const extractionDurationMs = Math.max(
    0,
    performance.now() - extractionStartedAt,
  );
  chrome.runtime.sendMessage(
    {
      type: 'dom_content',
      url: window.location.href,
      title: dom.title,
      headings: dom.headings,
      anchorTexts: dom.anchorTexts,
      extractionDurationMs,
      scanStartedAtMs,
    },
    () => {
      // Acknowledged by background. No further action.
    }
  );
}

// Auto-run only inside a real extension context (chrome.runtime.id is set for
// an installed extension; undefined in the jsdom test environment). This keeps
// the script importable for unit testing extractDOM() without side effects.
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
  // Run on page load
  if (document.readyState === 'complete') {
    sendDOM();
  } else {
    window.addEventListener('load', sendDOM);
  }

  // Debounced forwarder shared by the navigation, Enter, and submit triggers
  // so a burst of committed signals still yields a single snapshot.
  let sendTimer = null;
  function scheduleSend() {
    if (sendTimer) {
      clearTimeout(sendTimer);
    }
    sendTimer = setTimeout(() => {
      sendTimer = null;
      sendDOM();
    }, 500);
  }

  // Re-run on committed navigation (URL change, e.g. SPA routing)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      scheduleSend();
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: false
  });

  // Activate on Enter (excluding IME composition) and form submits. Keystroke
  // content itself is never read: extraction only happens after the user
  // commits an action, never on plain text edits or DOM mutations.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        scheduleSend();
      }
    },
    true
  );
  document.addEventListener(
    'submit',
    () => {
      scheduleSend();
    },
    true
  );
}
