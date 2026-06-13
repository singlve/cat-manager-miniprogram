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
const SHIPPING_ADDRESS_COL = 'shipping_addresses';
const SHIPMENT_COL = 'shipments';
const LOTTERY_PRIZE_COL = 'lottery_prizes';
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

function uniqueIds(value) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map(String).filter(Boolean))).slice(0, 20)
    : [];
}

function inventoryRequestSignature(action, event) {
  return JSON.stringify({
    action,
    userId: String(event.userId || ''),
    inventoryIds: uniqueIds(event.inventoryIds).sort(),
    addressId: String(event.addressId || '')
  });
}

async function runInventoryRequest(event, openid, action, handler) {
  const requestId = String(event.requestId || '');
  if (!requestId) throw businessError('INVALID_ARGUMENT', '缺少请求标识');
  const signature = inventoryRequestSignature(action, event);
  return db.runTransaction(async transaction => {
    const requestRef = transaction.collection(REQUEST_COL).doc(requestId);
    let existingRequest = null;
    try { existingRequest = await requestRef.get(); } catch (error) { existingRequest = null; }
    if (existingRequest && existingRequest.data) {
      if (existingRequest.data._openid !== openid ||
          existingRequest.data.action !== action ||
          existingRequest.data.signature !== signature) {
        throw businessError('INVALID_REQUEST', '请求标识与当前操作不匹配');
      }
      return existingRequest.data.result;
    }
    const result = await handler(transaction);
    await requestRef.set({
      _openid: openid,
      action,
      signature,
      createdAt: new Date().toISOString(),
      result
    });
    return result;
  });
}

async function getOwnedUser(transaction, userId, openid) {
  const userRef = transaction.collection(USER_COL).doc(userId);
  const userResult = await userRef.get();
  const user = userResult && userResult.data;
  if (!user || user._openid !== openid) {
    throw businessError('USER_NOT_FOUND', '用户信息不存在或无权操作');
  }
  return { userRef, user };
}

async function confirmInventory(event, openid) {
  const userId = String(event.userId || '');
  const inventoryIds = uniqueIds(event.inventoryIds);
  const addressId = String(event.addressId || '');
  if (!userId || !inventoryIds.length || !addressId) {
    throw businessError('INVALID_ARGUMENT', '确认兑换参数不完整');
  }

  return runInventoryRequest(event, openid, 'confirmInventory', async transaction => {
    const { user } = await getOwnedUser(transaction, userId, openid);
    const addressResult = await transaction.collection(SHIPPING_ADDRESS_COL).doc(addressId).get();
    const address = addressResult && addressResult.data;
    if (!address || address._openid !== openid) {
      throw businessError('INVALID_ADDRESS', '收货地址不存在或无权使用');
    }
    const shippingAddress = {
      name: address.name || '',
      phone: address.phone || '',
      province: address.province || '',
      city: address.city || '',
      district: address.district || '',
      detail: address.detail || ''
    };

    const inventoryRows = [];
    const reserveByPrize = new Map();
    for (const inventoryId of inventoryIds) {
      const inventoryRef = transaction.collection(INVENTORY_COL).doc(inventoryId);
      const inventoryResult = await inventoryRef.get();
      const inventory = inventoryResult && inventoryResult.data;
      if (!inventory || inventory._openid !== openid || inventory.itemType !== 'physical') {
        throw businessError('INVALID_INVENTORY', '背包商品不存在或无权操作');
      }
      if (inventory.status !== 'in_backpack') {
        throw businessError('INVALID_STATUS', '只有背包中待确认的商品可以兑换');
      }
      if (inventory.source === 'lottery' && inventory.stockReserved !== true) {
        const prizeId = String(inventory.lotteryPrizeId || '');
        if (!prizeId) throw businessError('INVALID_PRIZE', '抽奖商品缺少库存关联');
        reserveByPrize.set(prizeId, (reserveByPrize.get(prizeId) || 0) + 1);
      }
      inventoryRows.push({ inventoryRef, inventory });
    }

    const firstItemId = String(inventoryRows[0].inventory.itemId || '');
    if (inventoryRows.some(row => String(row.inventory.itemId || '') !== firstItemId)) {
      throw businessError('MIXED_ITEMS', '一次只能确认同一种商品');
    }

    for (const [prizeId, quantity] of reserveByPrize.entries()) {
      const prizeRef = transaction.collection(LOTTERY_PRIZE_COL).doc(prizeId);
      const prizeResult = await prizeRef.get();
      const prize = prizeResult && prizeResult.data;
      const stock = Math.max(0, parseInt(prize && prize.stock, 10) || 0);
      if (!prize || stock < quantity) {
        throw businessError('STOCK_NOT_ENOUGH', '奖品暂时缺货，请等待管理员补充库存');
      }
      await prizeRef.update({ stock: stock - quantity, updatedAt: Date.now() });
    }

    const now = new Date().toISOString();
    const recordIds = [];
    for (const row of inventoryRows) {
      const updates = {
        status: 'pending',
        shippingAddress,
        shippingAddressId: addressId
      };
      if (row.inventory.source === 'lottery' && row.inventory.stockReserved !== true) {
        updates.stockReserved = true;
        updates.stockReservedAt = now;
      }
      await row.inventoryRef.update(updates);
      if (row.inventory.redeemRecordId) {
        recordIds.push(row.inventory.redeemRecordId);
        await transaction.collection(RECORD_COL).doc(row.inventory.redeemRecordId).update(updates);
      }
    }

    const shipmentId = buildId('shipment');
    await transaction.collection(SHIPMENT_COL).doc(shipmentId).set({
      _openid: openid,
      itemId: firstItemId,
      itemName: inventoryRows[0].inventory.itemName || '商品',
      qty: inventoryRows.length,
      userNickname: user.nickname || '',
      openid,
      shippingAddress,
      shippingAddressId: addressId,
      status: 'pending',
      inventoryIds,
      redeemRecordIds: recordIds,
      createdAt: now
    });
    return { confirmed: inventoryRows.length, shipmentId };
  });
}

