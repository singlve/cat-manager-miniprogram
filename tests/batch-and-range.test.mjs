import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('批量管理与时间筛选', () => {
  it('提醒页支持批量完成和删除', () => {
    const source = fs.readFileSync('pages/reminders/reminders.js', 'utf8');
    const template = fs.readFileSync('pages/reminders/reminders.wxml', 'utf8');
    expect(source).toContain('batchCompleteReminders');
    expect(source).toContain('batchDeleteReminders');
    expect(template).toContain('批量管理');
  });

  it('健康记录支持常用时间范围', () => {
    const source = fs.readFileSync('pet-package/health-records/health-records.js', 'utf8');
    expect(source).toContain("label: '近30天'");
    expect(source).toContain("label: '近90天'");
    expect(source).toContain("label: '本年度'");
  });
});
