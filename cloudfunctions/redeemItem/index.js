const cloud = require('wx-server-sdk');
const cloudbase = require('@cloudbase/node-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const app = cloudbase.init({
  env: cloudbase.SYMBOL_DEFAULT_ENV
});
const db = app.database();

const USER_COL = 'users';
const ITEM_COL = 'redeem_items';
const RECORD_COL = 'redeem_records';
const INVENTORY_COL = 'user_inventory';
const REQUEST_COL = 'redeem_requests';
const BENEFIT_CLAIM_COL = 'benefit_claims';
const LEGACY_THEME_VOUCHER_MAX_POINTS = 1000;

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

exports.main = async event => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const userId = String(event.userId || '');
  const itemId = String(event.itemId || '');
  const requestId = String(event.requestId || '');
  const paymentMethod = String(event.paymentMethod || 'points');
  const quantity = Math.max(1, Math.min(20, parseInt(event.quantity, 10) || 1));

  if (!openid) return { code: 'NOT_LOGGED_IN', msg: '无法获取用户身份' };
  if (!userId || !itemId || !requestId) {
    return { code: 'INVALID_ARGUMENT', msg: '兑换参数不完整' };
  }

  try {
    const transactionResult = await db.runTransaction(async transaction => {
      const requestRef = transaction.collection(REQUEST_COL).doc(requestId);
      let existingRequest = null;
      try {
        existingRequest = await requestRef.get();
      } catch (error) {
        existingRequest = null;
      }
      if (existingRequest && existingRequest.data) {
        if (existingRequest.data._openid !== openid) {
          throw businessError('INVALID_REQUEST', '兑换请求不属于当前用户');
        }
        return existingRequest.data.result;
      }

      const userRef = transaction.collection(USER_COL).doc(userId);
      const itemRef = transaction.collection(ITEM_COL).doc(itemId);
      const userResult = await userRef.get();
      const itemResult = await itemRef.get();
      const user = userResult && userResult.data;
      const item = itemResult && itemResult.data;

      if (!user || user._openid !== openid) {
        throw businessError('USER_NOT_FOUND', '用户信息不存在或无权操作');
      }
      if (!item || item.enabled === false) {
        throw businessError('ITEM_UNAVAILABLE', '商品不存在或已下架');
      }
      if (item.type !== 'physical' && quantity !== 1) {
        throw businessError('INVALID_QUANTITY', '虚拟商品每次只能兑换一件');
      }

      const ownedThemes = normalizeThemes(user.ownedThemes);
      if (item.virtualType === 'theme' && ownedThemes.indexOf(item.virtualValue) !== -1) {
        throw businessError('THEME_OWNED', '这个主题已经拥有');
      }

      const useThemeVoucher = paymentMethod === 'theme_voucher';
      if (useThemeVoucher && item.virtualType !== 'theme') {
        throw businessError('VOUCHER_NOT_APPLICABLE', '主题兑换券只能用于兑换主题');
      }

      const itemPoints = Math.max(0, parseInt(item.points, 10) || 0);
      const currentThemeVouchers = Math.max(0, parseInt(user.themeVouchers, 10) || 0);
      if (useThemeVoucher && currentThemeVouchers < 1) {
        throw businessError('VOUCHER_NOT_ENOUGH', '主题兑换券不足');
      }
      let voucherClaim = null;
      let trackedVoucherCount = 0;
      let voucherClaimsLoaded = false;
      if (useThemeVoucher) {
        try {
          const claimResult = await transaction.collection(BENEFIT_CLAIM_COL)
            .where({ userId, rewardType: 'theme_voucher' })
            .get();
          const activeClaims = (claimResult.data || [])
            .filter(claim => claim.status === 'unused' || claim.status === 'partially_used')
            .sort((a, b) => String(a.claimedAt || '').localeCompare(String(b.claimedAt || '')));
          voucherClaimsLoaded = true;
          trackedVoucherCount = activeClaims.reduce((total, claim) => total + Math.max(
            0,
            (parseInt(claim.rewardAmount, 10) || 1) - (parseInt(claim.usedAmount, 10) || 0)
          ), 0);
          voucherClaim = activeClaims
            .filter(claim => (parseInt(claim.maxThemePoints, 10) || LEGACY_THEME_VOUCHER_MAX_POINTS) >= itemPoints)
            [0] || null;
        } catch (error) {
          voucherClaim = null;
        }
        const hasUntrackedLegacyVoucher = !voucherClaimsLoaded ||
          currentThemeVouchers > trackedVoucherCount;
        if (!voucherClaim &&
            (!hasUntrackedLegacyVoucher || itemPoints > LEGACY_THEME_VOUCHER_MAX_POINTS)) {
          throw businessError('VOUCHER_LIMIT_EXCEEDED', '没有可用于该主题的兑换券');
        }
      }

      const unitPoints = useThemeVoucher ? 0 : itemPoints;
      const totalCost = unitPoints * quantity;
      const currentPoints = Math.max(0, parseInt(user.totalPoints, 10) || 0);
      if (currentPoints < totalCost) {
        throw businessError('POINTS_NOT_ENOUGH', '积分不足');
      }
      if (item.type === 'physical' && (parseInt(item.stock, 10) || 0) < quantity) {
        throw businessError('STOCK_NOT_ENOUGH', '库存不足');
      }

      const now = new Date().toISOString();
      const recordIds = [];
      const inventoryIds = [];
      let nextPoints = currentPoints - totalCost;
      let nextMakeUpCards = Math.max(0, parseInt(user.makeUpCards, 10) || 0);
      let nextThemes = ownedThemes;
      let nextThemeVouchers = currentThemeVouchers;

      if (item.virtualType === 'card') {
        nextMakeUpCards += (parseInt(item.virtualValue, 10) || 0) * quantity;
      } else if (item.virtualType === 'points') {
        nextPoints += (parseInt(item.virtualValue, 10) || 0) * quantity;
      } else if (item.virtualType === 'theme') {
        nextThemes = normalizeThemes(ownedThemes.concat(item.virtualValue));
      }
      if (useThemeVoucher) nextThemeVouchers -= 1;

      for (let index = 0; index < quantity; index++) {
        const recordId = buildId('rec');
        const inventoryId = item.type === 'physical' || item.virtualType === 'theme'
          ? buildId('inv')
          : '';
        const record = {
          _id: recordId,
          _openid: openid,
          itemId: item._id,
          itemName: item.name,
          itemType: item.type,
          pointsSpent: unitPoints,
          userNickname: user.nickname || '',
          openid,
          redeemedAt: now,
          status: item.type === 'physical' ? 'in_backpack' : 'completed'
        };
        if (item.virtualType) record.virtualType = item.virtualType;
        if (item.virtualType === 'theme') record.themeKey = item.virtualValue;
        if (useThemeVoucher) record.paymentMethod = 'theme_voucher';
        if (inventoryId) record.inventoryId = inventoryId;

        const { _id: recordDocId, ...recordData } = record;
        await transaction.collection(RECORD_COL).doc(recordDocId).set({ data: recordData });
        recordIds.push(recordId);

        if (inventoryId) {
          const inventory = {
            _id: inventoryId,
            _openid: openid,
            itemId: item._id,
            itemName: item.name,
            itemType: item.type,
            image: item.image || '',
            pointsSpent: unitPoints,
            ownedAt: now,
            status: item.type === 'physical' ? 'in_backpack' : 'completed',
            redeemRecordId: recordId
          };
          if (item.virtualType) inventory.virtualType = item.virtualType;
          if (item.virtualType === 'theme') inventory.themeKey = item.virtualValue;
          const { _id: inventoryDocId, ...inventoryData } = inventory;
          await transaction.collection(INVENTORY_COL).doc(inventoryDocId).set({ data: inventoryData });
          inventoryIds.push(inventoryId);
        }
      }

      await userRef.update({
        data: {
          totalPoints: nextPoints,
          makeUpCards: nextMakeUpCards,
          ownedThemes: nextThemes,
          themeVouchers: nextThemeVouchers
        }
      });
      if (useThemeVoucher && voucherClaim) {
        const usedAmount = Math.max(0, parseInt(voucherClaim.usedAmount, 10) || 0) + 1;
        const rewardAmount = Math.max(1, parseInt(voucherClaim.rewardAmount, 10) || 1);
        await transaction.collection(BENEFIT_CLAIM_COL).doc(voucherClaim._id).update({
          data: {
            usedAmount,
            status: usedAmount >= rewardAmount ? 'used' : 'partially_used',
            usedAt: new Date().toISOString(),
            usedThemeKey: item.virtualValue
          }
        });
      }

      if (item.type === 'physical') {
        await itemRef.update({
          data: { stock: (parseInt(item.stock, 10) || 0) - quantity }
        });
      }

      const result = {
        points: nextPoints,
        makeUpCards: nextMakeUpCards,
        ownedThemes: nextThemes,
        themeVouchers: nextThemeVouchers,
        itemType: item.type,
        virtualType: item.virtualType || '',
        themeKey: item.virtualType === 'theme' ? item.virtualValue : '',
        paymentMethod: useThemeVoucher ? 'theme_voucher' : 'points',
        quantity,
        recordIds,
        inventoryIds
      };

      await requestRef.set({
        data: {
          _openid: openid,
          userId,
          itemId,
          createdAt: now,
          result
        }
      });
      return result;
    });

    return {
      code: 0,
      data: transactionResult && transactionResult.result
        ? transactionResult.result
        : transactionResult
    };
  } catch (error) {
    console.error('[redeemItem] transaction failed:', error);
    return {
      code: error.businessCode || 'REDEEM_FAILED',
      msg: error.message || '兑换失败，请重试'
    };
  }
};
