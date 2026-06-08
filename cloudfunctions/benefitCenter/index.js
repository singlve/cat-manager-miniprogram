const cloud = require('wx-server-sdk');
const cloudbase = require('@cloudbase/node-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const app = cloudbase.init({
  env: cloudbase.SYMBOL_DEFAULT_ENV
});
const db = app.database();

const USER_COL = 'users';
const CLAIM_COL = 'redeem_requests';
const THEME_LAUNCH_BENEFIT = {
  id: 'theme_launch_2026',
  title: '主题上线礼',
  desc: '领取 1 张主题兑换券，可任选一套价格不超过 1000 积分的主题永久解锁。',
  rewardType: 'theme_voucher',
  rewardAmount: 1,
  maxThemePoints: 1000,
  active: true
};

function normalizeClaimedBenefits(value) {
  return Array.from(new Set((Array.isArray(value) ? value : []).filter(Boolean)));
}

function buildClaimId(userId) {
  return 'benefit_' + THEME_LAUNCH_BENEFIT.id + '_' + userId;
}

async function getCurrentUser(openid) {
  const result = await db.collection(USER_COL).where({ _openid: openid }).limit(1).get();
  return result && result.data && result.data[0] ? result.data[0] : null;
}

async function hasClaimRecord(userId) {
  try {
    const result = await db.collection(CLAIM_COL).doc(buildClaimId(userId)).get();
    return !!(result && result.data);
  } catch (error) {
    return false;
  }
}

function buildStatus(user, claimedByRecord) {
  const claimedBenefits = normalizeClaimedBenefits(user && user.claimedBenefits);
  const claimed = !!claimedByRecord ||
    claimedBenefits.indexOf(THEME_LAUNCH_BENEFIT.id) !== -1;
  return {
    campaign: THEME_LAUNCH_BENEFIT,
    claimed,
    canClaim: THEME_LAUNCH_BENEFIT.active && !claimed,
    themeVouchers: Math.max(0, parseInt(user && user.themeVouchers, 10) || 0)
  };
}

exports.main = async event => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = String(event && event.action || 'status');

  if (!openid) return { code: 'NOT_LOGGED_IN', msg: '请先登录' };

  try {
    const currentUser = await getCurrentUser(openid);
    if (!currentUser) return { code: 'USER_NOT_FOUND', msg: '用户信息不存在' };

    if (action === 'status') {
      return {
        code: 0,
        data: buildStatus(currentUser, await hasClaimRecord(currentUser._id))
      };
    }

    if (action !== 'claim') {
      return { code: 'INVALID_ACTION', msg: '不支持的操作' };
    }

    if (!THEME_LAUNCH_BENEFIT.active) {
      return { code: 'BENEFIT_INACTIVE', msg: '福利活动暂未开放' };
    }

    const transactionResult = await db.runTransaction(async transaction => {
      const userRef = transaction.collection(USER_COL).doc(currentUser._id);
      const claimRef = transaction.collection(CLAIM_COL).doc(buildClaimId(currentUser._id));
      const userResult = await userRef.get();
      const user = userResult && userResult.data;
      if (!user || user._openid !== openid) {
        throw Object.assign(new Error('用户信息不存在或无权操作'), { businessCode: 'USER_NOT_FOUND' });
      }

      const claimedBenefits = normalizeClaimedBenefits(user.claimedBenefits);
      const existingVouchers = Math.max(0, parseInt(user.themeVouchers, 10) || 0);
      let oldClaim = null;
      try { oldClaim = await claimRef.get(); } catch (error) { oldClaim = null; }
      if ((oldClaim && oldClaim.data) ||
          claimedBenefits.indexOf(THEME_LAUNCH_BENEFIT.id) !== -1) {
        return {
          alreadyClaimed: true,
          themeVouchers: existingVouchers,
          claimedBenefits
        };
      }

      const themeVouchers = existingVouchers + THEME_LAUNCH_BENEFIT.rewardAmount;
      const nextClaimedBenefits = claimedBenefits.concat(THEME_LAUNCH_BENEFIT.id);
      await userRef.update({
        data: {
          themeVouchers,
          claimedBenefits: nextClaimedBenefits,
          lastBenefitClaimedAt: new Date().toISOString()
        }
      });
      await claimRef.set({
        data: {
          _openid: openid,
          kind: 'benefit_claim',
          campaignId: THEME_LAUNCH_BENEFIT.id,
          userId: currentUser._id,
          rewardType: THEME_LAUNCH_BENEFIT.rewardType,
          rewardAmount: THEME_LAUNCH_BENEFIT.rewardAmount,
          createdAt: new Date().toISOString()
        }
      });

      return {
        alreadyClaimed: false,
        themeVouchers,
        claimedBenefits: nextClaimedBenefits
      };
    });

    const result = transactionResult && transactionResult.result
      ? transactionResult.result
      : transactionResult;
    return {
      code: 0,
      data: Object.assign({}, buildStatus({
        themeVouchers: result.themeVouchers,
        claimedBenefits: result.claimedBenefits
      }, true), {
        alreadyClaimed: !!result.alreadyClaimed
      })
    };
  } catch (error) {
    console.error('[benefitCenter] failed:', error);
    return {
      code: error.businessCode || 'BENEFIT_FAILED',
      msg: error.message || '福利领取失败，请重试'
    };
  }
};
