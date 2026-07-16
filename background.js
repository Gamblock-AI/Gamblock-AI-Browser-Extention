// Gamblock AI Browser Extension — MV3 service worker entrypoint.
// The files below separate payload shaping, pairing storage, and socket
// lifecycle. This extension remains a passive local DOM sensor only.
if (typeof importScripts === 'function') {
  importScripts(
    'background/scan_payload.js',
    'background/pairing_store.js',
    'background/local_connection.js',
  );
}

const backgroundApi = globalThis.GamblockExtensionBackground;
if (!backgroundApi) {
  throw new Error('Gamblock background modules did not load');
}

const connection = new backgroundApi.LocalProtectionConnection(
  backgroundApi.getPairingToken,
  backgroundApi.pendingKey,
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const scan = backgroundApi.makeDomScan(message);
  if (scan) {
    connection.handleDomScan(scan, sender);
  }
  sendResponse({ received: true });
});

chrome.storage.onChanged.addListener((changes, area) => {
  const hasToken = backgroundApi.pairingTokenChanged(changes, area);
  if (hasToken !== null) {
    connection.replacePairing(hasToken);
  }
});

chrome.alarms.create('keep-alive-alarm', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keep-alive-alarm') {
    connection.wake();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  connection.connect();
});

connection.connect();

if (typeof globalThis !== 'undefined' && globalThis.__GAMBLOCK_TEST__ === true) {
  globalThis.__gamblockBackgroundTestApi = Object.freeze({ connection });
}
