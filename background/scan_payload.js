// Bounded, local-only DOM snapshot construction for the extension worker.
// This file deliberately performs no classification or blocking.
(() => {
  const encoder = new TextEncoder();
  const MAX_DOM_SCAN_BYTES = 24 * 1024;
  const MAX_URL_BYTES = 2048;
  const MAX_TITLE_BYTES = 512;
  const MAX_HEADING_BYTES = 192;
  const MAX_ANCHOR_BYTES = 160;
  const MAX_HEADINGS = 10;
  const MAX_ANCHORS = 50;

  function truncateUtf8(value, maximumBytes) {
    if (typeof value !== 'string' || !value) {
      return '';
    }
    if (encoder.encode(value).byteLength <= maximumBytes) {
      return value;
    }

    let result = '';
    let usedBytes = 0;
    for (const character of value) {
      const characterBytes = encoder.encode(character).byteLength;
      if (usedBytes + characterBytes > maximumBytes) {
        break;
      }
      result += character;
      usedBytes += characterBytes;
    }
    return result;
  }

  function boundedStrings(values, maximumItems, maximumItemBytes) {
    if (!Array.isArray(values)) {
      return [];
    }
    const result = [];
    for (const value of values) {
      const bounded = truncateUtf8(value, maximumItemBytes).trim();
      if (bounded) {
        result.push(bounded);
      }
      if (result.length === maximumItems) {
        break;
      }
    }
    return result;
  }

  function boundedDuration(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.min(value, 10_000)
      : 0;
  }

  function boundedEpochMilliseconds(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : Date.now();
  }

  function makeDomScan(message) {
    if (!message || message.type !== 'dom_content') {
      return null;
    }
    const url = truncateUtf8(message.url, MAX_URL_BYTES);
    if (!url) {
      return null;
    }
    const scan = {
      type: 'dom_scan',
      extractionDurationMs: boundedDuration(message.extractionDurationMs),
      scanStartedAtMs: boundedEpochMilliseconds(message.scanStartedAtMs),
      url,
      title: truncateUtf8(message.title, MAX_TITLE_BYTES).trim(),
      headings: boundedStrings(message.headings, MAX_HEADINGS, MAX_HEADING_BYTES),
      anchorTexts: boundedStrings(message.anchorTexts, MAX_ANCHORS, MAX_ANCHOR_BYTES),
      timestamp: Date.now(),
    };
    const payload = JSON.stringify(scan);
    return encoder.encode(payload).byteLength <= MAX_DOM_SCAN_BYTES
      ? { payload, url }
      : null;
  }

  function pendingKey(sender, url) {
    const tabId = sender?.tab?.id;
    return Number.isInteger(tabId) ? `tab:${tabId}` : `url:${url}`;
  }

  globalThis.GamblockExtensionBackground = Object.assign(
    globalThis.GamblockExtensionBackground || {},
    { makeDomScan, pendingKey },
  );
})();
