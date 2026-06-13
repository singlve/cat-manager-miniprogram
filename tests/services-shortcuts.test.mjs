import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('服务页快捷入口', () => {
  it('提供积分小铺和我的背包入口', () => {
    const js = read('pages/services/services.js');
    const wxml = read('pages/services/services.wxml');

    expect(js).toContain("goPointsMall() { wx.navigateTo({ url: '/packages/points-mall/points-mall' }); }");
    expect(js).toContain("goInventory() { wx.navigateTo({ url: '/packages/inventory/inventory' }); }");
    expect(wxml).toContain('bindtap="goPointsMall"');
    expect(wxml).toContain('bindtap="goInventory"');
    expect(wxml).toContain('积分小铺');
    expect(wxml).toContain('我的背包');
  });

  it('商城和公告使用清晰的独立图标', () => {
    const wxml = read('pages/services/services.wxml');

    expect(wxml).toContain('/assets/icons/ui/shop.png');
    expect(wxml).toContain('/assets/icons/ui/announce.png');
    expect(existsSync(resolve(root, 'assets/icons/ui/shop.png'))).toBe(true);
    expect(existsSync(resolve(root, 'assets/icons/ui/announce.png'))).toBe(true);
  });
});
