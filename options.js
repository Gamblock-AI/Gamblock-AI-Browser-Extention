// Gamblock AI — Pairing options page
// Stores the pairing token (issued by the Gamblock desktop client) in
// chrome.storage.local. Background.js watches for changes and reconnects.

const TOKEN_STORAGE_KEY = 'gamblock_pairing_token';
const input = document.getElementById('token');
const saveBtn = document.getElementById('save');
const status = document.getElementById('status');

// Load any previously saved token so the field is not empty on re-open.
chrome.storage.local.get([TOKEN_STORAGE_KEY], (result) => {
  if (result[TOKEN_STORAGE_KEY]) {
    input.value = result[TOKEN_STORAGE_KEY];
    status.textContent = chrome.i18n.getMessage("statusSavedActive");
  }
});

saveBtn.addEventListener('click', () => {
  const token = input.value.trim();
  if (!token) {
    status.textContent = chrome.i18n.getMessage("statusEmpty");
    return;
  }
  chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: token }, () => {
    // background.js listens to storage changes and reconnects automatically.
    status.textContent = chrome.i18n.getMessage("statusSavedReconnecting");
  });
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.innerHTML = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = chrome.i18n.getMessage(el.getAttribute('data-i18n-placeholder'));
  });
});
