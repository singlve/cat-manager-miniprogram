import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('提醒类型展示', () => {
  it('修剪指甲使用 claw 类型并配置对应图标', () => {
    const source = fs.readFileSync('pages/reminders/reminders.js', 'utf8');
    expect(source).toContain("claw: { label: '修剪指甲'");
    expect(source).toContain("iconPath: '/assets/icons/ui/claw.png'");
  });

  it('提醒列表统一使用装饰后的类型信息', () => {
    const template = fs.readFileSync('pages/reminders/reminders.wxml', 'utf8');
    expect(template).toContain('src="{{item._typeIconPath}}"');
    expect(template).toContain('{{item._typeLabel}}');
    expect(template).not.toContain("item.type === 'checkup' ? '体检' : '其他'");
  });
});
