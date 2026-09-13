// Active source-tab validation for local Windows protection. Tab and window
// identifiers remain in volatile extension memory and never cross the socket.
(() => {
  const MAX_CONTEXTS = 64;
  const CONTEXT_TTL_MS = 15_000;

  function randomScanId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0'))
      .join('');
  }

  function callChrome(method, ...args) {
    return new Promise((resolve, reject) => {
      method(...args, (value) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(value);
      });
    });
  }

  class SourceContextRegistry {
    constructor() {
      this.contexts = new Map();
    }

    prune() {
      const now = Date.now();
      for (const [scanId, context] of this.contexts) {
        if (context.expiresAt <= now) this.contexts.delete(scanId);
      }
      while (this.contexts.size > MAX_CONTEXTS) {
        this.contexts.delete(this.contexts.keys().next().value);
      }
    }

    async acceptSender(sender, url) {
      if (!sender?.tab || !Number.isInteger(sender.tab.id) ||
          !Number.isInteger(sender.tab.windowId) || sender.frameId !== 0) {
        return null;
      }
      try {
        const tab = await callChrome(chrome.tabs.get.bind(chrome.tabs), sender.tab.id);
        const window = await callChrome(
          chrome.windows.get.bind(chrome.windows),
          sender.tab.windowId,
        );
        if (!tab?.active || !window?.focused ||
            tab.windowId !== sender.tab.windowId || tab.url !== url) {
          return null;
        }
        const scanId = randomScanId();
        this.contexts.set(scanId, {
          tabId: sender.tab.id,
          windowId: sender.tab.windowId,
          url,
          expiresAt: Date.now() + CONTEXT_TTL_MS,
        });
        this.prune();
        return scanId;
      } catch (_) {
        return null;
      }
    }

    async probe(scanId) {
      this.prune();
      const context = this.contexts.get(scanId);
      if (!context) return 'unknown';
      try {
        const tab = await callChrome(chrome.tabs.get.bind(chrome.tabs), context.tabId);
        if (tab?.url !== context.url) {
          this.contexts.delete(scanId);
          return 'navigated';
        }
        const window = await callChrome(
          chrome.windows.get.bind(chrome.windows),
          context.windowId,
        );
        return tab?.active && window?.focused && tab.windowId === context.windowId
          ? 'same_active_focused'
          : 'source_lost';
      } catch (error) {
        this.contexts.delete(scanId);
        try {
          const tabs = await callChrome(chrome.tabs.query.bind(chrome.tabs), {});
          return Array.isArray(tabs) &&
              !tabs.some((tab) => tab?.id === context.tabId)
            ? 'closed'
            : 'unknown';
        } catch (_) {
          return 'unknown';
        }
      }
    }

    clear() {
      this.contexts.clear();
    }
  }

  globalThis.GamblockExtensionBackground = Object.assign(
    globalThis.GamblockExtensionBackground || {},
    { SourceContextRegistry },
  );
})();
