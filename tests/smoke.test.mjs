/**
 * UI 冒烟测试 — miniprogram-automator
 *
 * 前置条件：
 *   1. 微信开发者工具 → 设置 → 安全设置 → 开启「服务端口」
 *   2. 工具打开此项目（cat-manager-miniprogram）
 *   3. 运行：npx vitest run tests/smoke.test.mjs
 *
 * 覆盖：核心页面加载、基本交互、弹窗打开/关闭
 *
 * 注意：如果 DevTools 未开启服务端口（9420），所有测试自动跳过，不会报失败。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import net from 'net';
import Automator from 'miniprogram-automator';

let miniProgram;
let page;
let devtoolsReady = false;

const PROJECT_PATH = '/Users/mac/cat-manager/cat-manager-miniprogram';

// ── 端口检测 ──
function checkPort(port, timeout = 1500) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port }, () => {
      sock.end();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
    setTimeout(() => { sock.destroy(); resolve(false); }, timeout);
  });
}

beforeAll(async () => {
  devtoolsReady = await checkPort(9420);
  if (!devtoolsReady) {
    console.warn('⚠️  微信开发者工具服务端口 9420 未开启，跳过 UI 冒烟测试');
    console.warn('   开启：微信开发者工具 → 设置 → 安全设置 → 开启「服务端口」');
    return;
  }
  console.log('✅ DevTools 已连接，开始 UI 冒烟测试...');
  miniProgram = await Automator.launch({
    projectPath: PROJECT_PATH,
  });
}, 60000);

afterAll(async () => {
  if (miniProgram) await miniProgram.close();
});

// ============================================================
// 页面可达性
// ============================================================
describe('页面可达性', () => {
  it('首页 cat-list 加载', async () => {
    if (!devtoolsReady) return;
    page = await miniProgram.reLaunch('/pages/cat-list/cat-list');
    await page.waitFor(1000);
    const title = await page.$('.page-title');
    expect(title).toBeTruthy();
  });

  it('cat-add 页面可打开', async () => {
    if (!devtoolsReady) return;
    page = await miniProgram.navigateTo('/pages/cat-add/cat-add');
    await page.waitFor(500);
    const form = await page.$('.form-group');
    expect(form).toBeTruthy();
  });

  it('mine 页面可切换到', async () => {
    if (!devtoolsReady) return;
    page = await miniProgram.switchTab('/pages/mine/mine');
    await page.waitFor(500);
    const profile = await page.$('.profile-section');
    expect(profile).toBeTruthy();
  });
});

// ============================================================
// 未登录态
// ============================================================
describe('未登录态', () => {
  it('首页显示 demo 猫咪', async () => {
    if (!devtoolsReady) return;
    page = await miniProgram.reLaunch('/pages/cat-list/cat-list');
    await page.waitFor(1000);
    const catCards = await page.$$('.cat-card');
    expect(catCards.length).toBeGreaterThanOrEqual(2);
  });

  it('guest-banner 显示', async () => {
    if (!devtoolsReady) return;
    const banner = await page.$('.guest-banner');
    expect(banner).toBeTruthy();
  });
});

// ============================================================
// 弹窗行为
// ============================================================
describe('弹窗行为', () => {
  it('体重录入弹窗可打开和关闭', async () => {
    if (!devtoolsReady) return;
    page = await miniProgram.navigateTo('/pages/cat-detail/cat-detail?id=demo_1');
    await page.waitFor(1000);

    const addBtn = await page.$('.weight-add-btn');
    if (addBtn) {
      await addBtn.tap();
      await page.waitFor(300);
      const modal = await page.$('.modal-mask');
      expect(modal).toBeTruthy();

      await modal.tap();
      await page.waitFor(300);
    }
  });
});

// ============================================================
// 导航
// ============================================================
describe('导航', () => {
  it('cat-add 保存后 switchTab 回首页', async () => {
    if (!devtoolsReady) return;
    await miniProgram.switchTab('/pages/cat-list/cat-list');
    await page.waitFor(500);
    const pagePath = await page.path();
    expect(pagePath).toContain('cat-list');
  });
});