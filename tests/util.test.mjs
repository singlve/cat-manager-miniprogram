import { describe, it, expect } from 'vitest';

import {
  formatDate, calcNextDate, isDue, getOverdueDays, TYPE_LABELS,
  calcAgeDetail, calcDaysBetween, formatBirthdayRow,
  datePart, calcAgo, nowTimeStr, datetime
} from '../utils/util.js';

// ============================================================
// formatDate
// ============================================================
describe('formatDate', () => {
  it('格式化 Date 对象为 YYYY-MM-DD', () => {
    expect(formatDate(new Date(2026, 3, 15))).toBe('2026-04-15');
  });

  it('格式化 Date 为带前导零', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatDate(new Date(2026, 10, 9))).toBe('2026-11-09');
  });

  it('null/undefined 返回空字符串', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });
});

// ============================================================
// calcNextDate
// ============================================================
describe('calcNextDate', () => {
  it('计算下次日期', () => {
    expect(calcNextDate('2026-04-01', 7)).toBe('2026-04-08');
  });

  it('跨月计算', () => {
    expect(calcNextDate('2026-01-28', 7)).toBe('2026-02-04');
  });

  it('跨年计算', () => {
    expect(calcNextDate('2025-12-30', 5)).toBe('2026-01-04');
  });

  it('缺少参数返回空', () => {
    expect(calcNextDate(null, 7)).toBe('');
    expect(calcNextDate('2026-04-01', 0)).toBe('');
    expect(calcNextDate('', 7)).toBe('');
  });
});

// ============================================================
// isDue
// ============================================================
describe('isDue', () => {
  it('过去的日期已到期', () => {
    expect(isDue('2020-01-01', 30)).toBe(true);
  });

  it('未来的日期未到期', () => {
    expect(isDue('2099-12-31', 30)).toBe(false);
  });

  it('缺少参数返回 false', () => {
    expect(isDue(null, 30)).toBe(false);
    expect(isDue('2026-04-01', 0)).toBe(false);
  });
});

// ============================================================
// getOverdueDays
// ============================================================
describe('getOverdueDays', () => {
  it('已过期的返回 > 0', () => {
    // 2020-01-01 + 30天 = 2020-01-31，早已过期
    const days = getOverdueDays('2020-01-01', 30);
    expect(days).toBeGreaterThan(1000);
  });

  it('未过期返回 0', () => {
    expect(getOverdueDays('2099-12-31', 30)).toBe(0);
  });

  it('缺少参数返回 0', () => {
    expect(getOverdueDays(null, 30)).toBe(0);
    expect(getOverdueDays('2026-04-01', 0)).toBe(0);
  });
});

// ============================================================
// TYPE_LABELS
// ============================================================
describe('TYPE_LABELS', () => {
  it('包含所有记录类型', () => {
    expect(TYPE_LABELS).toHaveProperty('bath', '洗澡');
    expect(TYPE_LABELS).toHaveProperty('deworm', '驱虫');
    expect(TYPE_LABELS).toHaveProperty('vaccine', '免疫');
    expect(TYPE_LABELS).toHaveProperty('checkup', '体检');
    expect(TYPE_LABELS).toHaveProperty('claw', '修剪指甲');
    expect(TYPE_LABELS).toHaveProperty('other', '其他');
  });
});

// ============================================================
// calcAgeDetail
// ============================================================
describe('calcAgeDetail', () => {
  it('计算正常年龄', () => {
    // 2023-03-15 → 2026-03-15 = 3年0月0天
    const r = calcAgeDetail('2023-03-15', '2026-03-15');
    expect(r).toEqual({ years: 3, months: 0, days: 0 });
  });

  it('带月和天的年龄', () => {
    // 2023-03-15 → 2026-05-01
    const r = calcAgeDetail('2023-03-15', '2026-05-01');
    expect(r.years).toBe(3);
    expect(r.months).toBe(1);
    // days: May 1 - Mar 15 across months
  });

  it('用 endDate 冻结年龄', () => {
    // 出生 2023-03-15，去喵星 2026-01-15 = 2岁10月0天
    const r = calcAgeDetail('2023-03-15', '2026-01-15');
    expect(r.years).toBe(2);
    expect(r.months).toBe(10);
    expect(r.days).toBe(0);
  });

  it('同日返回 null（还没有一天大）', () => {
    expect(calcAgeDetail('2026-05-01', '2026-05-01')).toBeNull();
  });

  it('出生晚于截止返回 null', () => {
    expect(calcAgeDetail('2026-05-01', '2026-01-01')).toBeNull();
  });

  it('缺少 birthday 返回 null', () => {
    expect(calcAgeDetail(null)).toBeNull();
    expect(calcAgeDetail('')).toBeNull();
  });

  it('只有出生日期时用今天计算', () => {
    const r = calcAgeDetail('2020-05-01');
    expect(r).not.toBeNull();
    expect(r.years).toBeGreaterThanOrEqual(5);
  });
});

