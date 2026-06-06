import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('智能提醒计划页面回归', () => {
  it('页面路由和提醒页入口保持注册', () => {
    const app = JSON.parse(read('app.json'));
    const remindersWxml = read('pages/reminders/reminders.wxml');
    expect(app.pages).toContain('pages/reminder-plan/reminder-plan');
    expect(remindersWxml).toContain('bindtap="goReminderPlan"');
  });

  it('预览保留批量选择和单项调整入口', () => {
    const wxml = read('pages/reminder-plan/reminder-plan.wxml');
    expect(wxml).toContain('bindtap="selectAllPreviewItems"');
    expect(wxml).toContain('bindtap="clearPreviewItems"');
    expect(wxml).toContain('catchtap="openPreviewEditor"');
    expect(wxml).toContain('bindtap="savePreviewEdit"');
  });

  it('已有进行中提醒会被标记为跳过', () => {
    const js = read('pages/reminder-plan/reminder-plan.js');
    expect(js).toContain("reminders.find(reminder => reminder.type === item.type && !reminder.completedAt)");
    expect(js).toContain("status: existing ? 'skip' : 'create'");
  });

  it('生成完成后通知提醒页刷新并回到列表', () => {
    const planJs = read('pages/reminder-plan/reminder-plan.js');
    const remindersJs = read('pages/reminders/reminders.js');
    expect(planJs).toContain("wx.setStorageSync('reminderPlanGenerated'");
    expect(planJs).toContain('wx.navigateBack()');
    expect(remindersJs).toContain("wx.getStorageSync('reminderPlanGenerated')");
    expect(remindersJs).toContain("wx.removeStorageSync('reminderPlanGenerated')");
  });
});
