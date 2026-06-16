// Gamblock AI — Content Script (DOM Sensor)
// Passively reads page content and sends to extension background

(function() {
  'use strict';

  // Extract key DOM elements
  function extractDOM() {
    const title = document.title || '';
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .map(h => h.textContent.trim())
      .filter(t => t.length > 0)
      .slice(0, 10);
    const anchorTexts = Array.from(document.querySelectorAll('a'))
      .map(a => a.textContent.trim())
      .filter(t => t.length > 0 && t.length < 200)
      .slice(0, 50);

    return { title, headings, anchorTexts };
  }

  // Send to background script
  function sendDOM() {
    const dom = extractDOM();
    chrome.runtime.sendMessage({
      type: 'dom_content',
      url: window.location.href,
      title: dom.title,
      headings: dom.headings,
      anchorTexts: dom.anchorTexts
    }, (response) => {
      // Acknowledged
    });
  }

  // Run on page load
  if (document.readyState === 'complete') {
    sendDOM();
  } else {
    window.addEventListener('load', sendDOM);
  }

  // Also run when DOM changes significantly (SPA navigation)
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
})();