// ============================================================
// calcDaysBetween
// ============================================================
describe('calcDaysBetween', () => {
  it('同一天返回 0', () => {
    expect(calcDaysBetween('2026-05-01', '2026-05-01')).toBe(0);
  });

  it('一天差距', () => {
    expect(calcDaysBetween('2026-05-01', '2026-05-02')).toBe(1);
  });

  it('一个月差距', () => {
    expect(calcDaysBetween('2026-01-01', '2026-02-01')).toBe(31);
  });

  it('start > end 返回 null', () => {
    expect(calcDaysBetween('2026-05-02', '2026-05-01')).toBeNull();
  });

  it('缺少 start 返回 null', () => {
    expect(calcDaysBetween(null)).toBeNull();
    expect(calcDaysBetween('')).toBeNull();
  });

  it('只有 start 时用今天计算', () => {
    // 今天肯定 >= start（如果是过去的日期）
    const days = calcDaysBetween('2020-01-01');
    expect(days).toBeGreaterThan(0);
  });

  it('去喵星同天返回 0 天', () => {
    // 修复：diff >= 0 而非 diff > 0
    expect(calcDaysBetween('2026-05-01', '2026-05-01')).toBe(0);
  });
});

// ============================================================
// formatBirthdayRow
// ============================================================
describe('formatBirthdayRow', () => {
  it('正常生日格式化', () => {
    const r = formatBirthdayRow('2023-03-15');
    expect(r.text).toBe('🎂 2023-03-15');
    expect(typeof r.hint).toBe('string');
  });

  it('去喵星猫咪不显示生日提醒', () => {
    const r = formatBirthdayRow('2023-03-15', true);
    expect(r.text).toBe('🎂 2023-03-15');
    expect(r.hint).toBe('');
  });

  it('缺少 birthday 返回未知', () => {
    expect(formatBirthdayRow(null)).toEqual({ text: '🎂 未知', hint: '' });
    expect(formatBirthdayRow('')).toEqual({ text: '🎂 未知', hint: '' });
  });

  it('格式不完整', () => {
    const r = formatBirthdayRow('2023-03');
    expect(r.text).toBe('🎂 2023-03');
    expect(r.hint).toBe('');
  });
});

// ============================================================
// datePart
// ============================================================
describe('datePart', () => {
  it('提取日期部分', () => {
    expect(datePart('2026-05-01 14:30:00')).toBe('2026-05-01');
  });

  it('纯日期不变', () => {
    expect(datePart('2026-05-01')).toBe('2026-05-01');
  });

  it('null/undefined 返回空', () => {
    expect(datePart(null)).toBe('');
    expect(datePart(undefined)).toBe('');
  });

  it('截断过长字符串', () => {
    expect(datePart('2026-05-01T14:30:00Z')).toBe('2026-05-01');
  });
});

// ============================================================
// calcAgo
// ============================================================
describe('calcAgo', () => {
  it('今天', () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    expect(calcAgo(todayStr)).toBe('今天');
  });

  it('昨天', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
    expect(calcAgo(yStr)).toBe('昨天');
  });

  it('N天前', () => {
    expect(calcAgo('2026-04-28')).toMatch(/^\d+天前$/);
  });

  it('N个月前', () => {
    expect(calcAgo('2026-01-01')).toMatch(/^\d+个月前$/);
  });

  it('N年前', () => {
    expect(calcAgo('2020-01-01')).toMatch(/^\d+年前$/);
  });

  it('空输入', () => {
    expect(calcAgo(null)).toBe('');
    expect(calcAgo('')).toBe('');
    expect(calcAgo(undefined)).toBe('');
  });
});

// ============================================================
// nowTimeStr
// ============================================================
describe('nowTimeStr', () => {
  it('返回 HH:mm 格式', () => {
    const t = nowTimeStr();
    expect(t).toMatch(/^\d{2}:\d{2}$/);
  });

  it('小时在 0-23 范围', () => {
    const t = nowTimeStr();
    const h = parseInt(t.split(':')[0]);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(23);
  });

  it('分钟在 0-59 范围', () => {
    const t = nowTimeStr();
    const m = parseInt(t.split(':')[1]);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThanOrEqual(59);
  });
});

// ============================================================
// datetime
// ============================================================
describe('datetime', () => {
  it('拼接日期和时间', () => {
    expect(datetime('2026-05-01', '14:30')).toBe('2026-05-01 14:30:00');
  });

  it('缺少时间默认 00:00', () => {
    expect(datetime('2026-05-01')).toBe('2026-05-01 00:00:00');
  });

  it('空日期也能处理', () => {
    expect(datetime('', '14:30')).toBe(' 14:30:00');
  });
});
