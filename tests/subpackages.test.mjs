import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('非核心页面分包', () => {
  it('服务工具页面注册在独立分包', () => {
    const app = JSON.parse(read('app.json'));
    const servicePackage = app.subPackages.find(item => item.root === 'packages');

    expect(servicePackage).toBeTruthy();
    expect(servicePackage.pages).toContain('services/points-mall/points-mall');
    expect(servicePackage.pages).toContain('services/inventory/inventory');
    expect(servicePackage.pages).toContain('services/theme-center/theme-center');
    expect(servicePackage.pages).toContain('services/admin-items/admin-items');
  });

  it('核心四个 Tab 仍处于主包', () => {
    const app = JSON.parse(read('app.json'));
    const tabPaths = app.tabBar.list.map(item => item.pagePath);

    tabPaths.forEach(path => expect(app.pages).toContain(path));
  });
});
