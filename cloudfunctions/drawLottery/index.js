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
const REDEEM_ITEM_COL = 'redeem_items';
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

exports.main = async event => {
  const openid = cloud.getWXContext().OPENID;
  const action = String(event.action || 'draw');

  if (action === 'reservePhysical') {
    const inventoryIds = Array.isArray(event.inventoryIds)
      ? Array.from(new Set(event.inventoryIds.map(String).filter(Boolean))).slice(0, 20)
      : [];
    if (!openid) return { code: 'NOT_LOGGED_IN', msg: '无法获取用户身份' };
    if (!inventoryIds.length) return { code: 'INVALID_ARGUMENT', msg: '缺少待兑换奖品' };
    try {
      const reserveResult = await db.runTransaction(async transaction => {
        const pendingByPrize = new Map();
        const pendingItems = [];
        for (const inventoryId of inventoryIds) {
          const inventoryRef = transaction.collection(INVENTORY_COL).doc(inventoryId);
          const inventoryResult = await inventoryRef.get();
          const inventory = inventoryResult && inventoryResult.data;
          if (!inventory || inventory._openid !== openid || inventory.source !== 'lottery') {
            throw businessError('INVALID_INVENTORY', '奖品不存在或无权操作');
          }
          if (inventory.status !== 'in_backpack') {
            throw businessError('INVALID_STATUS', '奖品当前状态不能兑换');
          }
          if (inventory.stockReserved === true) continue;
          const prizeId = String(inventory.lotteryPrizeId || '');
          if (!prizeId) throw businessError('INVALID_PRIZE', '奖品缺少库存关联信息');
          pendingByPrize.set(prizeId, (pendingByPrize.get(prizeId) || 0) + 1);
          pendingItems.push({ inventoryRef, inventory });
        }

        for (const [prizeId, quantity] of pendingByPrize.entries()) {
          const prizeRef = transaction.collection(PRIZE_COL).doc(prizeId);
          const prizeResult = await prizeRef.get();
          const prize = prizeResult && prizeResult.data;
          const stock = Math.max(0, parseInt(prize && prize.stock, 10) || 0);
          if (!prize || stock < quantity) {
            throw businessError('STOCK_NOT_ENOUGH', '奖品暂时缺货，请等待管理员补充库存');
          }
          await prizeRef.update({ data: { stock: stock - quantity, updatedAt: Date.now() } });
        }

        for (const item of pendingItems) {
          await item.inventoryRef.update({ data: { stockReserved: true, stockReservedAt: new Date().toISOString() } });
        }
        return { reserved: pendingItems.length };
      });
      return { code: 0, data: reserveResult && reserveResult.result ? reserveResult.result : reserveResult };
    } catch (error) {
      console.error('[drawLottery] reserve physical failed:', error);
      return { code: error.businessCode || 'RESERVE_FAILED', msg: error.message || '库存预留失败' };
    }
  }

  if (action === 'releasePhysical') {
    const inventoryIds = Array.isArray(event.inventoryIds)
      ? Array.from(new Set(event.inventoryIds.map(String).filter(Boolean))).slice(0, 20)
      : [];
    if (!openid) return { code: 'NOT_LOGGED_IN', msg: '无法获取用户身份' };
    if (!inventoryIds.length) return { code: 0, data: { released: 0 } };
    try {
      const releaseResult = await db.runTransaction(async transaction => {
        const releaseByPrize = new Map();
        const releaseItems = [];
        for (const inventoryId of inventoryIds) {
          const inventoryRef = transaction.collection(INVENTORY_COL).doc(inventoryId);
          const inventoryResult = await inventoryRef.get();
          const inventory = inventoryResult && inventoryResult.data;
          if (!inventory || inventory._openid !== openid || inventory.source !== 'lottery') continue;
          if (inventory.status !== 'in_backpack' || inventory.stockReserved !== true) continue;
          const prizeId = String(inventory.lotteryPrizeId || '');
          if (!prizeId) continue;
          releaseByPrize.set(prizeId, (releaseByPrize.get(prizeId) || 0) + 1);
          releaseItems.push(inventoryRef);
        }
        for (const [prizeId, quantity] of releaseByPrize.entries()) {
          const prizeRef = transaction.collection(PRIZE_COL).doc(prizeId);
          const prizeResult = await prizeRef.get();
          const prize = prizeResult && prizeResult.data;
          if (!prize) continue;
          await prizeRef.update({
            data: {
              stock: Math.max(0, parseInt(prize.stock, 10) || 0) + quantity,
              updatedAt: Date.now()
            }
          });
        }
        for (const inventoryRef of releaseItems) {
          await inventoryRef.update({ data: { stockReserved: false, stockReleasedAt: new Date().toISOString() } });
        }
        return { released: releaseItems.length };
      });
      return { code: 0, data: releaseResult && releaseResult.result ? releaseResult.result : releaseResult };
    } catch (error) {
      console.error('[drawLottery] release physical failed:', error);
      return { code: error.businessCode || 'RELEASE_FAILED', msg: error.message || '库存释放失败' };
    }
  }

  if (action === 'cancelPhysical') {
    const userId = String(event.userId || '');
    const inventoryIds = Array.isArray(event.inventoryIds)
      ? Array.from(new Set(event.inventoryIds.map(String).filter(Boolean))).slice(0, 20)
      : [];
    if (!openid) return { code: 'NOT_LOGGED_IN', msg: '无法获取用户身份' };
    if (!userId || !inventoryIds.length) return { code: 'INVALID_ARGUMENT', msg: '取消参数不完整' };
    try {
      const cancelResult = await db.runTransaction(async transaction => {
        const userRef = transaction.collection(USER_COL).doc(userId);
        const userResult = await userRef.get();
        const user = userResult && userResult.data;
        if (!user || user._openid !== openid) throw businessError('USER_NOT_FOUND', '用户信息不存在或无权操作');

        const releaseByPrize = new Map();
        const cancelItems = [];
        let compensationPoints = 0;
        for (const inventoryId of inventoryIds) {
          const inventoryRef = transaction.collection(INVENTORY_COL).doc(inventoryId);
          const inventoryResult = await inventoryRef.get();
          const inventory = inventoryResult && inventoryResult.data;
          if (!inventory || inventory._openid !== openid || inventory.source !== 'lottery') {
            throw businessError('INVALID_INVENTORY', '奖品不存在或无权操作');
          }
          if (inventory.status !== 'in_backpack') {
            throw businessError('INVALID_STATUS', '只有背包中待确认的奖品可以取消');
          }

          let points = Math.max(0, parseInt(inventory.compensationPoints, 10) || 0);
          if (!points && inventory.itemId) {
            try {
              const redeemItemResult = await transaction.collection(REDEEM_ITEM_COL).doc(inventory.itemId).get();
              points = Math.max(0, parseInt(redeemItemResult && redeemItemResult.data && redeemItemResult.data.points, 10) || 0);
            } catch (error) {
              points = 0;
            }
          }
          compensationPoints += points;

          if (inventory.stockReserved === true && inventory.lotteryPrizeId) {
            releaseByPrize.set(
              inventory.lotteryPrizeId,
              (releaseByPrize.get(inventory.lotteryPrizeId) || 0) + 1
            );
          }
          cancelItems.push({
            inventoryRef,
            redeemRecordId: String(inventory.redeemRecordId || '')
          });
        }

        for (const [prizeId, quantity] of releaseByPrize.entries()) {
          const prizeRef = transaction.collection(PRIZE_COL).doc(prizeId);
          const prizeResult = await prizeRef.get();
          const prize = prizeResult && prizeResult.data;
          if (!prize) continue;
          await prizeRef.update({
            data: {
              stock: Math.max(0, parseInt(prize.stock, 10) || 0) + quantity,
              updatedAt: Date.now()
            }
          });
        }

        for (const item of cancelItems) {
          if (item.redeemRecordId) {
            await transaction.collection(REDEEM_RECORD_COL).doc(item.redeemRecordId).remove();
          }
          await item.inventoryRef.remove();
        }

        const nextPoints = Math.max(0, parseInt(user.totalPoints, 10) || 0) + compensationPoints;
        await userRef.update({ data: { totalPoints: nextPoints } });
        return { cancelled: cancelItems.length, compensationPoints, points: nextPoints };
      });
      return { code: 0, data: cancelResult && cancelResult.result ? cancelResult.result : cancelResult };
    } catch (error) {
      console.error('[drawLottery] cancel physical failed:', error);
      return { code: error.businessCode || 'CANCEL_FAILED', msg: error.message || '取消奖品失败' };
    }
  }

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
      const bonusLotteryDraws = Math.max(0, parseInt(user.bonusLotteryDraws, 10) || 0);
      if (!milestones.length && bonusLotteryDraws < 1) {
        throw businessError('NO_DRAW_CHANCE', '当前没有可用抽奖机会');
      }
      const useBonusDraw = !milestones.length;
      const milestone = useBonusDraw
        ? 0
        : (requestedMilestone && milestones.indexOf(requestedMilestone) !== -1
          ? requestedMilestone
          : milestones[0]);

      const prizeResult = await transaction.collection(PRIZE_COL).where({ enabled: true }).get();
      const ownedThemes = normalizeThemes(user.ownedThemes);
      const pool = (prizeResult.data || []).filter(prize => (parseInt(prize.weight, 10) || 0) > 0);
      const prize = selectWeighted(pool);
      const now = new Date().toISOString();
      const snapshot = prizeSnapshot(prize);

      let nextPoints = Math.max(0, parseInt(user.totalPoints, 10) || 0);
      let nextCards = Math.max(0, parseInt(user.makeUpCards, 10) || 0);
      let nextThemes = ownedThemes;
      let inventoryId = '';
      let redeemRecordId = '';
      let stockReserved = false;
      const themeAlreadyOwned = prize.virtualType === 'theme'
        && ownedThemes.indexOf(prize.virtualValue) !== -1;

      if (prize.virtualType === 'points') {
        nextPoints += Math.max(0, parseInt(prize.virtualValue, 10) || 0);
      } else if (prize.virtualType === 'card') {
        nextCards += Math.max(0, parseInt(prize.virtualValue, 10) || 0);
      } else if (prize.virtualType === 'theme') {
        nextThemes = normalizeThemes(ownedThemes.concat(prize.virtualValue));
      } else if (prize.type === 'physical') {
        const stock = Math.max(0, parseInt(prize.stock, 10) || 0);
        stockReserved = stock > 0;
        let compensationPoints = 0;
        if (prize.linkedItemId) {
          try {
            const redeemItemResult = await transaction.collection(REDEEM_ITEM_COL).doc(prize.linkedItemId).get();
            compensationPoints = Math.max(
              0,
              parseInt(redeemItemResult && redeemItemResult.data && redeemItemResult.data.points, 10) || 0
            );
          } catch (error) {
            compensationPoints = 0;
          }
        }
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
            lotteryPrizeId: prize._id,
            stockReserved,
            compensationPoints,
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
            lotteryPrizeId: prize._id,
            stockReserved,
            compensationPoints,
            redeemRecordId
          }
        });
        if (stockReserved) {
          await transaction.collection(PRIZE_COL).doc(prize._id).update({
            data: { stock: stock - 1, updatedAt: Date.now() }
          });
        }
      }

      const nextDrawn = useBonusDraw
        ? drawn
        : Array.from(new Set(drawn.concat(milestone))).sort((a, b) => a - b);
      const nextBonusLotteryDraws = useBonusDraw ? bonusLotteryDraws - 1 : bonusLotteryDraws;
      const month = now.slice(0, 7);
      await userRef.update({
        data: {
          totalPoints: nextPoints,
          makeUpCards: nextCards,
          ownedThemes: nextThemes,
          bonusLotteryDraws: nextBonusLotteryDraws,
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
        bonusLotteryDraws: nextBonusLotteryDraws,
        drawnMilestones: nextDrawn,
        inventoryId,
        stockReserved,
        themeAlreadyOwned
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
