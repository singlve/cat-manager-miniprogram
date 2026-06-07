import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('编辑提醒时锁定所属宠物', () => {
  it('编辑界面显示只读宠物归属且不打开选择弹层', () => {
    const template = read('pages/reminder-add/reminder-add.wxml');
    const source = read('pages/reminder-add/reminder-add.js');

    expect(template).toContain('cat-picker-readonly');
    expect(template).toContain('不可修改');
    expect(template).toContain('showCatPickerModal && !isEdit');
    expect(source).toMatch(/openCatPickerModal\(\)\s*\{\s*if \(this\.data\.isEdit\) return;/);
    expect(source).toMatch(/selectCatFromModal\(e\)\s*\{\s*if \(this\.data\.isEdit\) return;/);
  });

  it('编辑保存只更新提醒内容，不提交宠物字段', () => {
    const source = read('pages/reminder-add/reminder-add.js');

    expect(source).toContain(
      "await clouddb.updateReminder(reminderId, { type, lastDate, intervalDays, note });"
    );
  });
});
