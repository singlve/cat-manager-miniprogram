import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('privacy-safe error diagnostics', () => {
  it('keeps a bounded log and removes sensitive metadata', () => {
    let stored = [];
    global.wx = {
      getStorageSync() { return stored; },
      setStorageSync(key, value) { stored = value; },
      removeStorageSync() { stored = []; }
    };
    const { MAX_LOGS, reportError } = require('../utils/error-log.js');

    for (let index = 0; index < MAX_LOGS + 4; index++) {
      reportError('test.scope', new Error('failed ' + index), {
        itemId: index,
        phone: '13800000000',
        password: 'secret'
      });
    }

    expect(stored).toHaveLength(MAX_LOGS);
    expect(stored[0].meta.itemId).toBe(String(MAX_LOGS + 3));
    expect(stored[0].meta.phone).toBeUndefined();
    expect(stored[0].meta.password).toBeUndefined();
    delete global.wx;
  });
});