async function cancelInventory(event, openid) {
  const userId = String(event.userId || '');
  const inventoryIds = uniqueIds(event.inventoryIds);
  if (!userId || !inventoryIds.length) {
    throw businessError('INVALID_ARGUMENT', '取消参数不完整');
  }

  return runInventoryRequest(event, openid, 'cancelInventory', async transaction => {
    const { userRef, user } = await getOwnedUser(transaction, userId, openid);
    const restoreItems = new Map();
    const releasePrizes = new Map();
    const rows = [];
    let compensationPoints = 0;

    for (const inventoryId of inventoryIds) {
      const inventoryRef = transaction.collection(INVENTORY_COL).doc(inventoryId);
      const inventoryResult = await inventoryRef.get();
      const inventory = inventoryResult && inventoryResult.data;
      if (!inventory || inventory._openid !== openid) {
        throw businessError('INVALID_INVENTORY', '背包商品不存在或无权操作');
      }
      if (inventory.status !== 'in_backpack') {
        throw businessError('INVALID_STATUS', '只有背包中待确认的商品可以取消');
      }
      let points = Math.max(0, parseInt(inventory.pointsSpent, 10) || 0);
      if (inventory.source === 'lottery') {
        points = Math.max(0, parseInt(inventory.compensationPoints, 10) || 0);
        if (!points && inventory.itemId) {
          try {
            const linked = await transaction.collection(ITEM_COL).doc(inventory.itemId).get();
            points = Math.max(0, parseInt(linked && linked.data && linked.data.points, 10) || 0);
          } catch (error) {
            points = 0;
          }
        }
        if (inventory.stockReserved === true && inventory.lotteryPrizeId) {
          releasePrizes.set(
            inventory.lotteryPrizeId,
            (releasePrizes.get(inventory.lotteryPrizeId) || 0) + 1
          );
        }
      } else if (inventory.itemType === 'physical' && inventory.itemId) {
        restoreItems.set(inventory.itemId, (restoreItems.get(inventory.itemId) || 0) + 1);
      }
      compensationPoints += points;
      rows.push({ inventoryRef, inventory });
    }

    for (const [itemId, quantity] of restoreItems.entries()) {
      const itemRef = transaction.collection(ITEM_COL).doc(itemId);
      const itemResult = await itemRef.get();
      const item = itemResult && itemResult.data;
      if (item) await itemRef.update({ stock: Math.max(0, parseInt(item.stock, 10) || 0) + quantity });
    }
    for (const [prizeId, quantity] of releasePrizes.entries()) {
      const prizeRef = transaction.collection(LOTTERY_PRIZE_COL).doc(prizeId);
      const prizeResult = await prizeRef.get();
      const prize = prizeResult && prizeResult.data;
      if (prize) {
        await prizeRef.update({
          stock: Math.max(0, parseInt(prize.stock, 10) || 0) + quantity,
          updatedAt: Date.now()
        });
      }
    }
    for (const row of rows) {
      if (row.inventory.redeemRecordId) {
        await transaction.collection(RECORD_COL).doc(row.inventory.redeemRecordId).remove();
      }
      await row.inventoryRef.remove();
    }

    const points = Math.max(0, parseInt(user.totalPoints, 10) || 0) + compensationPoints;
    await userRef.update({ totalPoints: points });
    return { cancelled: rows.length, compensationPoints, points };
  });
}

