import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('theme launch benefit', () => {
  it('claims the launch benefit once inside a server transaction', () => {
    const source = read('cloudfunctions/benefitCenter/index.js');

    expect(source).toContain("id: 'theme_launch_2026'");
    expect(source).toContain('db.runTransaction');
    expect(source).toContain("const CLAIM_COL = 'redeem_requests'");
    expect(source).toContain("kind: 'benefit_claim'");
    expect(source).toContain('claimedBenefits.indexOf(THEME_LAUNCH_BENEFIT.id)');
    expect(source).toContain('themeVouchers');
    expect(source).toContain('maxThemePoints: 1000');
  });

  it('allows a theme voucher as an atomic redemption payment method', () => {
    const source = read('cloudfunctions/redeemItem/index.js');

    expect(source).toContain("paymentMethod === 'theme_voucher'");
    expect(source).toContain('THEME_VOUCHER_MAX_POINTS = 1000');
    expect(source).toContain('nextThemeVouchers -= 1');
    expect(source).toContain('themeVouchers: nextThemeVouchers');
    expect(source).toContain('pointsSpent: unitPoints');
  });

  it('exposes the benefit center and both theme payment choices', () => {
    const appConfig = read('app.json');
    const services = read('pages/services/services.wxml');
    const mall = read('packages/points-mall/points-mall.wxml');

    expect(appConfig).toContain('benefit-center/benefit-center');
    expect(services).toContain('福利中心');
    expect(mall).toContain('使用主题兑换券');
    expect(mall).toContain('使用积分兑换');
  });

  it('keeps benefit actions centered and labels voucher states clearly', () => {
    const template = read('packages/benefit-center/benefit-center.wxml');
    const styles = read('packages/benefit-center/benefit-center.wxss');

    expect(template).toContain('使用主题兑换券');
    expect(template).toContain('兑换券已使用 · 查看主题');
    expect(styles).toMatch(/\.benefit-primary-btn,\s*\n\.benefit-secondary-btn\s*\{[\s\S]*?display:\s*flex/);
    expect(styles).toMatch(/align-items:\s*center/);
    expect(styles).toMatch(/justify-content:\s*center/);
  });
});
