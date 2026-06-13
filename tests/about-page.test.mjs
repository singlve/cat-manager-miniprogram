import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('关于小程序页面', () => {
  it('只介绍普通用户可使用的主要功能', () => {
    const wxml = read('packages/about/about.wxml');
    [
      '宠物档案',
      '健康记录',
      '体重趋势',
      '智能提醒',
      '宠物记账',
      '积分与背包',
      '主题与福利',
      '分享与备份'
    ].forEach(text => expect(wxml).toContain(text));

    expect(wxml).not.toContain('管理员');
    expect(wxml).not.toContain('留言板');
  });
});
