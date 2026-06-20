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
    status.textContent = 'Token tersimpan. Koneksi aktif di background.';
  }
});

saveBtn.addEventListener('click', () => {
  const token = input.value.trim();
  if (!token) {
    status.textContent = 'Token tidak boleh kosong.';
    return;
  }
  chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: token }, () => {
    // background.js listens to storage changes and reconnects automatically.
    status.textContent = 'Token disimpan. Menghubungkan ulang...';
  });
});
