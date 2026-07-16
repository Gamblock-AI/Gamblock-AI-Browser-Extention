// Pairing-token access is isolated so the connection lifecycle never needs to
// know how Chrome persists the local token.
(() => {
  const TOKEN_STORAGE_KEY = 'gamblock_pairing_token';

  async function getPairingToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get([TOKEN_STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
          resolve('');
          return;
        }
        resolve(typeof result[TOKEN_STORAGE_KEY] === 'string'
          ? result[TOKEN_STORAGE_KEY]
          : '');
      });
    });
  }

  function pairingTokenChanged(changes, area) {
    if (area !== 'local' || !changes[TOKEN_STORAGE_KEY]) {
      return null;
    }
    return Boolean(changes[TOKEN_STORAGE_KEY].newValue);
  }

  globalThis.GamblockExtensionBackground = Object.assign(
    globalThis.GamblockExtensionBackground || {},
    { TOKEN_STORAGE_KEY, getPairingToken, pairingTokenChanged },
  );
})();
