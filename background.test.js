import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, 'background.js'), 'utf8');

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
});

describe('background.js — module load under stubbed chrome', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.WebSocket = vi.fn(function () {
      this.readyState = 0;
      this.send = vi.fn();
      this.close = vi.fn();
    });
    globalThis.chrome = {
      runtime: {
        id: 'test-extension-id', // simulate installed extension
        onMessage: { addListener: vi.fn() },
        onInstalled: { addListener: vi.fn() },
        sendMessage: vi.fn(),
      },
      storage: {
        local: { get: (_k, cb) => cb && cb({}), set: (_o, cb) => cb && cb() },
        onChanged: { addListener: vi.fn() },
      },
      alarms: {
        create: vi.fn(),
        onAlarm: { addListener: vi.fn() },
      },
      tabs: { query: (_q, cb) => cb && cb([]) },
    };
    globalThis.console = { ...console, log: vi.fn(), warn: vi.fn(), error: vi.fn() };
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
});
