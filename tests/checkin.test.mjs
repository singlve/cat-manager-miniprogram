import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCheckInMonth,
  buildCheckInWeek,
  calcCumulativeRewards,
  getLotteryDrawsForStreak,
  recalcAllStreak
} from '../utils/util.js';

describe('签到和奖励规则', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 13, 12, 0, 0)); // 2026-05-13 Wednesday
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('连续签到 7 天时，今天是可抽奖里程碑日', () => {
    const week = buildCheckInWeek('2026-05-13', 7, [], []);
    const today = week.find(day => day.isToday);

    expect(today.dateStr).toBe('2026-05-13');
    expect(today.checked).toBe(true);
    expect(today.isDrawDay).toBe(true);
    expect(today.drawMilestone).toBe(7);
    expect(today.drawUsed).toBe(false);
  });

  it('已抽过的里程碑会标记为 drawUsed', () => {
    const week = buildCheckInWeek('2026-05-13', 7, [], [7]);
    const today = week.find(day => day.isToday);

    expect(today.isDrawDay).toBe(true);
    expect(today.drawUsed).toBe(true);
  });

  it('补签可以补齐断掉的连续天数', () => {
    const streak = recalcAllStreak('2026-05-13', 1, ['2026-05-12', '2026-05-11']);

    expect(streak).toBe(3);
  });

  it('月历中未来日期不可补签，过去未签日期可以补签', () => {
    const weeks = buildCheckInMonth('', 0, [], []);
    const allDays = weeks.flat().filter(day => !day.empty);
    const yesterday = allDays.find(day => day.dateStr === '2026-05-12');
    const tomorrow = allDays.find(day => day.dateStr === '2026-05-14');

    expect(yesterday.isPast).toBe(true);
    expect(yesterday.canMakeUp).toBe(true);
    expect(tomorrow.isFuture).toBe(true);
    expect(tomorrow.canMakeUp).toBe(false);
  });

  it('每连续 7 天获得 1 次抽奖机会', () => {
    expect(getLotteryDrawsForStreak(0)).toBe(0);
    expect(getLotteryDrawsForStreak(6)).toBe(0);
    expect(getLotteryDrawsForStreak(7)).toBe(1);
    expect(getLotteryDrawsForStreak(14)).toBe(2);
    expect(getLotteryDrawsForStreak(29)).toBe(4);
  });

  it('累计签到奖励优先返回第一个未领取的里程碑', () => {
    expect(calcCumulativeRewards(29, [])).toEqual({
      earned: true,
      points: 40,
      milestone: 7,
      label: '7天'
    });

    expect(calcCumulativeRewards(29, [7])).toEqual({
      next: { days: 30, label: '30天', remaining: 1 }
    });

    expect(calcCumulativeRewards(30, [7])).toEqual({
      earned: true,
      points: 100,
      milestone: 30,
      label: '30天'
    });
  });
});
