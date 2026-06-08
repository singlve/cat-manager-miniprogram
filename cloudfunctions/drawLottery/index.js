const cloud = require('wx-server-sdk');
const cloudbase = require('@cloudbase/node-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const app = cloudbase.init({ env: cloudbase.SYMBOL_DEFAULT_ENV });
const db = app.database();

const USER_COL = 'users';
const PRIZE_COL = 'lottery_prizes';
const RECORD_COL = 'lottery_records';
const REQUEST_COL = 'lottery_requests';
const REDEEM_RECORD_COL = 'redeem_records';
const INVENTORY_COL = 'user_inventory';

function buildId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

function businessError(code, message) {
  const error = new Error(message);
  error.businessCode = code;
  return error;
}

function normalizeThemes(value) {
  const themes = Array.isArray(value) ? value.slice() : [];
  if (themes.indexOf('default') === -1) themes.unshift('default');
  return Array.from(new Set(themes.filter(Boolean)));
}

function normalizeDrawnMilestones(user, streak) {
  const drawn = Array.isArray(user.drawnMilestones) ? user.drawnMilestones.slice() : [];
  const legacyUsed = Math.max(0, parseInt(user.lotteryUsed, 10) || 0);
  if (!drawn.length && legacyUsed > 0) {
    for (let day = 7; day <= streak && drawn.length < legacyUsed; day += 7) {
      drawn.push(day);
    }
  }
  return Array.from(new Set(drawn.map(value => parseInt(value, 10)).filter(value => value > 0)))
    .sort((a, b) => a - b);
}

function selectWeighted(prizes) {
  const total = prizes.reduce((sum, prize) => sum + Math.max(0, parseInt(prize.weight, 10) || 0), 0);
  if (total <= 0) throw businessError('EMPTY_POOL', '当前奖池没有可抽取奖品');
  let cursor = Math.random() * total;
  for (const prize of prizes) {
    cursor -= Math.max(0, parseInt(prize.weight, 10) || 0);
    if (cursor < 0) return prize;
  }
  return prizes[prizes.length - 1];
}

function prizeSnapshot(prize) {
  return {
    prizeId: prize._id,
    name: prize.name,
    type: prize.type,
    virtualType: prize.virtualType || '',
    virtualValue: prize.virtualValue || 0,
    image: prize.image || '',
    color: prize.color || '#5BA7D8'
  };
}

function unavailableReason(prize, ownedThemes) {
  if (prize.type === 'physical' && (parseInt(prize.stock, 10) || 0) <= 0) return 'OUT_OF_STOCK';
  if (prize.virtualType === 'theme' && ownedThemes.indexOf(prize.virtualValue) !== -1) return 'THEME_OWNED';
  return '';
}

function noRewardSnapshot(prize, reason) {
  return {
    prizeId: prize._id,
    name: '谢谢参与',
    type: 'virtual',
    virtualType: 'none',
    virtualValue: 0,
    image: '',
    color: prize.color || '#A5AFBC',
    configuredPrizeName: prize.name,
    fallbackReason: reason
  };
}

exports.main = async event => {
  const openid = cloud.getWXContext().OPENID;
  const userId = String(event.userId || '');
  const requestId = String(event.requestId || '');
  const requestedMilestone = parseInt(event.milestone, 10) || 0;

  if (!openid) return { code: 'NOT_LOGGED_IN', msg: '无法获取用户身份' };
  if (!userId || !requestId) return { code: 'INVALID_ARGUMENT', msg: '抽奖参数不完整' };

  try {
    const result = await db.runTransaction(async transaction => {
      const requestRef = transaction.collection(REQUEST_COL).doc(requestId);
      let oldRequest = null;
      try { oldRequest = await requestRef.get(); } catch (error) { oldRequest = null; }
      if (oldRequest && oldRequest.data) {
        if (oldRequest.data._openid !== openid) throw businessError('INVALID_REQUEST', '请求不属于当前用户');
        return oldRequest.data.result;
      }

      const userRef = transaction.collection(USER_COL).doc(userId);
      const userResult = await userRef.get();
      const user = userResult && userResult.data;
      if (!user || user._openid !== openid) throw businessError('USER_NOT_FOUND', '用户信息不存在或无权操作');

      const streak = Math.max(0, parseInt(user.checkInStreak, 10) || 0);
      const drawn = normalizeDrawnMilestones(user, streak);
      const milestones = [];
      for (let day = 7; day <= streak; day += 7) {
        if (drawn.indexOf(day) === -1) milestones.push(day);
      }
      if (!milestones.length) throw businessError('NO_DRAW_CHANCE', '当前没有可用抽奖机会');
      const milestone = requestedMilestone && milestones.indexOf(requestedMilestone) !== -1
        ? requestedMilestone
        : milestones[0];

      const prizeResult = await transaction.collection(PRIZE_COL).where({ enabled: true }).get();
      const ownedThemes = normalizeThemes(user.ownedThemes);
      const pool = (prizeResult.data || []).filter(prize => (parseInt(prize.weight, 10) || 0) > 0);
      const prize = selectWeighted(pool);
      const fallbackReason = unavailableReason(prize, ownedThemes);
      const now = new Date().toISOString();
      const snapshot = fallbackReason ? noRewardSnapshot(prize, fallbackReason) : prizeSnapshot(prize);

      let nextPoints = Math.max(0, parseInt(user.totalPoints, 10) || 0);
      let nextCards = Math.max(0, parseInt(user.makeUpCards, 10) || 0);
      let nextThemes = ownedThemes;
      let inventoryId = '';
      let redeemRecordId = '';

      if (!fallbackReason && prize.virtualType === 'points') {
        nextPoints += Math.max(0, parseInt(prize.virtualValue, 10) || 0);
      } else if (!fallbackReason && prize.virtualType === 'card') {
        nextCards += Math.max(0, parseInt(prize.virtualValue, 10) || 0);
      } else if (!fallbackReason && prize.virtualType === 'theme') {
        nextThemes = normalizeThemes(ownedThemes.concat(prize.virtualValue));
      } else if (!fallbackReason && prize.type === 'physical') {
        redeemRecordId = buildId('lottery_rec');
        inventoryId = buildId('lottery_inv');
        await transaction.collection(REDEEM_RECORD_COL).doc(redeemRecordId).set({
          data: {
            _openid: openid,
            itemId: prize.linkedItemId || prize._id,
            itemName: prize.name,
            itemType: 'physical',
            pointsSpent: 0,
            userNickname: user.nickname || '',
            openid,
            redeemedAt: now,
            status: 'in_backpack',
            source: 'lottery',
            inventoryId
          }
        });
        await transaction.collection(INVENTORY_COL).doc(inventoryId).set({
          data: {
            _openid: openid,
            itemId: prize.linkedItemId || prize._id,
            itemName: prize.name,
            itemType: 'physical',
            image: prize.image || '',
            pointsSpent: 0,
            ownedAt: now,
            status: 'in_backpack',
            source: 'lottery',
            redeemRecordId
          }
        });
        await transaction.collection(PRIZE_COL).doc(prize._id).update({
          data: { stock: Math.max(0, (parseInt(prize.stock, 10) || 0) - 1), updatedAt: Date.now() }
        });
      }

      const nextDrawn = Array.from(new Set(drawn.concat(milestone))).sort((a, b) => a - b);
      const month = now.slice(0, 7);
      await userRef.update({
        data: {
          totalPoints: nextPoints,
          makeUpCards: nextCards,
          ownedThemes: nextThemes,
          drawnMilestones: nextDrawn,
          lotteryUsed: nextDrawn.length,
          lotteryUsedMonth: (parseInt(user.lotteryUsedMonth, 10) || 0) + 1,
          lotteryMonth: month,
          _lastDrawDate: now.slice(0, 10)
        }
      });

      const recordId = buildId('lottery');
      await transaction.collection(RECORD_COL).doc(recordId).set({
        data: Object.assign({
          _openid: openid,
          userId,
          milestone,
          drawnAt: now,
          requestId,
          inventoryId,
          redeemRecordId
        }, snapshot)
      });

      const response = Object.assign({
        recordId,
        milestone,
        points: nextPoints,
        makeUpCards: nextCards,
        ownedThemes: nextThemes,
        drawnMilestones: nextDrawn,
        inventoryId
      }, snapshot);

      await requestRef.set({
        data: { _openid: openid, userId, createdAt: now, result: response }
      });
      return response;
    });
    return { code: 0, data: result && result.result ? result.result : result };
  } catch (error) {
    console.error('[drawLottery] failed:', error);
    return { code: error.businessCode || 'DRAW_FAILED', msg: error.message || '抽奖失败，请重试' };
  }
};
