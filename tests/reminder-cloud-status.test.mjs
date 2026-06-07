import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('提醒云函数发送结果', () => {
  it('成功和失败都会写回提醒记录', () => {
    const source = fs.readFileSync('cloudfunctions/checkReminders/index.js', 'utf8');
    expect(source).toContain("lastNotifyStatus: 'success'");
    expect(source).toContain("lastNotifyStatus: 'failed'");
    expect(source).toContain('lastNotifyAttemptAt');
    expect(source).toContain('lastNotifyError');
  });
});
