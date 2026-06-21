// Gamblock AI Browser Extension — Background Service Worker
//
// ROLE (PRD §3.3): This extension is a PASSIVE DOM SENSOR ONLY. It reads page
// text (title, headings, anchor text) and forwards it to the local Windows
// Service over an authenticated WebSocket. It MUST NOT classify content, make
// blocking decisions, or redirect tabs. All blocking and Pattern Interrupt
// execution is the sole authority of the Windows Service (PRD §3.1).

const WS_URL = 'ws://127.0.0.1:9090';
const TOKEN_STORAGE_KEY = 'gamblock_pairing_token';
const RECONNECT_DELAY_MS = 5000;
const PING_INTERVAL_MS = 20000; // 20 seconds

let ws = null;
let reconnectTimer = null;
let pingInterval = null;
let connectionAuthenticated = false;

// Read the pairing token that was entered during pairing with the Gamblock
// desktop client (see options page). The token authenticates this extension to
// the local Windows Service's WebSocket server (PRD §3.1 "otentikasi token
// enkripsi unik"). Returns '' when the extension has not been paired yet.
async function getPairingToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get([TOKEN_STORAGE_KEY], (result) => {
      resolve(result[TOKEN_STORAGE_KEY] || '');
    });
  });
}

// Connect to the local Gamblock protection service WebSocket.
// If no pairing token is configured, the connection is deferred until the user
// completes pairing on the options page.
async function connectWebSocket() {
  const token = await getPairingToken();
  if (!token) {
    console.log('[Gamblock] Not paired yet. Open the extension options to enter the pairing token.');
    return;
  }

  // Prevent multiple connections
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);
    connectionAuthenticated = false;

    ws.onopen = () => {
      // Send the pairing token as the first message so the service can verify
      // this connection before accepting any DOM scans. The service is expected
      // to close the socket if the token is invalid.
      ws.send(JSON.stringify({ type: 'auth', token }));
      console.log('[Gamblock] WebSocket opened, awaiting auth confirmation');
      
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      // --- KEEP-ALIVE MECHANISM FOR MV3 SERVICE WORKER ---
      // AI Agent Note: In Manifest V3, service workers are forcefully suspended 
      // after 30 seconds of inactivity. Sending a WebSocket message resets this 
      // idle timer. This 20-second interval ensures the worker stays alive 
      // indefinitely as long as the WebSocket connection is active.
      if (pingInterval) clearInterval(pingInterval);
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN && connectionAuthenticated) {
          ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        console.warn('[Gamblock] Ignored non-JSON message from service');
        return;
      }
      // The service confirms auth. We do NOT handle any block/redirect command
      // here — blocking is executed by the service itself (PRD §3.1).
      if (msg.type === 'auth_ok') {
        connectionAuthenticated = true;
        console.log('[Gamblock] Authenticated with local protection service');
      } else if (msg.type === 'auth_denied') {
        console.warn('[Gamblock] Pairing token rejected by service. Re-pair via options.');
        connectionAuthenticated = false;
      }
    };

    ws.onclose = () => {
      connectionAuthenticated = false;
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
      console.log('[Gamblock] Disconnected. Reconnecting in', RECONNECT_DELAY_MS, 'ms...');
      
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectWebSocket, RECONNECT_DELAY_MS);
    };

    ws.onerror = (err) => {
      console.error('[Gamblock] WebSocket error:', err);
    };
  } catch (e) {
    console.error('[Gamblock] Connection failed:', e);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWebSocket, RECONNECT_DELAY_MS);
  }
}

// Listen for DOM content forwarded by the content script, then relay it to the
// local service. Forwarding only happens on an authenticated connection.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'dom_content' && ws && ws.readyState === WebSocket.OPEN && connectionAuthenticated) {
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

// Reconnect whenever the pairing token changes (i.e. user paired or re-paired).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[TOKEN_STORAGE_KEY]) {
    if (ws) {
      try { ws.close(); } catch (_) {}
    }
    connectWebSocket();
  }
});

// --- FALLBACK KEEP-ALIVE MECHANISM ---
// AI Agent Note: The Chrome Alarms API wakes up the service worker every minute
// if it happens to die (e.g. computer goes to sleep and wakes up). This is a
// reliable safety net in MV3.
chrome.alarms.create("keep-alive-alarm", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keep-alive-alarm") {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log('[Gamblock] Alarm woke up worker. Reconnecting WebSocket...');
      connectWebSocket();
    }
  }
});

// Start on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Gamblock] Browser extension installed');
  connectWebSocket();
});

// Start on browser launch / service worker wake
connectWebSocket();
