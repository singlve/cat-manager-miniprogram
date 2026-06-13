import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const { getTheme, TAB_BAR_ICON_NAMES } = require('../utils/themes.js');

const root = resolve(import.meta.dirname, '..');
const read = file => readFileSync(resolve(root, file), 'utf8');

const decoratedHeroPages = [
  'pages/cat-list/cat-list.wxml',
  'pages/login/login.wxml',
  'pages/mine/mine.wxml',
  'pages/reminders/reminders.wxml',
  'pages/services/services.wxml',
  'packages/about/about.wxml',
  'packages/admin-announcement/admin-announcement.wxml',
  'packages/admin-benefits/admin-benefits.wxml',
  'packages/admin-data/admin-data.wxml',
  'packages/admin-items/admin-items.wxml',
  'packages/data-backup/data-backup.wxml',
  'packages/expense-add/expense-add.wxml',
  'packages/expense/expense.wxml',
  'packages/feedback-post/feedback-post.wxml',
  'packages/feedback/feedback.wxml',
  'packages/inventory/inventory.wxml',
  'packages/points-mall/points-mall.wxml',
  'packages/shipping-address/shipping-address.wxml',
  'packages/theme-center/theme-center.wxml',
  'pet-package/cat-detail/cat-detail.wxml',
  'pet-package/health-records/health-records.wxml',
  'pet-package/reminder-add/reminder-add.wxml',
  'pet-package/reminder-plan/reminder-plan.wxml',
  'pet-package/templates/cat-form.wxml',
  'pet-package/weight-records/weight-records.wxml'
];

describe('节日限定主题装饰', () => {
  it('新春和圣诞主题声明 Hero 装饰与 Tab 选中效果', () => {
    expect(getTheme('lunar')).toMatchObject({
      heroDecor: '/assets/decorations/lunar-hero.png',
      tabEffect: 'firecracker'
    });
    expect(getTheme('christmas')).toMatchObject({
      heroDecor: '/assets/decorations/christmas-hero.png',
      tabEffect: 'christmas-tree'
    });
  });

  it('Hero 装饰图片尺寸统一且保持轻量', () => {
    ['lunar', 'christmas'].forEach(key => {
      const file = resolve(root, `assets/decorations/${key}-hero.png`);
      const image = PNG.sync.read(readFileSync(file));
      expect(image.width).toBe(240);
      expect(image.height).toBe(83);
      expect(statSync(file).size).toBeLessThan(20 * 1024);
    });
  });

  it('新春和圣诞 Tab 图标保持微信要求的统一尺寸', () => {
    ['lunar', 'christmas'].forEach(themeKey => {
      TAB_BAR_ICON_NAMES.forEach(iconName => {
        const file = resolve(
          root,
          `assets/icons/themes/${themeKey}/${iconName}-active.png`
        );
        const image = PNG.sync.read(readFileSync(file));
        expect(image.width).toBe(81);
        expect(image.height).toBe(81);
        expect(statSync(file).size).toBeLessThan(8 * 1024);
      });
    });
  });

  it('各类 Hero 都接入同一个节日装饰模板', () => {
    decoratedHeroPages.forEach(file => {
      expect(read(file), file).toContain(
        '<include src="../../templates/festival-hero-decor.wxml" />'
      );
    });

    const template = read('templates/festival-hero-decor.wxml');
    expect(template).toContain("themeClass === 'theme-lunar'");
    expect(template).toContain("themeClass === 'theme-christmas'");
    expect(template).toContain('/assets/decorations/lunar-hero.png');
    expect(template).toContain('/assets/decorations/christmas-hero.png');
  });

  it('装饰层不会阻挡 Hero 内按钮或文字交互', () => {
    const appStyles = read('app.wxss');
    expect(appStyles).toContain('.festival-hero-decor');
    expect(appStyles).toContain('pointer-events: none');
    expect(appStyles).toContain('.home-hero');
    expect(appStyles).toContain('.login-brand');

    const centerTemplate = read('packages/theme-center/theme-center.wxml');
    expect(centerTemplate).toContain('wx:if="{{selectedTheme.heroDecor}}"');
    expect(centerTemplate).toContain('src="{{selectedTheme.heroDecor}}"');
  });
});