async function deleteInventory(event, openid) {
  const userId = String(event.userId || '');
  const inventoryIds = uniqueIds(event.inventoryIds);
  if (!userId || !inventoryIds.length) {
    throw businessError('INVALID_ARGUMENT', '删除参数不完整');
  }

  return runInventoryRequest(event, openid, 'deleteInventory', async transaction => {
    await getOwnedUser(transaction, userId, openid);
    const releasePrizes = new Map();
    const rows = [];
    for (const inventoryId of inventoryIds) {
      const inventoryRef = transaction.collection(INVENTORY_COL).doc(inventoryId);
      const inventoryResult = await inventoryRef.get();
      const inventory = inventoryResult && inventoryResult.data;
      if (!inventory || inventory._openid !== openid) {
        throw businessError('INVALID_INVENTORY', '背包商品不存在或无权操作');
      }
      if (inventory.status !== 'in_backpack') {
        throw businessError('INVALID_STATUS', '只有背包中待确认的商品可以删除');
      }
      if (inventory.virtualType === 'theme') {
        throw businessError('THEME_DELETE_FORBIDDEN', '已解锁主题不能删除');
      }
      if (inventory.source === 'lottery' &&
          inventory.stockReserved === true &&
          inventory.lotteryPrizeId) {
        releasePrizes.set(
          inventory.lotteryPrizeId,
          (releasePrizes.get(inventory.lotteryPrizeId) || 0) + 1
        );
      }
      rows.push(inventoryRef);
    }
    for (const [prizeId, quantity] of releasePrizes.entries()) {
      const prizeRef = transaction.collection(LOTTERY_PRIZE_COL).doc(prizeId);
      const prizeResult = await prizeRef.get();
      const prize = prizeResult && prizeResult.data;
      if (prize) {
        await prizeRef.update({
          stock: Math.max(0, parseInt(prize.stock, 10) || 0) + quantity,
          updatedAt: Date.now()
        });
      }
    }
    for (const inventoryRef of rows) await inventoryRef.remove();
    return { deleted: rows.length };
  });
}

exports.main = async event => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = String(event.action || 'redeem');

  if (action === 'list') {
    try {
      const result = await db.collection(ITEM_COL).limit(100).get();
      return {
        code: 0,
        data: (result.data || []).filter(item => item.enabled !== false)
      };
    } catch (error) {
      console.error('[redeemItem] list failed:', error);
      return { code: 'ITEM_LIST_FAILED', msg: '商品列表加载失败，请稍后重试' };
    }
  }

  if (!openid) return { code: 'NOT_LOGGED_IN', msg: '无法获取用户身份' };
  if (action === 'confirmInventory' ||
      action === 'cancelInventory' ||
      action === 'deleteInventory') {
    try {
      let result;
      if (action === 'confirmInventory') result = await confirmInventory(event, openid);
      else if (action === 'cancelInventory') result = await cancelInventory(event, openid);
      else result = await deleteInventory(event, openid);
      return { code: 0, data: result && result.result ? result.result : result };
    } catch (error) {
      console.error('[redeemItem] inventory action failed:', action, error);
      return {
        code: error.businessCode || 'INVENTORY_ACTION_FAILED',
        msg: error.message || '背包操作失败，请重试'
      };
    }
  }

  const userId = String(event.userId || '');
  const itemId = String(event.itemId || '');
  const requestId = String(event.requestId || '');
  const paymentMethod = String(event.paymentMethod || 'points');
  const quantity = Math.max(1, Math.min(20, parseInt(event.quantity, 10) || 1));

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
        if (existingRequest.data._openid !== openid ||
            existingRequest.data.userId !== userId ||
            existingRequest.data.itemId !== itemId ||
            String(existingRequest.data.paymentMethod || 'points') !== paymentMethod ||
            Math.max(1, parseInt(existingRequest.data.quantity, 10) || 1) !== quantity) {
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
        await transaction.collection(RECORD_COL).doc(recordDocId).set(recordData);
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
          await transaction.collection(INVENTORY_COL).doc(inventoryDocId).set(inventoryData);
          inventoryIds.push(inventoryId);
        }
      }

      await userRef.update({
        totalPoints: nextPoints,
        makeUpCards: nextMakeUpCards,
        ownedThemes: nextThemes,
        themeVouchers: nextThemeVouchers
      });
      if (useThemeVoucher && voucherClaim) {
        const usedAmount = Math.max(0, parseInt(voucherClaim.usedAmount, 10) || 0) + 1;
        const rewardAmount = Math.max(1, parseInt(voucherClaim.rewardAmount, 10) || 1);
        await transaction.collection(BENEFIT_CLAIM_COL).doc(voucherClaim._id).update({
          usedAmount,
          status: usedAmount >= rewardAmount ? 'used' : 'partially_used',
          usedAt: new Date().toISOString(),
          usedThemeKey: item.virtualValue
        });
      }

      if (item.type === 'physical') {
        await itemRef.update({
          stock: (parseInt(item.stock, 10) || 0) - quantity
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
        _openid: openid,
        userId,
        itemId,
        paymentMethod,
        quantity,
        createdAt: now,
        result
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
