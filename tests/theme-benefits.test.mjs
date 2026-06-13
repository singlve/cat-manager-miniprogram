import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

describe('configurable benefit center', () => {
  it('seeds the launch benefit and claims every campaign once in a transaction', () => {
    const source = read('cloudfunctions/benefitCenter/index.js');

    expect(source).toContain("_id: 'theme_launch_2026'");
    expect(source).toContain('db.runTransaction');
    expect(source).toContain("const CAMPAIGN_COL = 'benefit_campaigns'");
    expect(source).toContain("const CLAIM_COL = 'benefit_claims'");
    expect(source).toContain('claimId(campaignId, currentUser._id)');
    expect(source).toContain('await ensureLegacyClaim(currentUser)');
    expect(source).toContain('themeVouchers');
    expect(source).toContain('maxThemePoints: 1000');
  });

  it('supports configurable rewards and protected admin operations', () => {
    const source = read('cloudfunctions/benefitCenter/index.js');
    const adminTemplate = read('packages/admin-benefits/admin-benefits.wxml');
    const appConfig = read('app.json');

    expect(source).toContain("'points', 'card', 'theme_voucher', 'theme', 'draw', 'physical'");
    expect(source).toContain("const adminActions = ['adminList', 'adminSave', 'adminToggle', 'adminDelete', 'adminClaims']");
    expect(source).toContain('await isServerAdmin(openid)');
    expect(source).toContain('bonusLotteryDraws');
    expect(source).toContain("source: 'benefit'");
    expect(adminTemplate).toContain('新建福利活动');
    expect(adminTemplate).toContain('领取记录');
    expect(adminTemplate).toContain('每位用户获得数量');
    expect(adminTemplate).toContain('通常填 1');
    expect(adminTemplate).toContain('展示顺序');
    expect(adminTemplate).toContain('按 1、2、3 依次填写即可');
    expect(read('packages/admin-benefits/admin-benefits.js')).toContain('rewardAmount: 1');
    expect(read('packages/admin-benefits/admin-benefits.js')).toContain("'form.rewardAmount': 1");
    expect(appConfig).toContain('admin-benefits/admin-benefits');
  });

  it('allows a claim-backed theme voucher as an atomic redemption payment method', () => {
    const source = read('cloudfunctions/redeemItem/index.js');

    expect(source).toContain("paymentMethod === 'theme_voucher'");
    expect(source).toContain("const BENEFIT_CLAIM_COL = 'benefit_claims'");
    expect(source).toContain('LEGACY_THEME_VOUCHER_MAX_POINTS = 1000');
    expect(source).toContain("claim.status === 'unused' || claim.status === 'partially_used'");
    expect(source).toContain('nextThemeVouchers -= 1');
    expect(source).toContain('themeVouchers: nextThemeVouchers');
    expect(source).toContain("status: usedAmount >= rewardAmount ? 'used' : 'partially_used'");
  });

  it('exposes pending badges, campaign history and voucher-only theme filtering', () => {
    const services = read('pages/services/services.wxml');
    const mall = read('packages/points-mall/points-mall.wxml');
    const mallSource = read('packages/points-mall/points-mall.js');
    const benefitTemplate = read('packages/benefit-center/benefit-center.wxml');

    expect(services).toContain('福利中心');
    expect(services).toContain('{{benefitHint}}');
    expect(mall).toContain('使用主题兑换券');
    expect(mall).toContain('使用积分兑换');
    expect(mall).toContain('主题券可兑');
    expect(mallSource).toContain("if (f === 'voucher')");
    expect(benefitTemplate).toContain('领取记录');
  });

  it('keeps benefit actions centered and gives failed loads a retry path', () => {
    const template = read('packages/benefit-center/benefit-center.wxml');
    const styles = read('packages/benefit-center/benefit-center.wxss');

    expect(template).toContain('福利加载失败');
    expect(template).toContain('bindtap="loadBenefit"');
    expect(template).toContain('item._actionText');
    expect(styles).toMatch(/\.benefit-primary-btn,\s*\n\.benefit-secondary-btn\s*\{[\s\S]*?display:\s*flex/);
    expect(styles).toMatch(/align-items:\s*center/);
    expect(styles).toMatch(/justify-content:\s*center/);
  });

  it('lets benefit rewards grant and consume extra lottery chances', () => {
    const drawSource = read('cloudfunctions/drawLottery/index.js');
    const mineSource = read('pages/mine/mine.js');
    const adminUsers = read('cloudfunctions/adminUsers/index.js');

    expect(drawSource).toContain('const bonusLotteryDraws = Math.max');
    expect(drawSource).toContain('const useBonusDraw = !milestones.length');
    expect(drawSource).toContain('bonusLotteryDraws: nextBonusLotteryDraws');
    expect(mineSource).toContain('currentUser.bonusLotteryDraws');
    expect(adminUsers).toContain("'themeVouchers', 'bonusLotteryDraws'");
  });
});
