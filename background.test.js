import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = [
  'background.js',
  'background/scan_payload.js',
  'background/browser_context.js',
  'background/pairing_store.js',
  'background/local_connection.js',
].map((path) => readFileSync(resolve(__dirname, path), 'utf8')).join('\n');

describe('background.js — passive-sensor invariants (PRD §3.1/§3.3)', () => {
  it('contains NO block/redirect command handling', () => {
    // The extension must not classify, block, or redirect tabs.
    expect(source).not.toMatch(/msg\.action\s*===\s*['"]block['"]/);
    expect(source).not.toMatch(/pattern-interrupt/);
    expect(source).not.toMatch(/chrome\.tabs\.update\(/);
  });

  it('authenticates the WebSocket with a pairing-token HMAC before relaying', () => {
    expect(source).toMatch(/type:\s*['"]auth_response['"]/);
    expect(source).toMatch(/server_hello/);
    expect(source).not.toMatch(/type:\s*['"]auth['"],\s*token/);
    expect(source).toMatch(/getPairingToken/);
    expect(source).toMatch(/connectionAuthenticated/);
  });

  it('only relays dom_scan when connectionAuthenticated', () => {
    expect(source).toMatch(/connectionAuthenticated/);
  });

  it('bounds and keeps scan payloads transient before the handshake', () => {
    expect(source).toMatch(/MAX_DOM_SCAN_BYTES/);
    expect(source).toMatch(/pendingScans/);
    expect(source).not.toMatch(/storage\.local\.set\([^\n]*dom_scan/);
  });
});

describe('background.js — module load under stubbed chrome', () => {
  let messageListener;
  let storageListener;
  let WebSocketMock;

  beforeEach(async () => {
    vi.resetModules();
    delete globalThis.GamblockExtensionBackground;
    globalThis.__GAMBLOCK_TEST__ = true;
    globalThis.importScripts = undefined;
    WebSocketMock = vi.fn(function () {
      this.readyState = 0;
      this.send = vi.fn();
      this.close = vi.fn();
    });
    WebSocketMock.CONNECTING = 0;
    WebSocketMock.OPEN = 1;
    globalThis.WebSocket = WebSocketMock;
    globalThis.chrome = {
      runtime: {
        id: 'test-extension-id', // simulate installed extension
        lastError: null,
        onMessage: { addListener: vi.fn((listener) => { messageListener = listener; }) },
        onInstalled: { addListener: vi.fn() },
        sendMessage: vi.fn(),
      },
      storage: {
        local: { get: (_k, cb) => cb && cb({}), set: (_o, cb) => cb && cb() },
        onChanged: { addListener: vi.fn((listener) => { storageListener = listener; }) },
      },
      alarms: {
        create: vi.fn(),
        onAlarm: { addListener: vi.fn() },
      },
      tabs: {
        get: (id, cb) => cb && cb({
          id,
          windowId: 3,
          active: true,
          url: 'https://example.test/path',
        }),
      },
      windows: {
        get: (id, cb) => cb && cb({ id, focused: true }),
      },
    };
    globalThis.console = { ...console, log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await import('./background/scan_payload.js');
    await import('./background/browser_context.js');
    await import('./background/pairing_store.js');
    await import('./background/local_connection.js');
  });

  it('imports without throwing and registers listeners', async () => {
    await expect(import('./background.js')).resolves.toBeDefined();
    // onInstalled + onMessage + storage onChanged listeners should be registered.
    expect(globalThis.chrome.runtime.onInstalled.addListener).toHaveBeenCalled();
    expect(globalThis.chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    expect(globalThis.chrome.storage.onChanged.addListener).toHaveBeenCalled();
    expect(globalThis.chrome.alarms.create).toHaveBeenCalledWith(
      'keep-alive-alarm',
      { periodInMinutes: 1 },
    );
    expect(globalThis.chrome.alarms.onAlarm.addListener).toHaveBeenCalled();
  });

  it('relays only an active focused source after mutual v2 authentication', async () => {
    globalThis.chrome.storage.local.get = (_k, cb) => cb({ gamblock_pairing_token: 'a'.repeat(64) });
    await import('./background.js');
    await Promise.resolve();
    const socket = WebSocketMock.mock.instances[0];
    socket.readyState = WebSocketMock.OPEN;
    socket.onopen();
    expect(socket.send).not.toHaveBeenCalled();
    socket.onmessage({
      data: JSON.stringify({
        type: 'server_hello',
        protocol: 2,
        server_nonce: 'b'.repeat(32),
      }),
    });
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(1));
    const auth = JSON.parse(socket.send.mock.calls[0][0]);
    expect(auth).toMatchObject({
      type: 'auth_response',
      protocol: 2,
      extension_id: 'test-extension-id',
    });
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('a'.repeat(64)),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const serverSource = `server|2|${'b'.repeat(32)}|${auth.client_nonce}|test-extension-id`;
    const signature = await crypto.subtle.sign(
      'HMAC', key, new TextEncoder().encode(serverSource),
    );
    const serverProof = Array.from(new Uint8Array(signature), (value) =>
      value.toString(16).padStart(2, '0')).join('');
    socket.onmessage({
      data: JSON.stringify({ type: 'auth_ok', protocol: 2, proof: serverProof }),
    });

    const response = vi.fn();
    messageListener(
      {
        type: 'dom_content',
        url: 'https://example.test/path',
        title: 'Example',
        headings: ['Heading'],
        anchorTexts: ['Read more'],
        extractionDurationMs: 3.25,
        scanStartedAtMs: 1_700_000_000_000,
      },
      { frameId: 0, tab: { id: 7, windowId: 3 } },
      response,
    );
    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ received: true }));
    expect(socket.send).toHaveBeenCalledTimes(2);
    const scan = JSON.parse(socket.send.mock.calls[1][0]);
    expect(scan).toMatchObject({
      type: 'dom_scan',
      url: 'https://example.test/path',
      title: 'Example',
      headings: ['Heading'],
      anchorTexts: ['Read more'],
      extractionDurationMs: 3.25,
      scanStartedAtMs: 1_700_000_000_000,
    });
    expect(scan.scan_id).toMatch(/^[a-f0-9]{32}$/);
    expect(typeof scan.timestamp).toBe('number');
  });

  it('rejects a scan whose source tab is not the active focused page', async () => {
    globalThis.chrome.tabs.get = (id, cb) => cb({
      id,
      windowId: 3,
      active: false,
      url: 'https://example.test/path',
    });
    await import('./background.js');
    const response = vi.fn();

    messageListener(
      { type: 'dom_content', url: 'https://example.test/path', title: 'Hidden' },
      { frameId: 0, tab: { id: 7, windowId: 3 } },
      response,
    );

    await vi.waitFor(() => expect(response).toHaveBeenCalledWith({ received: false }));
  });

  it('reports only opaque context state when the original page navigates', async () => {
    await import('./background.js');
    const registry = globalThis.__gamblockBackgroundTestApi.sourceContexts;
    const scanId = await registry.acceptSender(
      { frameId: 0, tab: { id: 7, windowId: 3 } },
      'https://example.test/path',
    );
    globalThis.chrome.tabs.get = (id, cb) => cb({
      id,
      windowId: 3,
      active: true,
      url: 'https://example.test/safe',
    });

    await expect(registry.probe(scanId)).resolves.toBe('navigated');
  });

  it('replaces an active socket immediately when the pairing token changes', async () => {
    globalThis.chrome.storage.local.get = (_k, cb) => cb({ gamblock_pairing_token: 'a'.repeat(64) });
    await import('./background.js');
    await Promise.resolve();
    const firstSocket = WebSocketMock.mock.instances[0];
    firstSocket.readyState = WebSocketMock.OPEN;
    firstSocket.onopen();

    globalThis.chrome.storage.local.get = (_k, cb) => cb({ gamblock_pairing_token: 'b'.repeat(64) });
    storageListener({ gamblock_pairing_token: { oldValue: 'a'.repeat(64), newValue: 'b'.repeat(64) } }, 'local');
    await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(2));

    expect(firstSocket.close).toHaveBeenCalled();
    expect(WebSocketMock).toHaveBeenCalledTimes(2);
  });

  it('stops retrying a rejected pairing token until the user changes it', async () => {
    globalThis.chrome.storage.local.get = (_k, cb) => cb({ gamblock_pairing_token: 'a'.repeat(64) });
    await import('./background.js');
    await Promise.resolve();
    const socket = WebSocketMock.mock.instances[0];
    socket.readyState = WebSocketMock.OPEN;
    socket.onopen();
    socket.onmessage({ data: JSON.stringify({ type: 'auth_denied' }) });
    socket.onclose();

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(WebSocketMock).toHaveBeenCalledTimes(1);
  });
});
