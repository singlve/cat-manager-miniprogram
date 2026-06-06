import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { REMINDER_PLANS, getPlanById, getTypeMeta } = require('../utils/reminder-plans.js');

describe('智能提醒计划模板', () => {
  it('每个计划都有可生成的提醒项', () => {
    expect(REMINDER_PLANS.length).toBeGreaterThanOrEqual(4);
    REMINDER_PLANS.forEach(plan => {
      expect(plan.id).toBeTruthy();
      expect(plan.name).toBeTruthy();
      expect(plan.items.length).toBeGreaterThan(0);
    });
  });

  it('计划提醒项都能映射到图标和名称', () => {
    const allItems = REMINDER_PLANS.flatMap(plan => plan.items);
    allItems.forEach(item => {
      const meta = getTypeMeta(item.type);
      expect(meta.label).toBeTruthy();
      expect(meta.iconPath).toMatch(/^\/assets\/icons\/ui\//);
      expect(item.intervalDays).toBeGreaterThan(0);
      expect(item.intervalDays).toBeLessThanOrEqual(365);
    });
  });

  it('猫狗成年模板的洗澡周期不同', () => {
    const catPlan = getPlanById('adult_cat_basic');
    const dogPlan = getPlanById('adult_dog_basic');
    expect(catPlan.items.find(item => item.type === 'bath').intervalDays).toBe(60);
    expect(dogPlan.items.find(item => item.type === 'bath').intervalDays).toBe(30);
  });

  it('未知类型回落到其他提醒元信息', () => {
    expect(getTypeMeta('not_exists')).toEqual(getTypeMeta('other'));
  });
});
