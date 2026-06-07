import { describe, expect, it } from 'vitest';
import summaryModule from '../cloudfunctions/checkReminders/summary.js';

const { buildReminderSummary, groupRemindersByOpenid } = summaryModule;

describe('微信提醒摘要', () => {
  const today = new Date(2026, 5, 7);

  it('单条提醒保留宠物和事项信息', () => {
    const result = buildReminderSummary([{
      reminder: { _id: 'r1', _openid: 'u1', catId: 'c1' },
      catName: '乔巴',
      typeLabel: '驱虫',
      nextDate: new Date(2026, 5, 7)
    }], today);
    expect(result.count).toBe(1);
    expect(result.thing1).toBe('乔巴 - 驱虫');
    expect(result.thing26).toContain('就在今天');
  });

  it('同一用户多条提醒合并，并使用最早到期项', () => {
    const result = buildReminderSummary([
      {
        reminder: { _id: 'r2', _openid: 'u1', catId: 'c2' },
        catName: '路飞',
        typeLabel: '洗澡',
        nextDate: new Date(2026, 5, 7)
      },
      {
        reminder: { _id: 'r1', _openid: 'u1', catId: 'c1' },
        catName: '乔巴',
        typeLabel: '驱虫',
        nextDate: new Date(2026, 5, 5)
      }
    ], today);
    expect(result.count).toBe(2);
    expect(result.first.reminder._id).toBe('r1');
    expect(result.thing1).toContain('2 项照护');
    expect(result.thing26).toContain('最早逾期2天');
    expect(result.thing1.length).toBeLessThanOrEqual(20);
    expect(result.thing26.length).toBeLessThanOrEqual(20);
  });

  it('按用户 openid 分组', () => {
    const groups = groupRemindersByOpenid([
      { reminder: { _id: 'r1', _openid: 'u1' } },
      { reminder: { _id: 'r2', _openid: 'u1' } },
      { reminder: { _id: 'r3', _openid: 'u2' } }
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find(group => group.openid === 'u1').reminders).toHaveLength(2);
  });
});
