import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  DEFAULT_THEME_KEY,
  TAB_BAR_ICON_NAMES,
  THEMES,
  applyNativeTheme,
  getThemeCanvasPalette,
  getTheme,
  getThemeProducts,
  getStoredThemeKey,
  normalizeOwnedThemes
} = require('../utils/themes.js');
const {
  getExpenseCategories
} = require('../utils/expense-categories.js');

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('积分主题配置', () => {
  it('默认主题始终存在且未知主题回退到默认主题', () => {
    expect(DEFAULT_THEME_KEY).toBe('default');
    expect(THEMES[0].key).toBe(DEFAULT_THEME_KEY);
    expect(getTheme('missing-theme').key).toBe(DEFAULT_THEME_KEY);
  });

  it('用户主题列表会去重、过滤无效值并保留默认主题', () => {
    expect(normalizeOwnedThemes(['peach', 'peach', 'missing-theme'])).toEqual([
      'default',
      'peach'
    ]);
    expect(normalizeOwnedThemes()).toEqual(['default']);
  });

  it('每个付费主题都有唯一的虚拟兑换商品', () => {
    const products = getThemeProducts();
    const paidThemeKeys = THEMES
      .filter(theme => theme.key !== DEFAULT_THEME_KEY)
      .map(theme => theme.key)
      .sort();

    expect(products.map(item => item.virtualValue).sort()).toEqual(paidThemeKeys);
    expect(new Set(products.map(item => item._id)).size).toBe(products.length);
    products.forEach(item => {
      expect(item.type).toBe('virtual');
      expect(item.virtualType).toBe('theme');
      expect(item.points).toBeGreaterThan(0);
    });
  });

  it('节日限定主题具备兑换商品、限定标识和完整 Tab 图标', () => {
    const limitedThemes = THEMES.filter(theme => theme.limited);
    const products = getThemeProducts();

    expect(limitedThemes.map(theme => theme.key).sort()).toEqual([
      'birthday',
      'christmas',
      'lunar'
    ]);
    limitedThemes.forEach(theme => {
      const product = products.find(item => item.virtualValue === theme.key);
      expect(theme.badge).toBeTruthy();
      expect(product).toBeTruthy();
      expect(product.limited).toBe(true);
      expect(product.points).toBeGreaterThanOrEqual(1000);
      TAB_BAR_ICON_NAMES.forEach(iconName => {
        expect(existsSync(resolve(
          root,
          `assets/icons/themes/${theme.key}/${iconName}-active.png`
        ))).toBe(true);
      });
    });
  });

  it('只恢复当前登录用户已经拥有的主题', () => {
    global.wx = {
      getStorageSync(key) {
        if (key === 'currentUser') {
          return {
            _id: 'user_1',
            activeTheme: 'peach',
            ownedThemes: ['default', 'peach']
          };
        }
        return '';
      }
    };
    expect(getStoredThemeKey()).toBe('peach');

    global.wx.getStorageSync = key => key === 'currentUser'
      ? { _id: 'user_2', activeTheme: 'peach', ownedThemes: ['default'] }
      : 'peach';
    expect(getStoredThemeKey()).toBe('default');

    global.wx.getStorageSync = () => ({});
    expect(getStoredThemeKey()).toBe('default');
    delete global.wx;
  });

  it('切换主题时同步更新 tabBar 文字和选中图标', () => {
    const tabStyles = [];
    const tabItems = [];
    global.wx = {
      setStorageSync() {},
      setNavigationBarColor() {},
      setBackgroundColor() {},
      setTabBarStyle(options) {
        tabStyles.push(options);
      },
      setTabBarItem(options) {
        tabItems.push(options);
      }
    };

    applyNativeTheme('peach');

    expect(tabStyles.at(-1).selectedColor).toBe(getTheme('peach').primary);
    expect(tabItems).toHaveLength(TAB_BAR_ICON_NAMES.length);
    expect(tabItems.map(item => item.selectedIconPath)).toEqual(
      TAB_BAR_ICON_NAMES.map(name => `assets/icons/themes/peach/${name}-active.png`)
    );
    delete global.wx;
  });

  it('临时预览主题不会覆盖已经保存的主题', () => {
    const writes = [];
    global.wx = {
      setStorageSync(key, value) {
        writes.push([key, value]);
      },
      setNavigationBarColor() {},
      setBackgroundColor() {},
      setTabBarStyle() {},
      setTabBarItem() {}
    };

    applyNativeTheme('forest', { persist: false });
    expect(writes).toEqual([]);
    delete global.wx;
  });

  it('主操作渐变与白字保持清晰对比', () => {
    function luminance(hex) {
      const values = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255);
      const linear = values.map(value => value <= 0.03928
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4);
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    }
    function contrast(first, second) {
      const a = luminance(first);
      const b = luminance(second);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }

    THEMES.forEach(theme => {
      expect(contrast(theme.actionStart, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.actionEnd, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe('主题功能页面接线', () => {
  it('主题中心已注册并从服务页进入', () => {
    const app = JSON.parse(read('app.json'));
    const servicesWxml = read('pages/services/services.wxml');
    const servicesJs = read('pages/services/services.js');

    const servicePackage = app.subPackages.find(item => item.root === 'packages');
    expect(servicePackage.pages).toContain('theme-center/theme-center');
    expect(servicesWxml).toContain('bindtap="goThemeCenter"');
    expect(servicesJs).toContain("'/packages/theme-center/theme-center'");
  });

  it('积分商城写入主题权益和背包记录', () => {
    const mallJs = read('packages/points-mall/points-mall.js');
    expect(mallJs).toContain("virtualType === 'theme'");
    expect(mallJs).toContain('ownedThemes');
    expect(mallJs).toContain('clouddb.redeemItemAtomic');
    expect(mallJs).toContain('var allItems = items || []');
    expect(mallJs).toContain('allItems.filter(function(i) { return i.enabled !== false; })');
    expect(mallJs).toContain('promptUseRedeemedTheme(redeemedThemeKey)');
    expect(mallJs).toContain("confirmText: '立即使用'");
    expect(mallJs).toContain('applyRedeemedTheme(themeKey)');
  });

  it('背包将主题视为已完成的永久虚拟商品', () => {
    const inventoryJs = read('packages/inventory/inventory.js');
    const inventoryWxml = read('packages/inventory/inventory.wxml');
    expect(inventoryJs).toContain("item.status === 'completed'");
    expect(inventoryWxml).toContain('主题已解锁');
    expect(inventoryWxml).toContain("item.virtualType !== 'theme'");
  });

  it('管理员可以维护主题积分和上下架状态，但不能误删主题定义', () => {
    const cloudDbJs = read('utils/clouddb.js');
    const adminJs = read('packages/admin-items/admin-items.js');
    const adminWxml = read('packages/admin-items/admin-items.wxml');

    expect(cloudDbJs).toContain('async function ensureThemeRedeemItems()');
    expect(adminJs).toContain('await clouddb.ensureThemeRedeemItems()');
    expect(adminJs).toContain("form.virtualType === 'theme'");
    expect(adminWxml).toContain('data-key="points"');
    expect(adminWxml).toContain('wx:if="{{!item._isSystemTheme}}"');
  });

  it('核心业务页面都挂载主题上下文', () => {
    [
      'pages/cat-list/cat-list.wxml',
      'pages/cat-detail/cat-detail.wxml',
      'pages/health-records/health-records.wxml',
      'pages/weight-records/weight-records.wxml',
      'pages/reminder-add/reminder-add.wxml',
      'pages/expense/expense.wxml',
      'pages/expense-add/expense-add.wxml',
      'pages/services/services.wxml',
      'pages/mine/mine.wxml'
    ].forEach(path => {
      expect(read(path)).toContain('themeClass');
    });
  });

  it('主题变量覆盖组件颜色并提供主题业务图标', () => {
    const appWxss = read('app.wxss');
    const homeWxss = read('pages/cat-list/cat-list.wxss');
    const homeJs = read('pages/cat-list/cat-list.js');
    expect(appWxss).toContain('--theme-primary');
    expect(appWxss).toContain('--theme-primary-soft');
    expect(appWxss).toContain('--theme-primary-rgb');
    expect(appWxss).toContain('.theme-business-icon');
    expect(homeWxss).toContain('var(--theme-primary-soft');
    expect(homeWxss).toContain('var(--theme-secondary-soft');
    expect(homeWxss).toContain('rgba(var(--theme-secondary-rgb');
    expect(homeJs).toContain('装扮你的专属主题');
    expect(homeJs).toContain('使用积分兑换多套主题');
    expect(homeJs).toContain('/assets/icons/ui/record.png');
    expect(homeJs).not.toContain("iconPath: '/assets/icons/ui/expense.png'");
    expect(read('pages/cat-list/cat-list.wxml')).toContain('theme-business-icon');
    expect(read('pages/health-records/health-records.wxml')).toContain('theme-business-icon');
    expect(read('pages/expense/expense.wxml')).toContain('theme-business-icon');
  });

  it('主题中心支持实时预览、取消和确认后再持久化', () => {
    const centerJs = read('packages/theme-center/theme-center.js');
    const centerWxml = read('packages/theme-center/theme-center.wxml');
    const centerWxss = read('packages/theme-center/theme-center.wxss');

    expect(centerJs).toContain('previewThemeStyle(e)');
    expect(centerJs).toContain('confirmTheme()');
    expect(centerJs).toContain('cancelPreview()');
    expect(centerJs).not.toContain('getApp().previewTheme(key)');
    expect(centerJs).toContain('buildPreviewStyle(preview)');
    expect(centerJs).toContain('restoreDefaultTheme()');
    expect(centerJs).toContain('switchPreviewScene(e)');
    expect(centerWxml).toContain('class="live-preview"');
    expect(centerWxml).toContain('style="{{previewStyle}}"');
    expect(centerWxml).toContain('恢复默认');
    expect(centerWxml).toContain('theme-card-{{item.key}}');
    expect(centerWxml).toContain('seasonal-decor');
    expect(centerWxml).toContain('宠物小管家Plus');
    expect(centerWxml).toContain('健康速记');
    expect(centerWxml).toContain('驱虫提醒');
    expect(centerWxml).toContain('¥ 286.00');
    expect(centerWxml).toContain("previewScene === 'home'");
    expect(centerWxml).toContain("previewScene === 'reminder'");
    expect(centerWxml).toContain('preview-scene-expense');
    expect(centerWxml).toContain('应用这套主题');
    expect(centerWxml).toContain('{{selectedTheme.points}} 积分');
    expect(centerWxml).toContain('theme-limited-badge');
    expect(centerWxss).toContain('display: flex');
    expect(centerWxss).toContain('flex: 0 0 210rpx');
    expect(centerWxss).toContain('min-width: 0');
    expect(centerWxss).toContain('.theme-card-default');
    expect(centerWxss).toContain('.theme-card-christmas');
    expect(centerWxss).toContain('.preview-default { background: #EAF7F5; }');
    expect(centerWxss).not.toContain('.preview-default { background: var(--theme-secondary-soft');
    expect(centerWxss).toContain('.theme-status.active');
    expect(centerWxss).toContain('.theme-status.previewing');
    expect(centerWxss).toContain('.action-active-dot');
    expect(centerWxss).toContain('.decor-lunar');
    expect(centerWxss).toContain('.decor-birthday');
    expect(centerWxss).toContain('.decor-christmas');
    expect(centerWxss).toContain('transition: background .2s ease');
  });

  it('主题保存失败时同时恢复云端、本地缓存和原生主题', () => {
    const centerJs = read('packages/theme-center/theme-center.js');
    const mallJs = read('packages/points-mall/points-mall.js');

    [centerJs, mallJs].forEach(source => {
      expect(source).toContain("wx.setStorageSync('currentUser', oldUser)");
      expect(source).toContain('await clouddb.updateUser(oldUser._id');
      expect(source).toContain('getApp().applyTheme(old');
    });
    expect(centerJs).toContain('保存失败，已恢复原主题');
    expect(mallJs).toContain('启用失败，已恢复原主题');
  });

  it('空状态、Canvas 和主要 Tab 页都使用当前主题', () => {
    const appWxss = read('app.wxss');
    const weightJs = read('pages/weight-records/weight-records.js');
    const detailJs = read('pages/cat-detail/cat-detail.js');

    expect(appWxss).toContain('.empty-state .ui-empty-img');
    expect(weightJs).toContain('getThemeCanvasPalette');
    expect(detailJs).toContain('theme.secondarySoft');
    expect(getThemeCanvasPalette('peach').primary).toBe(getTheme('peach').primary);
    expect(getThemeCanvasPalette('night').areaStrong).toContain('rgba(');
    [
      'pages/cat-list/cat-list.js',
      'pages/reminders/reminders.js',
      'pages/services/services.js',
      'pages/mine/mine.js'
    ].forEach(path => {
      expect(read(path)).toContain('getInitialThemeData');
    });
  });

  it('提醒页和服务页 hero 使用主题色融合背景', () => {
    [
      'pages/reminders/reminders.wxss',
      'pages/services/services.wxss'
    ].forEach(path => {
      const wxss = read(path);
      expect(wxss).toContain('var(--theme-primary-soft');
      expect(wxss).toContain('var(--theme-secondary-soft');
      expect(wxss).toContain('rgba(var(--theme-primary-rgb');
      expect(wxss).not.toContain('linear-gradient(135deg, #FFFFFF, #F2FAFC)');
    });
  });

  it('记账分类在不同主题下保持分类含义但使用不同协调色盘', () => {
    const palettes = THEMES.map(theme => getExpenseCategories(theme.key));
    const base = palettes[0];

    palettes.slice(1).forEach(categories => {
      expect(categories.map(item => item.key)).toEqual(base.map(item => item.key));
      expect(categories.map(item => item.color)).not.toEqual(base.map(item => item.color));
    });
    expect(new Set(base.map(item => item.iconPath)).size).toBe(base.length);
  });

  it('限定主题已接入全局变量和商城预览', () => {
    const appWxss = read('app.wxss');
    const mallWxss = read('packages/points-mall/points-mall.wxss');
    const mallWxml = read('packages/points-mall/points-mall.wxml');

    ['lunar', 'birthday', 'christmas'].forEach(key => {
      expect(appWxss).toContain(`.theme-${key}`);
      expect(mallWxss).toContain(`.preview-${key}`);
    });
    expect(mallWxml).toContain("item.limited ? (item.badge || '限定主题')");
  });

  it('积分商城双列商品保持舒适的纵向间距', () => {
    const mallWxss = read('packages/points-mall/points-mall.wxss');
    expect(mallWxss).toContain('column-gap: 0 !important');
    expect(mallWxss).toContain('row-gap: 36rpx !important');
  expect(mallWxss).not.toMatch(/^\s*gap:\s*0\s*!important/m);
    expect(mallWxss).toContain('padding: 10rpx 24rpx 68rpx');
  });
});
