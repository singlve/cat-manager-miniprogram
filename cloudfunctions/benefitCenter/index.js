const cloud = require('wx-server-sdk');
const cloudbase = require('@cloudbase/node-sdk');
const { normalizeClaimDocument, enrichClaims } = require('./claim-utils');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const cloudDb = cloud.database();
const app = cloudbase.init({ env: cloudbase.SYMBOL_DEFAULT_ENV });
const db = app.database();

const USER_COL = 'users';
const CAMPAIGN_COL = 'benefit_campaigns';
const CLAIM_COL = 'benefit_claims';
const ITEM_COL = 'redeem_items';
const INVENTORY_COL = 'user_inventory';
const REDEEM_RECORD_COL = 'redeem_records';
const LEGACY_ADMIN_OPENID = 'oYBpx3ZRljxCk6pODSAyMShkyFJA';

const DEFAULT_CAMPAIGN = {
  _id: 'theme_launch_2026',
  title: '主题上线礼',
  desc: '领取 1 张主题兑换券，可任选一套价格不超过 1000 积分的主题永久解锁。',
  rewardType: 'theme_voucher',
  rewardAmount: 1,
  maxThemePoints: 1000,
  audience: 'all',
  enabled: true,
  sort: 10,
  startAt: '',
  endAt: '',
  createdAt: '2026-06-08T00:00:00.000Z',
  updatedAt: '2026-06-08T00:00:00.000Z'
};

function businessError(code, message) {
  const error = new Error(message);
  error.businessCode = code;
  return error;
}

function isTransactionBusy(error) {
  const text = [
    error && error.errCode,
    error && error.code,
    error && error.message,
    error && error.errMsg
  ].filter(Boolean).join(' ');
  return /TransactionBusy|ResourceUnavailable|DATABASE_TRANSACTION_FAIL|Transaction is busy/i.test(text);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTransactionWithRetry(handler, maxAttempts) {
  const attempts = Math.max(1, maxAttempts || 3);
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await db.runTransaction(handler);
    } catch (error) {
      lastError = error;
      if (!isTransactionBusy(error) || attempt === attempts) throw error;
      await wait(100 * attempt + Math.floor(Math.random() * 80));
    }
  }
  throw lastError;
}

function buildId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

function claimId(campaignId, userId) {
  return 'benefit_' + campaignId + '_' + userId;
}

function isCollectionMissing(error) {
  const text = [
    error && error.errCode,
    error && error.code,
    error && error.message,
    error && error.errMsg
  ].filter(Boolean).join(' ');
  return /DATABASE_COLLECTION_NOT_EXIST|COLLECTION_NOT_EXIST|collection not exists|Db or Table not exist|ResourceNotFound/i.test(text);
}

function isDocumentMissing(error) {
  const text = [
    error && error.errCode,
    error && error.code,
    error && error.message,
    error && error.errMsg
  ].filter(Boolean).join(' ');
  return /DATABASE_DOCUMENT_NOT_EXIST|DOCUMENT_NOT_EXIST|document not exists|document does not exist|doc not exist|not found/i.test(text);
}

async function repairNestedClaim(document) {
  if (!document || !document._id || !document.data || typeof document.data !== 'object') return;
  const normalized = normalizeClaimDocument(document);
  const { _id, ...data } = normalized;
  await cloudDb.collection(CLAIM_COL).doc(_id).set({ data });
}

async function getClaim(campaignId, userId) {
  try {
    const result = await cloudDb.collection(CLAIM_COL).doc(claimId(campaignId, userId)).get();
    const document = result && result.data;
    if (!document) return null;
    const claim = normalizeClaimDocument(document);
    await repairNestedClaim(document);
    return claim;
  } catch (error) {
    if (isDocumentMissing(error)) return null;
    throw error;
  }
}

async function ensureCollection(name) {
  try {
    await cloudDb.collection(name).limit(1).get();
  } catch (error) {
    if (!isCollectionMissing(error)) throw error;
    try {
      await cloudDb.createCollection(name);
    } catch (createError) {
      if (!/already exists|DATABASE_COLLECTION_EXIST|COLLECTION_EXIST/i.test(
        String(createError && (createError.message || createError.errMsg) || '')
      )) throw createError;
    }
  }
}

async function ensureData() {
  await ensureCollection(CAMPAIGN_COL);
  await ensureCollection(CLAIM_COL);
  try {
    const result = await cloudDb.collection(CAMPAIGN_COL).doc(DEFAULT_CAMPAIGN._id).get();
    if (result && result.data) return;
  } catch (error) {
    if (!isDocumentMissing(error)) throw error;
  }
  const { _id, ...data } = DEFAULT_CAMPAIGN;
  await cloudDb.collection(CAMPAIGN_COL).doc(_id).set({ data });
}

