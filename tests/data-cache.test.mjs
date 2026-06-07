import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Tab 页面数据缓存', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('在 TTL 内复用页面，数据变化后立即刷新', async () => {
    const cache = await import('../utils/data-cache.js');

    expect(cache.shouldRefreshPage('home', ['cats'], 1000)).toBe(true);
    cache.markPageLoaded('home', ['cats']);
    expect(cache.shouldRefreshPage('home', ['cats'], 1000)).toBe(false);
    cache.markDataDirty('cats');
    expect(cache.shouldRefreshPage('home', ['cats'], 1000)).toBe(true);
  });
});
