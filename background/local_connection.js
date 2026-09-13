// Authenticated loopback WebSocket lifecycle. DOM snapshots are bounded and
// transient; no browsing data is persisted or sent to a remote service.
(() => {
  const WS_URL = 'ws://127.0.0.1:9090';
  const RECONNECT_DELAY_MS = 5000;
  const PING_INTERVAL_MS = 20000;
  const MAX_PENDING_SCANS = 10;

  const PROTOCOL_VERSION = 2;

  function randomHex(byteCount) {
    const bytes = new Uint8Array(byteCount);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0'))
      .join('');
  }

  async function hmacHex(token, message) {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(token),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(message),
    );
    return Array.from(new Uint8Array(signature), (value) =>
      value.toString(16).padStart(2, '0')).join('');
  }

  function timingSafeEqual(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string' ||
        left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
  }

  class LocalProtectionConnection {
    constructor(getPairingToken, probeContext) {
      this.getPairingToken = getPairingToken;
      this.probeContext = probeContext;
      this.ws = null;
      this.reconnectTimer = null;
      this.pingInterval = null;
      this.connectionAuthenticated = false;
      this.pairingConfigured = false;
      this.pairingRejected = false;
      this.connectionGeneration = 0;
      this.connecting = false;
      this.pendingScans = new Map();
      this.authContext = null;
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
      this.authContext = null;
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

    relayOrQueue(scan) {
      const key = scan.scanId;
      if (this.sendDomScan(this.ws, scan.payload)) {
        this.pendingScans.delete(key);
        return;
      }
      this.queuePendingScan(key, scan.payload);
      // A committed navigation can be the first signal after the Windows
      // service has restarted. Nudge the connection immediately instead of
      // waiting for the long reconnect timer; the latest scan remains bounded
      // and in memory while authentication completes.
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.clearReconnectTimer();
        this.connect();
      }
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
      if (this.connecting) {
        return;
      }
      const attemptGeneration = this.connectionGeneration;
      this.connecting = true;
      try {
        await this.connectInternal();
      } finally {
        this.connecting = false;
        if (attemptGeneration !== this.connectionGeneration &&
            this.pairingConfigured && !this.pairingRejected && !this.ws) {
          this.connect();
        }
      }
    }

    async connectInternal() {
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
      this.authContext = null;
      this.installSocketHandlers(socket, token);
    }

    installSocketHandlers(socket, token) {
      socket.onopen = () => {
        if (socket !== this.ws) {
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
        if (message.type === 'server_hello' &&
            !this.connectionAuthenticated) {
          void this.answerServerHello(socket, token, message);
        } else if (message.type === 'auth_ok' &&
                   !this.connectionAuthenticated) {
          void this.acceptServerProof(socket, token, message);
        } else if (message.type === 'auth_denied') {
          this.connectionAuthenticated = false;
          this.pairingRejected = true;
          this.pendingScans.clear();
          socket.close();
        } else if (message.type === 'context_probe' &&
                   this.connectionAuthenticated) {
          void this.answerContextProbe(socket, message);
        }
      };

      socket.onclose = () => {
        if (socket !== this.ws) {
          return;
        }
        this.ws = null;
        this.connectionAuthenticated = false;
        this.authContext = null;
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

    async answerServerHello(socket, token, message) {
      if (socket !== this.ws || message.protocol !== PROTOCOL_VERSION ||
          this.authContext || typeof message.server_nonce !== 'string' ||
          !/^[a-f0-9]{32}$/.test(message.server_nonce)) return;
      const clientNonce = randomHex(16);
      const extensionId = chrome.runtime.id;
      const auth = {
        serverNonce: message.server_nonce,
        clientNonce,
        extensionId,
      };
      this.authContext = auth;
      const source = `client|${PROTOCOL_VERSION}|${message.server_nonce}|${clientNonce}|${extensionId}`;
      try {
        const proof = await hmacHex(token, source);
        if (socket !== this.ws || socket.readyState !== WebSocket.OPEN ||
            this.authContext !== auth) return;
        socket.send(JSON.stringify({
          type: 'auth_response',
          protocol: PROTOCOL_VERSION,
          extension_id: extensionId,
          client_nonce: clientNonce,
          proof,
        }));
      } catch (_) {
        if (this.authContext === auth) this.authContext = null;
        socket.close();
      }
    }

    async acceptServerProof(socket, token, message) {
      const auth = this.authContext;
      if (socket !== this.ws || !auth ||
          message.protocol !== PROTOCOL_VERSION ||
          typeof message.proof !== 'string') return;
      const source = `server|${PROTOCOL_VERSION}|${auth.serverNonce}|${auth.clientNonce}|${auth.extensionId}`;
      try {
        const expected = await hmacHex(token, source);
        if (socket !== this.ws || this.authContext !== auth) return;
        if (!timingSafeEqual(message.proof, expected)) {
          this.pairingRejected = true;
          socket.close();
          return;
        }
        this.pairingRejected = false;
        this.connectionAuthenticated = true;
        this.authContext = null;
        this.flushPendingScans(socket);
      } catch (_) {
        socket.close();
      }
    }

    async answerContextProbe(socket, message) {
      if (typeof message.probe_id !== 'string' ||
          typeof message.scan_id !== 'string' ||
          !/^[a-f0-9]{32}$/.test(message.probe_id) ||
          !/^[a-f0-9]{32}$/.test(message.scan_id)) return;
      const state = await this.probeContext(message.scan_id);
      if (socket !== this.ws || !this.connectionAuthenticated ||
          socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify({
          type: 'context_probe_result',
          probe_id: message.probe_id,
          state,
        }));
      } catch (_) {
        socket.close();
      }
    }

    handleDomScan(scan) {
      if (this.pairingConfigured) {
        this.relayOrQueue(scan);
        return;
      }
      void this.getPairingToken().then((token) => {
        if (!token) {
          return;
        }
        this.pairingConfigured = true;
        this.relayOrQueue(scan);
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
