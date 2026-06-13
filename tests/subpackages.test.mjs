import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('非核心页面分包', () => {
  it('服务工具、宠物照护和账号页面分别注册在独立分包', () => {
    const app = JSON.parse(read('app.json'));
    const servicePackage = app.subPackages.find(item => item.root === 'packages');
    const petPackage = app.subPackages.find(item => item.root === 'pet-package');
    const accountPackage = app.subPackages.find(item => item.root === 'account-package');

    expect(servicePackage).toBeTruthy();
    expect(servicePackage.pages).toContain('points-mall/points-mall');
    expect(servicePackage.pages).toContain('inventory/inventory');
    expect(servicePackage.pages).toContain('theme-center/theme-center');
    expect(servicePackage.pages).toContain('admin-items/admin-items');
    expect(servicePackage.pages).toContain('expense/expense');
    expect(servicePackage.pages).toContain('data-backup/data-backup');

    expect(petPackage).toBeTruthy();
    expect(petPackage.pages).toContain('cat-detail/cat-detail');
    expect(petPackage.pages).toContain('health-records/health-records');
    expect(petPackage.pages).toContain('reminder-add/reminder-add');

    expect(accountPackage).toBeTruthy();
    expect(accountPackage.pages).toContain('register/register');
    expect(accountPackage.pages).toContain('bind-phone/bind-phone');
  });

  it('主包只保留四个 Tab 和登录页', () => {
    const app = JSON.parse(read('app.json'));
    const tabPaths = app.tabBar.list.map(item => item.pagePath);

    tabPaths.forEach(path => expect(app.pages).toContain(path));
    expect(app.pages.sort()).toEqual([
      'pages/cat-list/cat-list',
      'pages/login/login',
      'pages/mine/mine',
      'pages/reminders/reminders',
      'pages/services/services'
    ].sort());
  });
});
