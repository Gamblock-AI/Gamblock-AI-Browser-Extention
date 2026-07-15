// Stub the chrome extension API for jsdom tests.
globalThis.__GAMBLOCK_TEST__ = true;

globalThis.chrome = {
  runtime: {
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
  tabs: { query: (_q, cb) => cb && cb([]), update: () => {} },
};
