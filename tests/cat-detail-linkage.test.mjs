import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('宠物详情数据联动', () => {
  it('加载宠物提醒并展示下一项照护', () => {
    const source = fs.readFileSync('pages/cat-detail/cat-detail.js', 'utf8');
    const template = fs.readFileSync('pages/cat-detail/cat-detail.wxml', 'utf8');
    expect(source).toContain('clouddb.getReminders({ catId: this.data.catId })');
    expect(source).toContain('nextReminder: activeReminders[0] || null');
    expect(template).toContain('下一项提醒');
  });

  it('体重区域展示与上一条记录的变化', () => {
    const source = fs.readFileSync('pages/cat-detail/cat-detail.js', 'utf8');
    const template = fs.readFileSync('pages/cat-detail/cat-detail.wxml', 'utf8');
    expect(source).toContain('较上次');
    expect(template).toContain('weightTrendText');
  });
});