async function isServerAdmin(openid) {
  if (!openid) return false;
  const configured = String(process.env.ADMIN_OPENIDS || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (configured.indexOf(openid) !== -1 || openid === LEGACY_ADMIN_OPENID) return true;
  const result = await cloudDb.collection(USER_COL)
    .where({ _openid: openid, role: 'admin' }).limit(1).get();
  return !!(result.data && result.data.length);
}

async function getCurrentUser(openid) {
  const result = await cloudDb.collection(USER_COL).where({ _openid: openid }).limit(1).get();
  return result && result.data && result.data[0] ? result.data[0] : null;
}

async function ensureLegacyClaim(user) {
  if (!user || !Array.isArray(user.claimedBenefits) ||
      user.claimedBenefits.indexOf(DEFAULT_CAMPAIGN._id) === -1) return;
  const id = claimId(DEFAULT_CAMPAIGN._id, user._id);
  const old = await getClaim(DEFAULT_CAMPAIGN._id, user._id);
  if (old) return;
  const voucherCount = Math.max(0, parseInt(user.themeVouchers, 10) || 0);
  await cloudDb.collection(CLAIM_COL).doc(id).set({
    data: {
      _openid: user._openid,
      campaignId: DEFAULT_CAMPAIGN._id,
      campaignTitle: DEFAULT_CAMPAIGN.title,
      userId: user._id,
      userNickname: user.nickname || '',
      rewardType: 'theme_voucher',
      rewardAmount: 1,
      maxThemePoints: 1000,
      status: voucherCount > 0 ? 'unused' : 'used',
      usedAmount: voucherCount > 0 ? 0 : 1,
      claimedAt: user.lastBenefitClaimedAt || new Date().toISOString(),
      usedAt: voucherCount > 0 ? '' : new Date().toISOString(),
      usedThemeKey: ''
    }
  });
}

function normalizeThemes(value) {
  const themes = Array.isArray(value) ? value.slice() : [];
  if (themes.indexOf('default') === -1) themes.unshift('default');
  return Array.from(new Set(themes.filter(Boolean)));
}

function parseTime(value) {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function campaignState(campaign, user, claim, now) {
  const start = parseTime(campaign.startAt);
  const end = parseTime(campaign.endAt);
  const created = parseTime(user && (user.createdAt || user._createTime));
  const newUserSince = parseTime(campaign.newUserSince);
  let state = 'available';
  if (campaign.enabled === false) state = 'disabled';
  else if (start && now < start) state = 'upcoming';
  else if (end && now > end) state = 'expired';
  else if (campaign.audience === 'new' && newUserSince && (!created || created < newUserSince)) state = 'ineligible';
  else if (claim) state = claim.status === 'used' ? 'used' : 'claimed';
  return state;
}

function publicCampaign(campaign, user, claim) {
  const state = campaignState(campaign, user, claim, Date.now());
  return Object.assign({}, campaign, {
    state,
    canClaim: state === 'available',
    claim: claim || null
  });
}

function normalizeCampaign(input) {
  const allowedRewards = ['points', 'card', 'theme_voucher', 'theme', 'draw', 'physical'];
  const rewardType = allowedRewards.indexOf(input.rewardType) !== -1
    ? input.rewardType
    : 'points';
  const amountLimit = rewardType === 'points'
    ? 1000000
    : (rewardType === 'physical' ? 20 : 100);
  return {
    title: String(input.title || '').trim(),
    desc: String(input.desc || '').trim(),
    rewardType,
    rewardAmount: Math.min(amountLimit, Math.max(1, parseInt(input.rewardAmount, 10) || 1)),
    maxThemePoints: rewardType === 'theme_voucher'
      ? Math.max(1, parseInt(input.maxThemePoints, 10) || 1000)
      : 0,
    themeKey: rewardType === 'theme' ? String(input.themeKey || '') : '',
    linkedItemId: rewardType === 'physical' ? String(input.linkedItemId || '') : '',
    audience: input.audience === 'new' ? 'new' : 'all',
    newUserSince: input.audience === 'new' ? String(input.newUserSince || '') : '',
    startAt: String(input.startAt || ''),
    endAt: String(input.endAt || ''),
    enabled: input.enabled !== false,
    sort: parseInt(input.sort, 10) || 0,
    updatedAt: new Date().toISOString()
  };
}

async function listForUser(user, knownClaim) {
  const [campaignResult, claimResult, nestedClaimResult] = await Promise.all([
    cloudDb.collection(CAMPAIGN_COL).orderBy('sort', 'asc').limit(100).get(),
    cloudDb.collection(CLAIM_COL).where({ userId: user._id }).limit(100).get(),
    cloudDb.collection(CLAIM_COL).where({ 'data.userId': user._id }).limit(100).get()
      .catch(() => ({ data: [] }))
  ]);
  const rawClaims = (claimResult.data || []).concat(nestedClaimResult.data || []);
  const claimDocuments = [];
  const seenClaimIds = {};
  rawClaims.forEach(document => {
    const id = document && document._id;
    if (id && seenClaimIds[id]) return;
    if (id) seenClaimIds[id] = true;
    claimDocuments.push(document);
  });
  const claims = claimDocuments.map(normalizeClaimDocument).filter(Boolean).sort((left, right) =>
    String(right.claimedAt || '').localeCompare(String(left.claimedAt || ''))
  );
  const normalizedKnownClaim = normalizeClaimDocument(knownClaim);
  if (normalizedKnownClaim &&
      !claims.some(item => item.campaignId === normalizedKnownClaim.campaignId)) {
    claims.unshift(normalizedKnownClaim);
  }
  const campaignsRaw = campaignResult.data || [];
  const campaignMap = {};
  campaignsRaw.forEach(item => { campaignMap[item._id] = item; });
  const enrichedClaims = enrichClaims(claims, campaignMap);
  await Promise.all(claimDocuments.map(repairNestedClaim));
  const claimMap = {};
  enrichedClaims.forEach(item => { claimMap[item.campaignId] = item; });
  const campaigns = campaignsRaw
    .map(item => publicCampaign(item, user, claimMap[item._id]))
    .filter(item => item.state !== 'disabled' && item.state !== 'ineligible');
  const themeVouchers = Math.max(0, parseInt(user.themeVouchers, 10) || 0);
  const activeVoucherClaims = enrichedClaims.filter(item => item.rewardType === 'theme_voucher' &&
    (item.status === 'unused' || item.status === 'partially_used'));
  const trackedVoucherCount = activeVoucherClaims
    .reduce((total, item) => total + Math.max(
      0,
      (parseInt(item.rewardAmount, 10) || 1) - (parseInt(item.usedAmount, 10) || 0)
    ), 0);
  let voucherMaxPoints = activeVoucherClaims
    .reduce((max, item) => Math.max(max, parseInt(item.maxThemePoints, 10) || 1000), 0);
  if (themeVouchers > trackedVoucherCount) {
    voucherMaxPoints = Math.max(voucherMaxPoints, 1000);
  }
  return {
    campaigns,
    claims: enrichedClaims,
    themeVouchers,
    voucherMaxPoints: themeVouchers > 0 ? voucherMaxPoints : 0,
    pendingClaims: campaigns.filter(item => item.canClaim).length,
    pendingUses: themeVouchers
  };
}

async function grantReward(transaction, campaign, user, openid, now) {
  const userRef = transaction.collection(USER_COL).doc(user._id);
  const updates = {};
  const rewardType = campaign.rewardType;
  const amount = Math.max(1, parseInt(campaign.rewardAmount, 10) || 1);
  let claimStatus = 'fulfilled';
  let inventoryId = '';
  const inventoryIds = [];

  if (rewardType === 'points') {
    updates.totalPoints = Math.max(0, parseInt(user.totalPoints, 10) || 0) + amount;
  } else if (rewardType === 'card') {
    updates.makeUpCards = Math.max(0, parseInt(user.makeUpCards, 10) || 0) + amount;
  } else if (rewardType === 'theme_voucher') {
    updates.themeVouchers = Math.max(0, parseInt(user.themeVouchers, 10) || 0) + amount;
    claimStatus = 'unused';
  } else if (rewardType === 'theme') {
    updates.ownedThemes = normalizeThemes((user.ownedThemes || []).concat(campaign.themeKey));
  } else if (rewardType === 'draw') {
    updates.bonusLotteryDraws = Math.max(0, parseInt(user.bonusLotteryDraws, 10) || 0) + amount;
  } else if (rewardType === 'physical') {
    const itemResult = await transaction.collection(ITEM_COL).doc(campaign.linkedItemId).get();
    const item = itemResult && itemResult.data;
    if (!item || item.type !== 'physical') {
      throw businessError('ITEM_UNAVAILABLE', '福利关联的实物商品不存在');
    }
    const stock = Math.max(0, parseInt(item.stock, 10) || 0);
    if (stock < amount) throw businessError('STOCK_NOT_ENOUGH', '福利实物库存不足');
    for (let index = 0; index < amount; index++) {
      const recordId = buildId('benefit_rec');
      const currentInventoryId = buildId('benefit_inv');
      if (!inventoryId) inventoryId = currentInventoryId;
      inventoryIds.push(currentInventoryId);
      await transaction.collection(REDEEM_RECORD_COL).doc(recordId).set({
        data: {
          _openid: openid,
          itemId: item._id,
          itemName: item.name,
          itemType: 'physical',
          pointsSpent: 0,
          userNickname: user.nickname || '',
          openid,
          redeemedAt: now,
          status: 'in_backpack',
          source: 'benefit',
          benefitCampaignId: campaign._id,
          inventoryId: currentInventoryId
        }
      });
      await transaction.collection(INVENTORY_COL).doc(currentInventoryId).set({
        data: {
          _openid: openid,
          itemId: item._id,
          itemName: item.name,
          itemType: 'physical',
          image: item.image || '',
          pointsSpent: 0,
          ownedAt: now,
          status: 'in_backpack',
          source: 'benefit',
          benefitCampaignId: campaign._id,
          redeemRecordId: recordId
        }
      });
    }
    await transaction.collection(ITEM_COL).doc(item._id).update({
      data: { stock: stock - amount }
    });
  }

  if (Object.keys(updates).length) await userRef.update({ data: updates });
  return { updates, claimStatus, inventoryId, inventoryIds };
}

exports.main = async event => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = String(event && event.action || 'listActive');

  try {
    await ensureData();

    const adminActions = ['adminList', 'adminSave', 'adminToggle', 'adminDelete', 'adminClaims'];
    if (adminActions.indexOf(action) !== -1) {
      if (!(await isServerAdmin(openid))) {
        return { code: 'FORBIDDEN', msg: '无管理员权限' };
      }
      if (action === 'adminList') {
        const result = await cloudDb.collection(CAMPAIGN_COL).orderBy('sort', 'asc').limit(100).get();
        return { code: 0, data: result.data || [] };
      }
      if (action === 'adminClaims') {
        const [claimResult, campaignResult] = await Promise.all([
          cloudDb.collection(CLAIM_COL).limit(200).get(),
          cloudDb.collection(CAMPAIGN_COL).limit(100).get()
        ]);
        const documents = claimResult.data || [];
        const campaignMap = {};
        (campaignResult.data || []).forEach(item => { campaignMap[item._id] = item; });
        const claims = enrichClaims(
          documents.map(normalizeClaimDocument).filter(Boolean),
          campaignMap
        ).sort((left, right) =>
          String(right.claimedAt || '').localeCompare(String(left.claimedAt || ''))
        );
        await Promise.all(documents.map(repairNestedClaim));
        return { code: 0, data: claims };
      }
      if (action === 'adminSave') {
        const campaign = normalizeCampaign(event.campaign || {});
        if (!campaign.title) return { code: 'INVALID_TITLE', msg: '请输入福利名称' };
        if (campaign.rewardType === 'theme' && !campaign.themeKey) {
          return { code: 'INVALID_THEME', msg: '请选择指定主题' };
        }
        if (campaign.rewardType === 'physical' && !campaign.linkedItemId) {
          return { code: 'INVALID_ITEM', msg: '请选择实物商品' };
        }
        if (campaign.startAt && campaign.endAt &&
            parseTime(campaign.startAt) >= parseTime(campaign.endAt)) {
          return { code: 'INVALID_TIME', msg: '结束时间必须晚于开始时间' };
        }
        if (event.id) {
          await cloudDb.collection(CAMPAIGN_COL).doc(event.id).update({ data: campaign });
          return { code: 0, id: event.id };
        }
        campaign.createdAt = new Date().toISOString();
        const result = await cloudDb.collection(CAMPAIGN_COL).add({ data: campaign });
        return { code: 0, id: result._id };
      }
      if (action === 'adminToggle') {
        await cloudDb.collection(CAMPAIGN_COL).doc(event.id).update({
          data: { enabled: !!event.enabled, updatedAt: new Date().toISOString() }
        });
        return { code: 0 };
      }
      if (action === 'adminDelete') {
        const claims = await cloudDb.collection(CLAIM_COL).where({ campaignId: event.id }).limit(1).get();
        if (claims.data && claims.data.length) {
          return { code: 'CAMPAIGN_CLAIMED', msg: '已有用户领取，建议停用而不是删除' };
        }
        await cloudDb.collection(CAMPAIGN_COL).doc(event.id).remove();
        return { code: 0 };
      }
    }

    if (!openid) return { code: 'NOT_LOGGED_IN', msg: '请先登录' };
    const currentUser = await getCurrentUser(openid);
    if (!currentUser) return { code: 'USER_NOT_FOUND', msg: '用户信息不存在' };
    await ensureLegacyClaim(currentUser);

    if (action === 'listActive' || action === 'status') {
      return { code: 0, data: await listForUser(currentUser) };
    }

    if (action !== 'claim') return { code: 'INVALID_ACTION', msg: '不支持的操作' };
    const campaignId = String(event.campaignId || '');
    if (!campaignId) return { code: 'INVALID_CAMPAIGN', msg: '缺少福利活动' };

    const existingClaim = await getClaim(campaignId, currentUser._id);
    let transactionResult;
    if (existingClaim) {
      transactionResult = { alreadyClaimed: true, claim: existingClaim };
    } else {
      try {
        transactionResult = await runTransactionWithRetry(async transaction => {
          const userRef = transaction.collection(USER_COL).doc(currentUser._id);
          const campaignRef = transaction.collection(CAMPAIGN_COL).doc(campaignId);
          const claimRef = transaction.collection(CLAIM_COL).doc(claimId(campaignId, currentUser._id));
          const userResult = await userRef.get();
          const campaignResult = await campaignRef.get();
          const user = userResult && userResult.data;
          const campaign = campaignResult && campaignResult.data;
          if (!user || user._openid !== openid) throw businessError('USER_NOT_FOUND', '用户信息不存在');
          if (!campaign) throw businessError('CAMPAIGN_NOT_FOUND', '福利活动不存在');

          let oldClaim = null;
          try {
            const oldClaimResult = await claimRef.get();
            oldClaim = oldClaimResult && oldClaimResult.data;
          } catch (error) {
            if (!isDocumentMissing(error)) throw error;
          }
          if (oldClaim) return { alreadyClaimed: true, claim: oldClaim };

          const state = campaignState(campaign, user, null, Date.now());
          if (state !== 'available') {
            const messages = {
              upcoming: '福利活动尚未开始',
              expired: '福利活动已结束',
              disabled: '福利活动暂未开放',
              ineligible: '当前账号不符合领取条件'
            };
            throw businessError('CAMPAIGN_' + state.toUpperCase(), messages[state] || '暂时无法领取');
          }

          const now = new Date().toISOString();
          const granted = await grantReward(transaction, campaign, user, openid, now);
          const claim = {
            _openid: openid,
            campaignId,
            campaignTitle: campaign.title,
            userId: user._id,
            userNickname: user.nickname || '',
            rewardType: campaign.rewardType,
            rewardAmount: campaign.rewardAmount,
            maxThemePoints: campaign.maxThemePoints || 0,
            themeKey: campaign.themeKey || '',
            linkedItemId: campaign.linkedItemId || '',
            inventoryId: granted.inventoryId,
            inventoryIds: granted.inventoryIds,
            status: granted.claimStatus,
            usedAmount: 0,
            claimedAt: now,
            usedAt: '',
            usedThemeKey: ''
          };
          await claimRef.set(claim);
          return { alreadyClaimed: false, claim, updates: granted.updates };
        }, 3);
      } catch (error) {
        if (!isTransactionBusy(error)) throw error;
        const recoveredClaim = await getClaim(campaignId, currentUser._id);
        if (!recoveredClaim) throw error;
        transactionResult = { alreadyClaimed: true, claim: recoveredClaim };
      }
    }

    const result = transactionResult && transactionResult.result
      ? transactionResult.result
      : transactionResult;
    const refreshedUser = await getCurrentUser(openid);
    return {
      code: 0,
      data: Object.assign({}, await listForUser(refreshedUser, result.claim), {
        alreadyClaimed: !!result.alreadyClaimed,
        latestClaim: result.claim
      })
    };
  } catch (error) {
    console.error('[benefitCenter] failed:', error);
    const transactionBusy = isTransactionBusy(error);
    return {
      code: error.businessCode || (transactionBusy ? 'TRANSACTION_BUSY' : 'BENEFIT_FAILED'),
      msg: transactionBusy ? '领取人数较多，请稍后再试' : (error.message || '福利操作失败，请重试')
    };
  }
};
