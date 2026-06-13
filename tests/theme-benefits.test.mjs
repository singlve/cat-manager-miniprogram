import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const require = createRequire(import.meta.url);
const { normalizeClaimDocument, enrichClaims, getOutstandingThemeVouchers } = require(
  resolve(root, 'cloudfunctions/benefitCenter/claim-utils.js')
);
const {
  parseTime,
  getUserCreatedTime,
  isQuotaExhausted,
  campaignState,
  campaignAdminState,
  isAudienceEligible
} = require(
  resolve(root, 'cloudfunctions/benefitCenter/eligibility-utils.js')
);
const { isDocumentMissing } = require(
  resolve(root, 'cloudfunctions/benefitCenter/error-utils.js')
);

describe('configurable benefit center', () => {
  it('seeds the launch benefit and claims every campaign once in a transaction', () => {
    const source = read('cloudfunctions/benefitCenter/index.js');

    expect(source).toContain("_id: 'theme_launch_2026'");
    expect(source).toContain('runTransactionWithRetry');
    expect(source).toContain('isTransactionBusy');
    expect(source).toContain('const userResult = await userRef.get()');
    expect(source).toContain('const campaignResult = await campaignRef.get()');
    expect(source).not.toContain('Promise.all([userRef.get(), campaignRef.get()])');
    expect(source).toContain('const existingClaim = await getClaim(campaignId, currentUser._id)');
    expect(source).toContain('const recoveredClaim = await getClaim(campaignId, currentUser._id)');
    expect(source).toContain('if (!isDocumentMissing(error)) throw error');
    expect(source).toContain('normalizeClaimDocument');
    expect(source).toContain("where({ 'data.userId': user._id })");
    expect(source).toContain('await repairNestedClaim(document)');
    expect(source).toContain('await claimRef.set(claim)');
    expect(source).not.toContain('await claimRef.set({ data: claim })');
    expect(source).toContain("const CAMPAIGN_COL = 'benefit_campaigns'");
    expect(source).toContain("const CLAIM_COL = 'benefit_claims'");
    expect(source).toContain('claimId(campaignId, currentUser._id)');
    expect(source).toContain('await ensureLegacyClaim(currentUser)');
    expect(source).toContain('themeVouchers');
    expect(source).toContain('maxThemePoints: 1000');
    expect(source).toContain('totalPoints: Math.max(0, parseInt(user.totalPoints');
    expect(source).toContain('makeUpCards: Math.max(0, parseInt(user.makeUpCards');
    expect(source).toContain('bonusLotteryDraws: Math.max(0, parseInt(user.bonusLotteryDraws');
    const benefitPage = read('packages/benefit-center/benefit-center.js');
    expect(benefitPage).toContain('if (status.totalPoints !== undefined)');
    expect(benefitPage).toContain(
      'currentUser.totalPoints = Math.max(0, parseInt(status.totalPoints'
    );
  });

  it('treats a missing first-claim document as an empty claim instead of a failure', () => {
    expect(isDocumentMissing({
      message: 'document.get:fail document with _id benefit_campaign_user does not exist'
    })).toBe(true);
    expect(isDocumentMissing({
      errMsg: 'DATABASE_DOCUMENT_NOT_EXIST'
    })).toBe(true);
    expect(isDocumentMissing({
      message: 'permission denied'
    })).toBe(false);
  });

  it('recovers nested legacy claims and fills their display fields', () => {
    const nested = {
      _id: 'benefit_new_user_u1',
      data: {
        campaignId: 'new_user',
        userId: 'u1',
        status: 'fulfilled',
        claimedAt: '2026-06-13T10:00:00.000Z'
      }
    };
    const normalized = normalizeClaimDocument(nested);
    const [enriched] = enrichClaims([normalized], {
      new_user: {
        title: '新户礼',
        rewardType: 'points',
        rewardAmount: 100
      }
    });

    expect(normalized).toMatchObject({
      _id: 'benefit_new_user_u1',
      campaignId: 'new_user',
      userId: 'u1',
      status: 'fulfilled'
    });
    expect(enriched).toMatchObject({
      campaignTitle: '新户礼',
      rewardType: 'points',
      rewardAmount: 100
    });
  });

  it('derives the usable theme voucher balance from outstanding claims', () => {
    expect(getOutstandingThemeVouchers([
      { rewardType: 'theme_voucher', rewardAmount: 2, usedAmount: 0, status: 'unused' },
      { rewardType: 'theme_voucher', rewardAmount: 3, usedAmount: 1, status: 'partially_used' },
      { rewardType: 'theme_voucher', rewardAmount: 5, usedAmount: 5, status: 'used' },
      { rewardType: 'points', rewardAmount: 100, status: 'fulfilled' }
    ])).toBe(4);
  });

  it('supports configurable rewards and protected admin operations', () => {
    const source = read('cloudfunctions/benefitCenter/index.js');
    const adminTemplate = read('packages/admin-benefits/admin-benefits.wxml');
    const appConfig = read('app.json');

    expect(source).toContain("'points', 'card', 'theme_voucher', 'theme', 'draw', 'physical'");
    expect(source).toContain("'adminList', 'adminPreview', 'adminSave'");
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

  it('enforces the registration cutoff for new-user campaigns', () => {
    const cutoff = '2026-06-13T00:00:00+08:00';
    const campaign = {
      enabled: true,
      audience: 'new',
      newUserSince: cutoff,
      startAt: '',
      endAt: ''
    };
    const now = parseTime('2026-06-14T00:00:00+08:00');

    expect(campaignState(campaign, { createdAt: '2026-06-12T23:59:59+08:00' }, null, now))
      .toBe('ineligible');
    expect(campaignState(campaign, { createdAt: cutoff }, null, now)).toBe('available');
    expect(campaignState(
      Object.assign({}, campaign, { newUserSince: '' }),
      { createdAt: cutoff },
      null,
      now
    )).toBe('ineligible');
    expect(campaignState(campaign, {}, null, now)).toBe('ineligible');
  });

  it('recognizes stored user creation fields and preserves existing claims', () => {
    const createdAt = '2026-06-13T10:00:00+08:00';
    expect(getUserCreatedTime({ createdAt })).toBe(parseTime(createdAt));
    expect(getUserCreatedTime({ _createTime: parseTime(createdAt) })).toBe(parseTime(createdAt));
    expect(getUserCreatedTime({ _createTime: { $date: createdAt } })).toBe(parseTime(createdAt));

    const state = campaignState({
      enabled: true,
      audience: 'new',
      newUserSince: '2026-06-13T00:00:00+08:00',
      startAt: '',
      endAt: ''
    }, {
      createdAt: '2025-01-01T00:00:00+08:00'
    }, {
      status: 'fulfilled'
    }, parseTime('2026-06-14T00:00:00+08:00'));
    expect(state).toBe('claimed');
  });

  it('requires a valid registration cutoff when admins save new-user campaigns', () => {
    const source = read('cloudfunctions/benefitCenter/index.js');
    const adminSource = read('packages/admin-benefits/admin-benefits.js');
    const adminTemplate = read('packages/admin-benefits/admin-benefits.wxml');

    expect(source).toContain("'INVALID_NEW_USER_TIME'");
    expect(adminSource).toContain("updates['form.newUserSince'] = formatLocalIso(now)");
    expect(adminSource).toContain('请填写有效的新用户注册起算时间');
    expect(adminTemplate).toContain('注册时间起算点');
    expect(adminTemplate).toContain('老账号或缺少注册时间的账号不可领取');
  });

  it('uses date and time controls with safe defaults for benefit schedules', () => {
    const source = read('cloudfunctions/benefitCenter/index.js');
    const adminSource = read('packages/admin-benefits/admin-benefits.js');
    const adminTemplate = read('packages/admin-benefits/admin-benefits.wxml');

    expect(source).toContain("newUserSince: audience === 'new' ? String(input.newUserSince || now) : ''");
    expect(source).toContain('startAt: String(input.startAt || now)');
    expect(adminSource).toContain('startAtDate');
    expect(adminSource).toContain('onTimePartChange(e)');
    expect(adminSource).toContain('clearEndTime()');
    expect(adminTemplate).toContain('mode="date"');
    expect(adminTemplate).toContain('mode="time"');
    expect(adminTemplate).toContain('结束时间不选择时，活动长期有效');
  });

  it('enforces total campaign quota without hiding existing claims', () => {
    const campaign = {
      enabled: true,
      audience: 'all',
      startAt: '',
      endAt: '',
      totalQuota: 2,
      claimedCount: 2
    };
    const now = Date.now();

    expect(isQuotaExhausted(campaign)).toBe(true);
    expect(campaignState(campaign, { createdAt: now }, null, now)).toBe('sold_out');
    expect(campaignState(campaign, { createdAt: now }, { status: 'fulfilled' }, now))
      .toBe('claimed');
    expect(campaignAdminState(campaign, now)).toBe('sold_out');
    expect(isQuotaExhausted(Object.assign({}, campaign, { totalQuota: 0 }))).toBe(false);
  });

  it('derives activity states from enablement and schedule boundaries', () => {
    const now = parseTime('2026-06-13T12:00:00+08:00');
    const base = {
      enabled: true,
      audience: 'all',
      totalQuota: 100,
      claimedCount: 1
    };

    expect(campaignAdminState(Object.assign({}, base, {
      startAt: '2026-06-14T00:00:00+08:00',
      endAt: ''
    }), now)).toBe('upcoming');
    expect(campaignAdminState(Object.assign({}, base, {
      startAt: '2026-06-01T00:00:00+08:00',
      endAt: '2026-06-12T23:59:59+08:00'
    }), now)).toBe('expired');
    expect(campaignAdminState(Object.assign({}, base, {
      enabled: false,
      startAt: '',
      endAt: ''
    }), now)).toBe('disabled');
    expect(campaignAdminState(Object.assign({}, base, {
      startAt: '2026-06-01T00:00:00+08:00',
      endAt: '2026-06-20T00:00:00+08:00'
    }), now)).toBe('active');
  });

  it('previews new-user audiences using the same eligibility rule as claiming', () => {
    const campaign = {
      audience: 'new',
      newUserSince: '2026-06-13T00:00:00+08:00'
    };
    expect(isAudienceEligible(campaign, {
      createdAt: '2026-06-13T00:00:00+08:00'
    })).toBe(true);
    expect(isAudienceEligible(campaign, {
      createdAt: '2026-06-12T23:59:59+08:00'
    })).toBe(false);
    expect(isAudienceEligible(campaign, {})).toBe(false);
    expect(isAudienceEligible({ audience: 'all' }, {})).toBe(true);
  });

  it('keeps quota updates atomic and exposes admin operations for previews', () => {
    const source = read('cloudfunctions/benefitCenter/index.js');
    const rulesSource = read('cloudfunctions/benefitCenter/eligibility-utils.js');
    const adminSource = read('packages/admin-benefits/admin-benefits.js');
    const adminTemplate = read('packages/admin-benefits/admin-benefits.wxml');

    expect(rulesSource).toContain("state = 'sold_out'");
    expect(source).toContain("sold_out: '福利已经领完啦'");
    expect(source).toContain('await campaignRef.update');
    expect(source).toContain('claimedCount: Math.max');
    expect(source).toContain('async function getAdminOverview()');
    expect(source).toContain('async function previewAudience(campaign)');
    expect(adminSource).toContain('copyCampaign(e)');
    expect(adminSource).toContain('applyClaimFilters()');
    expect(adminTemplate).toContain('预计适用用户');
    expect(adminTemplate).toContain('总发放份数');
    expect(adminTemplate).toContain('复制');
    expect(adminTemplate).toContain('claimStatusFilters');
  });

  it('writes benefit transaction fields directly and repairs missing voucher balances', () => {
    const source = read('cloudfunctions/benefitCenter/index.js');

    expect(source).toContain('await userRef.update(updates)');
    expect(source).not.toContain('await userRef.update({ data: updates })');
    expect(source).toContain('const trackedVoucherCount = getOutstandingThemeVouchers');
    expect(source).toContain('if (themeVouchers < trackedVoucherCount)');
    expect(source).toContain('result.updates || {}');
    expect(source).toMatch(/await campaignRef\.update\(\{\s*claimedCount:/);
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
    expect(source).toMatch(/doc\(voucherClaim\._id\)\.update\(\{\s*usedAmount,/);
    expect(source).not.toContain("doc(voucherClaim._id).update({\n          data:");
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
    expect(benefitTemplate).toContain('bindtap="goThemeMall"');
    expect(benefitTemplate).toContain('使用主题兑换券');
    expect(benefitTemplate).toContain('查看可兑换主题');
    expect(benefitTemplate).not.toContain('wx:if="{{themeVouchers > 0}}" class="voucher-redeem-entry"');
  });

  it('keeps benefit actions centered and gives failed loads a retry path', () => {
    const template = read('packages/benefit-center/benefit-center.wxml');
    const styles = read('packages/benefit-center/benefit-center.wxss');
    const source = read('packages/benefit-center/benefit-center.js');

    expect(template).toContain('福利加载失败');
    expect(template).toContain('bindtap="loadBenefit"');
    expect(template).toContain('item.state === \'claimed\'');
    expect(template).toContain('class="benefit-disabled-btn">已领取');
    expect(source).toContain('const claimed = (status.claims || []).some');
    expect(source).toContain('canClaim: false');
    expect(source).toContain("state: claim.status === 'used' ? 'used' : 'claimed'");
    expect(styles).toMatch(/\.benefit-primary-btn\s*\{[\s\S]*?display:\s*flex/);
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
