// Gamblock AI — Content Script (Passive DOM Sensor)
//
// ROLE (PRD §3.3): Reads key textual DOM elements (title, headings, anchor
// text) from the active page and forwards them to the extension background
// worker. This script performs NO analysis, NO classification, and NO
// blocking. It is a passive sensor only.

// Extract key DOM elements for the local AI classifier (PRD proposal §3:
// DOM analysis using title, heading, and anchor text -> Bag-of-Words).
// Exported for unit testing; in the extension it is consumed by sendDOM below.
export function extractDOM() {
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

// Forward the DOM snapshot to the background worker, which relays it to the
// local Windows Service over the authenticated WebSocket.
function sendDOM() {
  const dom = extractDOM();
  chrome.runtime.sendMessage(
    {
      type: 'dom_content',
      url: window.location.href,
      title: dom.title,
      headings: dom.headings,
      anchorTexts: dom.anchorTexts
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

  // Re-run on significant DOM changes (SPA navigation)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(sendDOM, 500);
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: false
  });
}
