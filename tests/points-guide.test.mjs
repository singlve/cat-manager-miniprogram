import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('积分商城引导', () => {
  it('提供积分规则、兑换记录和主题入口', () => {
    const template = fs.readFileSync('packages/points-mall/points-mall.wxml', 'utf8');
    expect(template).toContain('积分规则');
    expect(template).toContain('我的兑换记录');
    expect(template).toContain('使用主题');
  });

  it('兑换记录读取当前用户数据', () => {
    const source = fs.readFileSync('packages/points-mall/points-mall.js', 'utf8');
    expect(source).toContain('clouddb.getRedeemRecords()');
  });
});
