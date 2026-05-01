import { describe, it, expect } from 'vitest';

// ============================================================
// 校验逻辑：猫咪保存时的日期约束链
// 规则：生日 ≤ 领养日期 ≤ 去喵星日期
// ============================================================

/**
 * 校验：领养日期不能早于出生日期（cat-add.js / cat-edit.js saveCat）
 */
function validateAdoptionNotBeforeBirthday(birthday, adoptedDate) {
  if (birthday && adoptedDate && adoptedDate < birthday) {
    return { valid: false, msg: '领养日期不能早于出生日期' };
  }
  return { valid: true };
}

/**
 * 校验：去喵星日期不能早于出生日期
 */
function validatePassedNotBeforeBirthday(birthday, passedDate, status) {
  if (status === 'passed_away' && passedDate && birthday && passedDate < birthday) {
    return { valid: false, msg: '去喵星日期不能早于出生日期' };
  }
  return { valid: true };
}

/**
 * 校验：领养日期不能晚于去喵星日期
 */
function validateAdoptionNotAfterPassed(adoptedDate, passedDate, status) {
  if (status === 'passed_away' && passedDate && adoptedDate && adoptedDate > passedDate) {
    return { valid: false, msg: '领养日期不能晚于去喵星日期' };
  }
  return { valid: true };
}

describe('领养 ≥ 出生', () => {
  it('领养晚于出生 → 通过', () => {
    expect(validateAdoptionNotBeforeBirthday('2023-03-15', '2024-01-01')).toEqual({ valid: true });
  });
  it('同日 → 通过', () => {
    expect(validateAdoptionNotBeforeBirthday('2023-03-15', '2023-03-15')).toEqual({ valid: true });
  });
  it('领养早于出生 → 拦截', () => {
    const r = validateAdoptionNotBeforeBirthday('2023-03-15', '2022-01-01');
    expect(r.valid).toBe(false);
    expect(r.msg).toContain('不能早于出生日期');
  });
  it('缺少领养日期 → 通过', () => {
    expect(validateAdoptionNotBeforeBirthday('2023-03-15', null)).toEqual({ valid: true });
    expect(validateAdoptionNotBeforeBirthday('2023-03-15', '')).toEqual({ valid: true });
  });
  it('缺少出生日期 → 通过', () => {
    expect(validateAdoptionNotBeforeBirthday(null, '2024-01-01')).toEqual({ valid: true });
  });
});

describe('去喵星 ≥ 出生', () => {
  it('正常 → 通过', () => {
    expect(validatePassedNotBeforeBirthday('2023-03-15', '2025-01-01', 'passed_away')).toEqual({ valid: true });
  });
  it('同日 → 通过', () => {
    expect(validatePassedNotBeforeBirthday('2023-03-15', '2023-03-15', 'passed_away')).toEqual({ valid: true });
  });
  it('去喵星早于出生 → 拦截', () => {
    const r = validatePassedNotBeforeBirthday('2023-03-15', '2022-01-01', 'passed_away');
    expect(r.valid).toBe(false);
    expect(r.msg).toContain('不能早于出生日期');
  });
  it('在身边的猫不检查', () => {
    expect(validatePassedNotBeforeBirthday('2023-03-15', '2022-01-01', 'with_me')).toEqual({ valid: true });
  });
  it('缺少去喵星日期 → 通过', () => {
    expect(validatePassedNotBeforeBirthday('2023-03-15', null, 'passed_away')).toEqual({ valid: true });
  });
});

describe('领养 ≤ 去喵星', () => {
  it('正常 → 通过', () => {
    expect(validateAdoptionNotAfterPassed('2023-06-01', '2025-01-01', 'passed_away')).toEqual({ valid: true });
  });
  it('同日 → 通过', () => {
    expect(validateAdoptionNotAfterPassed('2023-01-01', '2023-01-01', 'passed_away')).toEqual({ valid: true });
  });
  it('领养晚于去喵星 → 拦截', () => {
    const r = validateAdoptionNotAfterPassed('2025-01-01', '2023-01-01', 'passed_away');
    expect(r.valid).toBe(false);
    expect(r.msg).toContain('不能晚于去喵星日期');
  });
  it('在身边的猫不检查', () => {
    expect(validateAdoptionNotAfterPassed('2025-01-01', '2023-01-01', 'with_me')).toEqual({ valid: true });
  });
  it('缺少领养日期 → 通过', () => {
    expect(validateAdoptionNotAfterPassed(null, '2025-01-01', 'passed_away')).toEqual({ valid: true });
  });
});

// ============================================================
// 手机号格式校验（login.js）
// ============================================================
function validatePhoneNumber(phone) {
  if (!phone) return { valid: false, msg: '请输入手机号' };
  if (!/^1[3-9]\d{9}$/.test(phone)) return { valid: false, msg: '手机号格式不正确' };
  return { valid: true };
}

describe('手机号验证', () => {
  it('正确格式通过', () => {
    expect(validatePhoneNumber('13800138000')).toEqual({ valid: true });
    expect(validatePhoneNumber('19912345678')).toEqual({ valid: true });
  });
  it('非1开头拦截', () => {
    expect(validatePhoneNumber('23800138000').valid).toBe(false);
  });
  it('1[0-2]开头拦截', () => {
    expect(validatePhoneNumber('10800138000').valid).toBe(false);
    expect(validatePhoneNumber('12800138000').valid).toBe(false);
  });
  it('位数不对拦截', () => {
    expect(validatePhoneNumber('1380013800').valid).toBe(false);
    expect(validatePhoneNumber('138001380001').valid).toBe(false);
  });
  it('包含非数字拦截', () => {
    expect(validatePhoneNumber('1380013800a').valid).toBe(false);
  });
  it('空值拦截', () => {
    expect(validatePhoneNumber('').valid).toBe(false);
    expect(validatePhoneNumber(null).valid).toBe(false);
  });
});

// ============================================================
// 体重校验（0-30kg）
// ============================================================
function validateWeight(w) {
  const n = parseFloat(w);
  if (isNaN(n) || n <= 0) return { valid: false, msg: '请输入有效体重' };
  if (n > 30) return { valid: false, msg: '体重不能超过30kg' };
  return { valid: true };
}

describe('体重校验', () => {
  it('正常体重通过', () => {
    expect(validateWeight('4.5')).toEqual({ valid: true });
    expect(validateWeight('0.1')).toEqual({ valid: true });
    expect(validateWeight('30')).toEqual({ valid: true });
  });
  it('超重拦截', () => {
    expect(validateWeight('30.1').valid).toBe(false);
    expect(validateWeight('100').valid).toBe(false);
  });
  it('非数字拦截', () => {
    expect(validateWeight('abc').valid).toBe(false);
    expect(validateWeight('').valid).toBe(false);
  });
  it('负数拦截', () => {
    expect(validateWeight('-1').valid).toBe(false);
    expect(validateWeight('0').valid).toBe(false);
  });
});

// ============================================================
// _openid 过滤（clouddb.js）
// ============================================================
function filterOpenId(data) {
  if (!data) return data;
  const { _openid, ...rest } = data;
  return rest;
}

describe('_openid 过滤', () => {
  it('过滤 _openid', () => {
    expect(filterOpenId({ name: 'test', _openid: 'xxx' })).toEqual({ name: 'test' });
  });
  it('没有 _openid 不变', () => {
    expect(filterOpenId({ name: 'test' })).toEqual({ name: 'test' });
  });
  it('null/undefined 原样返回', () => {
    expect(filterOpenId(null)).toBeNull();
    expect(filterOpenId(undefined)).toBeUndefined();
  });
});
