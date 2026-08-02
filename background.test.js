import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = [
  'background.js',
  'background/scan_payload.js',
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

  it('authenticates the WebSocket with a pairing token before relaying', () => {
    expect(source).toMatch(/type:\s*['"]auth['"]/);
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
      tabs: { query: (_q, cb) => cb && cb([]) },
    };
    globalThis.console = { ...console, log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await import('./background/scan_payload.js');
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

  it('queues the first scan until auth_ok, then relays the existing wire shape', async () => {
    globalThis.chrome.storage.local.get = (_k, cb) => cb({ gamblock_pairing_token: 'a'.repeat(64) });
    await import('./background.js');
    await Promise.resolve();
    const socket = WebSocketMock.mock.instances[0];
    socket.readyState = WebSocketMock.OPEN;
    socket.onopen();
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth', token: 'a'.repeat(64) }));

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
      { tab: { id: 7 } },
      vi.fn(),
    );
    expect(socket.send).toHaveBeenCalledTimes(1);

    socket.onmessage({ data: JSON.stringify({ type: 'auth_ok' }) });
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
    expect(typeof scan.timestamp).toBe('number');
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
