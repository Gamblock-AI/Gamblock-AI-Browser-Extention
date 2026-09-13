// Stub the chrome extension API for jsdom tests.
globalThis.__GAMBLOCK_TEST__ = true;

globalThis.chrome = {
  runtime: {
    id: 'test-extension-id',
    lastError: null,
    sendMessage: () => {},
    onMessage: { addListener: () => {} },
    onInstalled: { addListener: () => {} },
  },
  storage: {
    local: { get: (_keys, cb) => cb && cb({}), set: (_obj, cb) => cb && cb() },
    onChanged: { addListener: () => {} },
  },
  alarms: {
    create: () => {},
    onAlarm: { addListener: () => {} },
  },
  tabs: {
    get: (id, cb) => cb && cb({ id, windowId: 1, active: true, url: '' }),
    query: (_q, cb) => cb && cb([]),
    update: () => {},
  },
  windows: { get: (id, cb) => cb && cb({ id, focused: true }) },
};
