// Authenticated loopback WebSocket lifecycle. DOM snapshots are bounded and
// transient; no browsing data is persisted or sent to a remote service.
(() => {
  const WS_URL = 'ws://127.0.0.1:9090';
  const RECONNECT_DELAY_MS = 5000;
  const PING_INTERVAL_MS = 20000;
  const MAX_PENDING_SCANS = 10;

  class LocalProtectionConnection {
    constructor(getPairingToken, pendingKey) {
      this.getPairingToken = getPairingToken;
      this.pendingKey = pendingKey;
      this.ws = null;
      this.reconnectTimer = null;
      this.pingInterval = null;
      this.connectionAuthenticated = false;
      this.pairingConfigured = false;
      this.pairingRejected = false;
      this.connectionGeneration = 0;
      this.pendingScans = new Map();
    }

    stopKeepAlive() {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
    }

    clearReconnectTimer() {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    }

    scheduleReconnect() {
      if (!this.pairingConfigured || this.pairingRejected ||
          this.reconnectTimer) {
        return;
      }
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, RECONNECT_DELAY_MS);
    }

    closeCurrentSocket() {
      const socket = this.ws;
      this.ws = null;
      this.connectionAuthenticated = false;
      this.stopKeepAlive();
      if (socket) {
        try {
          socket.close();
        } catch (_) {
          // Stale callbacks are ignored after the active socket is cleared.
        }
      }
    }

    queuePendingScan(key, payload) {
      this.pendingScans.delete(key);
      this.pendingScans.set(key, payload);
      while (this.pendingScans.size > MAX_PENDING_SCANS) {
        this.pendingScans.delete(this.pendingScans.keys().next().value);
      }
    }

    sendDomScan(socket, payload) {
      if (socket !== this.ws || !this.connectionAuthenticated ||
          socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      try {
        socket.send(payload);
        return true;
      } catch (_) {
        try {
          socket.close();
        } catch (_) {
          // The close callback schedules a later local retry.
        }
        return false;
      }
    }

    relayOrQueue(scan, sender) {
      const key = this.pendingKey(sender, scan.url);
      if (this.sendDomScan(this.ws, scan.payload)) {
        this.pendingScans.delete(key);
        return;
      }
      this.queuePendingScan(key, scan.payload);
    }

    flushPendingScans(socket) {
      if (socket !== this.ws || !this.connectionAuthenticated) {
        return;
      }
      for (const [key, payload] of [...this.pendingScans]) {
        if (!this.sendDomScan(socket, payload)) {
          return;
        }
        this.pendingScans.delete(key);
      }
    }

    async connect() {
      if (this.pairingRejected) {
        return;
      }
      const generation = this.connectionGeneration;
      const token = await this.getPairingToken();
      if (generation !== this.connectionGeneration) {
        return;
      }
      this.pairingConfigured = Boolean(token);
      if (!token) {
        this.pendingScans.clear();
        return;
      }
      if (this.ws && (this.ws.readyState === WebSocket.CONNECTING ||
          this.ws.readyState === WebSocket.OPEN)) {
        return;
      }

      let socket;
      try {
        socket = new WebSocket(WS_URL);
      } catch (error) {
        console.error('[Gamblock] Connection failed:', error);
        this.scheduleReconnect();
        return;
      }
      this.ws = socket;
      this.connectionAuthenticated = false;
      this.installSocketHandlers(socket, token);
    }

    installSocketHandlers(socket, token) {
      socket.onopen = () => {
        if (socket !== this.ws) {
          return;
        }
        try {
          socket.send(JSON.stringify({ type: 'auth', token }));
        } catch (_) {
          socket.close();
          return;
        }
        this.clearReconnectTimer();
        this.stopKeepAlive();
        this.pingInterval = setInterval(() => {
          if (socket === this.ws && this.connectionAuthenticated &&
              socket.readyState === WebSocket.OPEN) {
            try {
              socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            } catch (_) {
              socket.close();
            }
          }
        }, PING_INTERVAL_MS);
      };

      socket.onmessage = (event) => {
        if (socket !== this.ws) {
          return;
        }
        let message;
        try {
          message = JSON.parse(event.data);
        } catch (_) {
          console.warn('[Gamblock] Ignored non-JSON message from service');
          return;
        }
        if (message.type === 'auth_ok') {
          this.pairingRejected = false;
          this.connectionAuthenticated = true;
          this.flushPendingScans(socket);
        } else if (message.type === 'auth_denied') {
          this.connectionAuthenticated = false;
          this.pairingRejected = true;
          this.pendingScans.clear();
          socket.close();
        }
      };

      socket.onclose = () => {
        if (socket !== this.ws) {
          return;
        }
        this.ws = null;
        this.connectionAuthenticated = false;
        this.stopKeepAlive();
        this.pendingScans.clear();
        this.scheduleReconnect();
      };

      socket.onerror = (error) => {
        if (socket === this.ws) {
          console.error('[Gamblock] WebSocket error:', error);
        }
      };
    }

    handleDomScan(scan, sender) {
      if (this.pairingConfigured) {
        this.relayOrQueue(scan, sender);
        return;
      }
      void this.getPairingToken().then((token) => {
        if (!token) {
          return;
        }
        this.pairingConfigured = true;
        this.relayOrQueue(scan, sender);
        this.connect();
      });
    }

    replacePairing(hasToken) {
      this.connectionGeneration += 1;
      this.clearReconnectTimer();
      this.pendingScans.clear();
      this.pairingConfigured = hasToken;
      this.pairingRejected = false;
      this.closeCurrentSocket();
      if (hasToken) {
        this.connect();
      }
    }

    wake() {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.connect();
      }
    }
  }

  globalThis.GamblockExtensionBackground = Object.assign(
    globalThis.GamblockExtensionBackground || {},
    { LocalProtectionConnection },
  );
})();
