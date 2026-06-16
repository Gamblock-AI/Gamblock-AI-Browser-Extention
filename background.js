// Gamblock AI Browser Extension — Background Service Worker

const WS_URL = 'ws://localhost:9090';
let ws = null;
let reconnectTimer = null;

// Connect to Gamblock's local WebSocket server
function connectWebSocket() {
  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[Gamblock] Connected to local protection service');
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onclose = () => {
      console.log('[Gamblock] Disconnected. Reconnecting in 5s...');
      reconnectTimer = setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = (err) => {
      console.error('[Gamblock] WebSocket error:', err);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.action === 'block') {
        // Redirect blocked tab to Pattern Interrupt page
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.update(tabs[0].id, {
              url: 'https://gamblock-ai.vercel.app/pattern-interrupt'
            });
          }
        });
      }
    };
  } catch (e) {
    console.error('[Gamblock] Connection failed:', e);
    reconnectTimer = setTimeout(connectWebSocket, 5000);
  }
}

// Listen for DOM content from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'dom_content' && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'dom_scan',
      url: message.url,
      title: message.title,
      headings: message.headings,
      anchorTexts: message.anchorTexts,
      timestamp: Date.now()
    }));
  }
  sendResponse({ received: true });
});

// Start on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Gamblock] Browser extension installed');
  connectWebSocket();
});

// Start on browser launch
connectWebSocket();
