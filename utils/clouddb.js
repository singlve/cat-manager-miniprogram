// utils/clouddb.js
// 云数据库工具层：云开发 + 本地存储自动降级
// 所有页面统一通过此模块操作数据，无需关心底层数据源
const { parseDate } = require('./util.js');
const { getThemeProducts } = require('./themes.js');
const { markDataDirty } = require('./data-cache.js');

// ⚙️ 调试开关：true=强制本地模式，false=自动判断（云环境ID配好后走云端）
const FORCE_LOCAL = false;  // 调试开关：true 强制本地模式，false 自动判断

// 集合名常量
const CAT_COL    = 'cats';
const RECORD_COL = 'health_records';
const REMIND_COL = 'reminders';
const WEIGHT_COL = 'weight_records';
const USER_COL   = 'users';
const INVENTORY_COL = 'user_inventory';
const AVATAR_FRAME_COL = 'avatar_frames';
const REDEEM_ITEM_COL = 'redeem_items';
const REDEEM_RECORD_COL = 'redeem_records';
const SHIPPING_ADDRESS_COL = 'shipping_addresses';
const EXPENSE_COL = 'expenses';
const FEEDBACK_COL = 'feedback';
const NOTIFY_COL = 'notifications';
const SERVICE_CACHE_TTL = 30 * 1000;
let announcementCache = null;
let announcementRequest = null;
const notifyCountCache = Object.create(null);
const notifyCountRequests = Object.create(null);

// ════════════════════════════════════════════════════
// 基础：判断云开发是否可用
// ════════════════════════════════════════════════════
function isCloudReady() {
  if (FORCE_LOCAL) return false;
  try {
    const app = getApp();
    return !!(app.globalData && app.globalData.cloudReady);
  } catch (e) { return false; }
}

// 本地 storage 引用（懒加载）
function _storage() { return require('./storage.js'); }

// ════════════════════════════════════════════════════
// 获取当前用户 openid
// ════════════════════════════════════════════════════
function _getCurrentOpenid() {
  const app = getApp();
  return app && app.globalData && app.globalData.openid;
}

// ════════════════════════════════════════════════════
// 通用云操作（自动注入 _openid 过滤 - 注意：客户端只能查自己的 openid）
// ════════════════════════════════════════════════════
async function _cloudQuery(collection, query = {}, options = {}) {
  const db = wx.cloud.database();
  let q = db.collection(collection).where(query);
  if (options.orderBy) q = q.orderBy(options.orderBy, options.orderDesc || 'desc');
  if (options.skip) q = q.skip(options.skip);
  if (options.limit) q = q.limit(options.limit);
  const { data } = await q.get();
  return data || [];
}

async function _cloudQueryAll(collection, query = {}, options = {}) {
  const pageSize = Math.min(options.pageSize || 20, 20);
  const maxRows = options.maxRows || 1000;
  let rows = [];
  let skip = 0;
  while (rows.length < maxRows) {
    const page = await _cloudQuery(collection, query, {
      ...options,
      skip,
      limit: Math.min(pageSize, maxRows - rows.length)
    });
    rows = rows.concat(page);
    if (page.length < pageSize) break;
    skip += page.length;
  }
  return rows;
}

async function _cloudAdd(collection, data) {
  // 云数据库禁止客户端写入 _openid（系统保留字段），写入前过滤掉
  const { _openid, ...cloudData } = data;
  const res = await wx.cloud.database().collection(collection).add({ data: cloudData });
  return res._id;
}

async function _cloudUpdate(collection, id, updates) {
  // 云数据库禁止客户端写入 _openid（系统保留字段），更新前过滤掉
  const { _openid, ...safeUpdates } = updates;
  await wx.cloud.database().collection(collection).doc(id).update({ data: safeUpdates });
}

async function _cloudDelete(collection, id) {
  try {
    await wx.cloud.database().collection(collection).doc(id).remove();
  } catch (e) {
    // 文档不存在时忽略（-502003 或 remove fail）
    if (!e.message || !e.message.includes('remove')) throw e;
  }
}

async function _cloudSet(collection, id, data) {
  const { _id, _openid, ...safeData } = data;
  await wx.cloud.database().collection(collection).doc(id).set({ data: safeData });
}

// ════════════════════════════════════════════════════
// 宠物档案（CATS）
// ════════════════════════════════════════════════════

// 猫咪列表缓存 TTL（5 分钟）
const CAT_CACHE_TTL = 5 * 60 * 1000;

async function getCats() {
  if (!isCloudReady()) return _storage().getCats() || [];

  // 检查全局缓存
  try {
    const app = getApp();
    const cache = app.globalData && app.globalData.catsCache;
    const now = Date.now();
    if (cache && cache.data && (now - cache.ts) < CAT_CACHE_TTL) {
      return cache.data.slice(); // 返回副本，防止调用方污染缓存
    }
  } catch (e) { /* 缓存不可用时回退到直接查询 */ }

  const cats = await _cloudQueryAll(CAT_COL, {}, {
    orderBy: '_createTime',
    orderDesc: 'desc',
    maxRows: 200
  });

  // 写入缓存
  try {
    const app = getApp();
    if (app.globalData) {
      app.globalData.catsCache = { data: cats, ts: Date.now() };
    }
  } catch (e) { /* 忽略 */ }

  return cats;
}

function _cacheCats(cats) {
  try {
    const app = getApp();
    if (app.globalData) app.globalData.catsCache = { data: cats, ts: Date.now() };
  } catch (e) {}
}

async function getHomeOverview() {
  if (isCloudReady()) {
    try {
      const result = await wx.cloud.callFunction({ name: 'getHomeOverview' });
      if (result.result && result.result.code === 0 && result.result.data) {
        const data = result.result.data;
        _cacheCats(data.cats || []);
        return data;
      }
    } catch (e) {
      console.warn('[clouddb] getHomeOverview fallback:', e);
    }
  }

  const [cats, records, reminders] = await Promise.all([
    getCats(),
    getRecords(),
    getReminders()
  ]);
  const latestRecordByCat = {};
  records.forEach(function(record) {
    if (!latestRecordByCat[record.catId] || record.date > latestRecordByCat[record.catId]) {
      latestRecordByCat[record.catId] = record.date;
    }
  });
  return {
    cats,
    latestRecordByCat,
    recentRecords: records.slice().sort(function(a, b) {
      return parseDate(b.date) - parseDate(a.date);
    }).slice(0, 3),
    reminders
  };
}

async function getCatById(id) {
  if (!isCloudReady()) {
    const cats = _storage().getCats() || [];
    return cats.find(c => c._id === id) || null;
  }
  try {
    const { data } = await wx.cloud.database().collection(CAT_COL).doc(id).get();
    return data;
  } catch (e) { return null; }
}

/** 使猫咪列表缓存失效（增删改猫咪后调用） */
function refreshCatsCache() {
  try {
    const app = getApp();
    if (app.globalData) {
      app.globalData.catsCache = { data: null, ts: 0 };
    }
  } catch (e) { /* 忽略 */ }
}

async function addCat(cat) {
  if (!isCloudReady()) { _storage().addCat(cat); markDataDirty('cats'); return cat._id; }
  const id = await _cloudAdd(CAT_COL, { ...cat, _createTime: Date.now() });
  refreshCatsCache();
  markDataDirty('cats');
  return id;
}

async function updateCat(id, updates) {
  if (!isCloudReady()) { _storage().updateCat(id, updates); markDataDirty('cats'); return; }
  await _cloudUpdate(CAT_COL, id, updates);
  refreshCatsCache();
  markDataDirty('cats');
}

async function deleteCat(id) {
  if (!isCloudReady()) {
    _storage().removeCat(id);
    markDataDirty(['cats', 'records', 'weights', 'reminders', 'expenses']);
    return;
  }
  const result = await wx.cloud.callFunction({
    name: 'deletePet',
    data: { catId: id }
  });
  if (!result.result || result.result.code !== 0) {
    throw new Error((result.result && result.result.msg) || '删除宠物失败');
  }
  refreshCatsCache();
  markDataDirty(['cats', 'records', 'weights', 'reminders', 'expenses']);
}

// ════════════════════════════════════════════════════
// 健康记录（HEALTH RECORDS）
// ════════════════════════════════════════════════════

async function getRecords(filter = {}, options = {}) {
  if (!isCloudReady()) {
    let records = _storage().getRecords() || [];
    if (filter.catId) records = records.filter(r => r.catId === filter.catId);
    records.sort((a, b) => parseDate(b.date) - parseDate(a.date));
    if (options.skip) records = records.slice(options.skip);
    if (options.limit) records = records.slice(0, options.limit);
    return records;
  }
  const mergedOpts = { orderBy: 'date', orderDesc: 'desc', ...options };
  return await _cloudQuery(RECORD_COL, filter, mergedOpts);
}

async function addRecord(record) {
  if (!isCloudReady()) { _storage().addRecord(record); markDataDirty('records'); return record._id; }
  const id = await _cloudAdd(RECORD_COL, { ...record, _createTime: Date.now() });
  markDataDirty('records');
  return id;
}

async function updateRecord(id, updates) {
  if (!isCloudReady()) { _storage().updateRecord(id, updates); markDataDirty('records'); return; }
  await _cloudUpdate(RECORD_COL, id, updates);
  markDataDirty('records');
}

async function deleteRecord(id) {
  if (!isCloudReady()) { _storage().deleteRecord(id); markDataDirty('records'); return; }
  await _cloudDelete(RECORD_COL, id);
  markDataDirty('records');
}

// ════════════════════════════════════════════════════
// 体重记录（WEIGHT RECORDS）
// ════════════════════════════════════════════════════

async function getWeightRecords(filter = {}, options = {}) {
  if (!isCloudReady()) {
    let records = _storage().getWeightRecords ? _storage().getWeightRecords() : [];
    if (filter.catId) records = records.filter(r => r.catId === filter.catId);
    records.sort((a, b) => parseDate(b.date) - parseDate(a.date));
    if (options.skip) records = records.slice(options.skip);
    if (options.limit) records = records.slice(0, options.limit);
    return records;
  }
  const mergedOpts = { orderBy: 'date', orderDesc: 'desc', ...options };
  return await _cloudQuery(WEIGHT_COL, filter, mergedOpts);
}

async function addWeightRecord(record) {
  if (!isCloudReady()) {
    if (_storage().addWeightRecord) _storage().addWeightRecord(record);
    markDataDirty('weights');
    return record._id;
  }
  const id = await _cloudAdd(WEIGHT_COL, { ...record, _createTime: Date.now() });
  markDataDirty('weights');
  return id;
}

async function updateWeightRecord(id, updates) {
  if (!isCloudReady()) {
    if (_storage().updateWeightRecord) _storage().updateWeightRecord(id, updates);
    markDataDirty('weights');
    return;
  }
  await _cloudUpdate(WEIGHT_COL, id, updates);
  markDataDirty('weights');
}

async function deleteWeightRecord(id) {
  if (!isCloudReady()) {
    if (_storage().deleteWeightRecord) _storage().deleteWeightRecord(id);
    markDataDirty('weights');
    return;
  }
  await _cloudDelete(WEIGHT_COL, id);
  markDataDirty('weights');
}

// ════════════════════════════════════════════════════
// 提醒（REMINDERS）
// ════════════════════════════════════════════════════

async function getReminders(filter = {}) {
  if (!isCloudReady()) {
    const reminders = _storage().getReminders();
    if (filter.catId) return reminders.filter(r => r.catId === filter.catId);
    return reminders;
  }
  return await _cloudQueryAll(REMIND_COL, filter, {
    orderBy: '_createTime',
    orderDesc: 'desc',
    maxRows: 1000
  });
}

async function addReminder(reminder) {
  if (!isCloudReady()) { _storage().addReminder(reminder); markDataDirty('reminders'); return reminder._id; }
  const id = await _cloudAdd(REMIND_COL, { ...reminder, _createTime: Date.now() });
  markDataDirty('reminders');
  return id;
}

async function updateReminder(id, updates) {
  if (!isCloudReady()) { _storage().updateReminder(id, updates); markDataDirty('reminders'); return; }
  await _cloudUpdate(REMIND_COL, id, updates);
  markDataDirty('reminders');
}

async function deleteReminder(id) {
  if (!isCloudReady()) { _storage().deleteReminder(id); markDataDirty('reminders'); return; }
  await _cloudDelete(REMIND_COL, id);
  markDataDirty('reminders');
}

// ════════════════════════════════════════════════════
// 用户（USERS）
// ════════════════════════════════════════════════════

async function getUserByOpenid(openid) {
  if (!isCloudReady()) return null;
  if (!openid) return null;
  try {
    // _openid 是系统保留字段，只读可查（不能写入）
    const data = await _cloudQuery(USER_COL, { _openid: openid });
    return data.length > 0 ? data[0] : null;
  } catch (e) {
    console.error('[clouddb] getUserByOpenid error:', e);
    return null;
  }
}

async function getUserById(id) {
  if (!isCloudReady()) return null;
  if (!id) return null;
  try {
    const data = await _cloudQuery(USER_COL, { _id: id });
    return data.length > 0 ? data[0] : null;
  } catch (e) {
    console.error('[clouddb] getUserById error:', e);
    return null;
  }
}

async function getUserByPhone(phone) {
  if (!isCloudReady()) return null;
  const data = await _cloudQuery(USER_COL, { phone: phone });
  return data.length > 0 ? data[0] : null;
}

async function addUser(user) {
  if (!isCloudReady()) return null;
  // 注意：_openid 由平台自动注入到文档（基于创建者的身份），不能手动写入
  // 直接在 _cloudAdd 调用前过滤掉，确保即使 _cloudAdd 通用过滤失效时也能保护
  const { _openid, ...userData } = user;
  return await _cloudAdd(USER_COL, { ...userData, _createTime: Date.now() });
}

async function updateUser(id, updates) {
  if (!isCloudReady()) return;
  const res = await wx.cloud.callFunction({
    name: 'userAccount',
    data: { action: 'updateFields', userId: id, updates: updates || {} }
  });
  const result = res.result || {};
  if (result.code !== 0) {
    const error = new Error(result.msg || '用户资料更新失败');
    error.code = result.code;
    throw error;
  }
  return result.data;
}

function _assetRequestId(action) {
  return action + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

async function callUserAssetAction(action, params) {
  params = params || {};
  if (!isCloudReady()) throw new Error('云开发不可用，无法修改账户资产');
  const res = await wx.cloud.callFunction({
    name: 'userAccount',
    data: Object.assign({}, params, {
      action: action,
      requestId: params.requestId || _assetRequestId(action)
    })
  });
  const result = res.result || {};
  if (result.code !== 0) {
    const error = new Error(result.msg || '操作失败，请重试');
    error.code = result.code;
    throw error;
  }
  return result.data;
}

async function checkInAtomic(userId, requestId) {
  return callUserAssetAction('checkIn', { userId, requestId });
}

async function makeUpAtomic(userId, date, requestId) {
  return callUserAssetAction('makeUp', { userId, date, requestId });
}

async function claimShareRewardAtomic(userId, shareType, requestId) {
  return callUserAssetAction('shareReward', { userId, shareType, requestId });
}

async function searchUsers(type, keyword) {
  if (!isCloudReady()) return [];
  try {
    const res = await wx.cloud.callFunction({
      name: 'adminUsers',
      data: { action: 'search', type, keyword }
    });
    if (res.result && res.result.code === 0) {
      return res.result.data || [];
    }
    throw new Error((res.result && res.result.msg) || '搜索失败');
  } catch (e) {
    console.error('[clouddb] searchUsers error:', e);
    throw e;
  }
}

async function adminUpdateUser(userId, updates) {
  if (!isCloudReady()) throw new Error('云开发不可用');
  const res = await wx.cloud.callFunction({
    name: 'adminUsers',
    data: { action: 'update', userId, updates }
  });
  if (res.result && res.result.code === 0) {
    return res.result;
  }
  throw new Error((res.result && res.result.msg) || '更新失败');
}

async function getBenefitStatus() {
  if (!isCloudReady()) {
    const user = wx.getStorageSync('currentUser') || {};
    const claimed = Array.isArray(user.claimedBenefits) &&
      user.claimedBenefits.indexOf('theme_launch_2026') !== -1;
    return {
      campaigns: [{
        _id: 'theme_launch_2026',
        title: '主题上线礼',
        desc: '领取 1 张主题兑换券，可任选一套价格不超过 1000 积分的主题永久解锁。',
        rewardType: 'theme_voucher',
        rewardAmount: 1,
        maxThemePoints: 1000,
        state: claimed
          ? ((parseInt(user.themeVouchers, 10) || 0) > 0 ? 'claimed' : 'used')
          : 'available',
        canClaim: !claimed,
        claim: claimed ? { status: (parseInt(user.themeVouchers, 10) || 0) > 0 ? 'unused' : 'used' } : null
      }],
      claims: [],
      themeVouchers: Math.max(0, parseInt(user.themeVouchers, 10) || 0),
      voucherMaxPoints: (parseInt(user.themeVouchers, 10) || 0) > 0 ? 1000 : 0,
      pendingClaims: claimed ? 0 : 1,
      pendingUses: Math.max(0, parseInt(user.themeVouchers, 10) || 0)
    };
  }
  const res = await wx.cloud.callFunction({
    name: 'benefitCenter',
    data: { action: 'listActive' }
  });
  const result = res.result || {};
  if (result.code !== 0) throw new Error(result.msg || '福利状态加载失败');
  return result.data;
}

async function claimBenefit(campaignId) {
  if (!isCloudReady()) {
    const user = wx.getStorageSync('currentUser') || {};
    const claimedBenefits = Array.from(new Set(user.claimedBenefits || []));
    const alreadyClaimed = claimedBenefits.indexOf('theme_launch_2026') !== -1;
    if (!alreadyClaimed) {
      claimedBenefits.push('theme_launch_2026');
      user.claimedBenefits = claimedBenefits;
      user.themeVouchers = Math.max(0, parseInt(user.themeVouchers, 10) || 0) + 1;
      wx.setStorageSync('currentUser', user);
    }
    return Object.assign(await getBenefitStatus(), { alreadyClaimed });
  }
  const res = await wx.cloud.callFunction({
    name: 'benefitCenter',
    data: { action: 'claim', campaignId: campaignId }
  });
  const result = res.result || {};
  if (result.code !== 0) throw new Error(result.msg || '福利领取失败');
  return result.data;
}

async function getBenefitCampaignsAdmin() {
  if (!isCloudReady()) return [];
  const res = await wx.cloud.callFunction({
    name: 'benefitCenter',
    data: { action: 'adminList' }
  });
  const result = res.result || {};
  if (result.code !== 0) throw new Error(result.msg || '福利配置加载失败');
  return result.data || [];
}

async function previewBenefitAudience(campaign) {
  if (!isCloudReady()) return { eligibleUsers: 0 };
  const res = await wx.cloud.callFunction({
    name: 'benefitCenter',
    data: { action: 'adminPreview', campaign: campaign }
  });
  const result = res.result || {};
  if (result.code !== 0) throw new Error(result.msg || '适用人数预估失败');
  return result.data || { eligibleUsers: 0 };
}

async function getBenefitClaimsAdmin() {
  if (!isCloudReady()) return [];
  const res = await wx.cloud.callFunction({
    name: 'benefitCenter',
    data: { action: 'adminClaims' }
  });
  const result = res.result || {};
  if (result.code !== 0) throw new Error(result.msg || '领取记录加载失败');
  return result.data || [];
}

async function saveBenefitCampaign(id, campaign) {
  if (!isCloudReady()) throw new Error('云开发不可用');
  const res = await wx.cloud.callFunction({
    name: 'benefitCenter',
    data: { action: 'adminSave', id: id || '', campaign: campaign }
  });
  const result = res.result || {};
  if (result.code !== 0) throw new Error(result.msg || '福利配置保存失败');
  return result;
}

async function toggleBenefitCampaign(id, enabled) {
  if (!isCloudReady()) throw new Error('云开发不可用');
  const res = await wx.cloud.callFunction({
    name: 'benefitCenter',
    data: { action: 'adminToggle', id: id, enabled: enabled }
  });
  const result = res.result || {};
  if (result.code !== 0) throw new Error(result.msg || '福利状态更新失败');
  return result;
}

async function deleteBenefitCampaign(id) {
  if (!isCloudReady()) throw new Error('云开发不可用');
  const res = await wx.cloud.callFunction({
    name: 'benefitCenter',
    data: { action: 'adminDelete', id: id }
  });
  const result = res.result || {};
  if (result.code !== 0) throw new Error(result.msg || '福利删除失败');
  return result;
}

// ════════════════════════════════════════════════════
// 云存储：头像上传
// ════════════════════════════════════════════════════

async function uploadAvatar(tempFilePath, catId) {
  if (!isCloudReady()) return _storage().copyAvatarSync(tempFilePath, catId);
  const ext = tempFilePath.split('.').pop() || 'jpg';
  const cloudPath = `avatars/${catId}_${Date.now()}.${ext}`;
  try {
    const res = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath });
    // UGC 图片安全校验
    var imgCheck = await checkImageSafe(res.fileID);
    if (imgCheck.code !== 0) {
      // 校验不通过，删除已上传的云文件
      try { await wx.cloud.deleteFile({ fileList: [res.fileID] }); } catch (e) {}
      return null;
    }
    return res.fileID;
  } catch (e) {
    console.error('[clouddb] upload avatar failed:', e);
    return _storage().copyAvatarSync(tempFilePath, catId);
  }
}

const AVATAR_URL_CACHE_TTL = 50 * 60 * 1000;
const AVATAR_URL_BATCH_SIZE = 50;
const avatarUrlCache = new Map();

async function getAvatarUrls(fileIds) {
  const ids = Array.from(new Set((fileIds || []).filter(Boolean)));
  const urls = {};
  const pendingCloudIds = [];
  const now = Date.now();

  ids.forEach(function(fileId) {
    if (!fileId.startsWith('cloud://') || !isCloudReady()) {
      urls[fileId] = fileId;
      return;
    }
    const cached = avatarUrlCache.get(fileId);
    if (cached && now - cached.ts < AVATAR_URL_CACHE_TTL) {
      urls[fileId] = cached.url;
      return;
    }
    pendingCloudIds.push(fileId);
  });

  for (let start = 0; start < pendingCloudIds.length; start += AVATAR_URL_BATCH_SIZE) {
    const batch = pendingCloudIds.slice(start, start + AVATAR_URL_BATCH_SIZE);
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: batch });
      const resultList = (res && res.fileList) || [];
      batch.forEach(function(fileId, index) {
        const result = resultList.find(function(item) {
          return item && (item.fileID === fileId || item.fileId === fileId);
        }) || resultList[index];
        const url = result && result.tempFileURL ? result.tempFileURL : fileId;
        urls[fileId] = url;
        if (url !== fileId) avatarUrlCache.set(fileId, { url, ts: now });
      });
    } catch (e) {
      batch.forEach(function(fileId) { urls[fileId] = fileId; });
    }
  }

  return urls;
}

async function getAvatarUrl(fileId) {
  if (!fileId) return '';
  const urls = await getAvatarUrls([fileId]);
  return urls[fileId] || fileId;
}

// ════════════════════════════════════════════════════
// OpenId 获取
// ════════════════════════════════════════════════════

async function getOpenId() {
  if (!isCloudReady()) return null;
  try {
    const res = await wx.cloud.callFunction({ name: 'login' });
    return res.result && res.result.openid;
  } catch (e) {
    console.error('[clouddb] getOpenId failed:', e);
    return null;
  }
}

// ════════════════════════════════════════════════════
// 数据统计（供 mine 页使用）
// ════════════════════════════════════════════════════

async function getStats() {
  const [cats, reminders] = await Promise.all([
    getCats(),
    getReminders()
  ]);
  // 计算逾期提醒数
  let overdueCount = 0;
  reminders.forEach(r => {
    if (r.lastDate && r.intervalDays) {
      const next = parseDate(r.lastDate);
      next.setDate(next.getDate() + r.intervalDays);
      if (next <= new Date()) overdueCount++;
    }
  });
  return { catCount: cats.length, reminderCount: reminders.length, overdueCount };
}

// ════════════════════════════════════════════════════
// 收货地址
// ════════════════════════════════════════════════════
async function getShippingAddresses() {
  if (isCloudReady()) {
    try {
      const openid = await getOpenId();
      const db = wx.cloud.database();
      const { data } = await db.collection(SHIPPING_ADDRESS_COL)
        .where({ _openid: openid })
        .orderBy('isDefault', 'desc').orderBy('_createTime', 'desc')
        .get();
      return data;
    } catch (e) { console.error('[clouddb] getShippingAddresses fail', e); }
  }
  return _storage().getShippingAddresses();
}

async function addShippingAddress(address) {
  if (isCloudReady()) {
    try {
      return await _cloudAdd(SHIPPING_ADDRESS_COL, address);
    } catch (e) { console.error('[clouddb] addShippingAddress fail', e); }
  }
  return _storage().addShippingAddress(address);
}

async function updateShippingAddress(id, updates) {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      await db.collection(SHIPPING_ADDRESS_COL).doc(id).update({ data: updates });
      return { _id: id, ...updates };
    } catch (e) { console.error('[clouddb] updateShippingAddress fail', e); }
  }
  return _storage().updateShippingAddress(id, updates);
}

async function deleteShippingAddress(id) {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      await db.collection(SHIPPING_ADDRESS_COL).doc(id).remove();
      return true;
    } catch (e) { console.error('[clouddb] deleteShippingAddress fail', e); }
  }
  return _storage().deleteShippingAddress(id);
}

async function setDefaultAddress(id) {
  const openid = isCloudReady() ? await getOpenId() : null;
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      const all = (await db.collection(SHIPPING_ADDRESS_COL).where({ _openid: openid }).get()).data;
      await Promise.all(all.map(a => db.collection(SHIPPING_ADDRESS_COL).doc(a._id)
        .update({ data: { isDefault: a._id === id } })));
      return true;
    } catch (e) { console.error('[clouddb] setDefaultAddress fail', e); }
  }
  return _storage().setDefaultAddress(id);
}

// ════════════════════════════════════════════════════
// 积分商城 - 商品
// ════════════════════════════════════════════════════
async function getRedeemItems(options) {
  options = options || {};
  if (isCloudReady()) {
    const response = await wx.cloud.callFunction({
      name: options.admin ? 'adminStore' : 'redeemItem',
      data: { action: options.admin ? 'listItems' : 'list' }
    });
    const result = response.result || {};
    if (result.code !== 0) throw new Error(result.msg || '商品列表加载失败');
    return result.data || [];
  }
  return _storage().getRedeemItems();
}

async function _seedRedeemItems(db) {
  const seed = _storage().DEFAULT_REDEEM_ITEMS || _storage().getRedeemItems();
  for (var i = 0; i < seed.length; i++) {
    await db.collection(REDEEM_ITEM_COL).add({ data: seed[i] }).catch(function() {});
  }
}

// 将内置主题迁移为可由管理员维护的正式商城商品。
// 只补缺失项，不覆盖管理员已经修改过的积分、名称或上下架状态。
async function ensureThemeRedeemItems() {
  const items = await getRedeemItems({ admin: true });
  const created = [];
  const themeProducts = getThemeProducts();

  for (var i = 0; i < themeProducts.length; i++) {
    const product = themeProducts[i];
    const exists = items.some(function(item) {
      return item.virtualType === 'theme' && item.virtualValue === product.virtualValue;
    });
    if (exists) continue;

    const itemData = Object.assign({}, product, {
      systemManaged: true,
      systemKey: 'theme:' + product.virtualValue
    });
    // 云数据库使用自动生成的文档 id，本地模式仍可沿用稳定 id。
    if (isCloudReady()) delete itemData._id;
    const added = await addRedeemItem(itemData);
    if (added) {
      items.push(added);
      created.push(added);
    }
  }

  return { items: items, created: created };
}

async function addRedeemItem(item) {
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({
      name: 'adminStore',
      data: { action: 'saveItem', item }
    });
    const result = res.result || {};
    if (result.code !== 0) throw new Error(result.msg || '商品添加失败');
    return result.data;
  }
  return _storage().addRedeemItem(item);
}

async function updateRedeemItem(id, updates) {
  if (isCloudReady()) {
    const current = (await getRedeemItems({ admin: true })).find(item => item._id === id);
    if (!current) throw new Error('商品不存在');
    const res = await wx.cloud.callFunction({
      name: 'adminStore',
      data: { action: 'saveItem', id, item: Object.assign({}, current, updates) }
    });
    const result = res.result || {};
    if (result.code !== 0) throw new Error(result.msg || '商品更新失败');
    return result.data;
  }
  return _storage().updateRedeemItem(id, updates);
}

async function deleteRedeemItem(id) {
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({
      name: 'adminStore',
      data: { action: 'deleteItem', id }
    });
    const result = res.result || {};
    if (result.code !== 0) throw new Error(result.msg || '商品删除失败');
    return true;
  }
  return _storage().deleteRedeemItem(id);
}

async function redeemItemAtomic(params) {
  params = params || {};
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({
      name: 'redeemItem',
      data: {
        userId: params.userId,
        itemId: params.itemId,
        quantity: params.quantity,
        requestId: params.requestId,
        paymentMethod: params.paymentMethod || 'points'
      }
    });
    const result = res.result || {};
    if (result.code !== 0) {
      const error = new Error(result.msg || '兑换失败，请重试');
      error.code = result.code;
      throw error;
    }
    return result.data;
  }

  const storage = _storage();
  const item = (storage.getRedeemItems() || []).find(function(row) {
    return row._id === params.itemId;
  });
  const quantity = Math.max(1, Math.min(20, parseInt(params.quantity, 10) || 1));
  const paymentMethod = params.paymentMethod || 'points';
  const user = wx.getStorageSync('currentUser') || {};
  if (!item || item.enabled === false) throw new Error('商品不存在或已下架');
  if (item.type !== 'physical' && quantity !== 1) throw new Error('虚拟商品每次只能兑换一件');
  const useThemeVoucher = paymentMethod === 'theme_voucher';
  if (useThemeVoucher && item.virtualType !== 'theme') throw new Error('主题兑换券只能用于兑换主题');
  if (useThemeVoucher && (parseInt(item.points, 10) || 0) > 1000) throw new Error('这张兑换券仅支持 1000 积分以内的主题');
  if (useThemeVoucher && (parseInt(user.themeVouchers, 10) || 0) < 1) throw new Error('主题兑换券不足');
  const totalCost = useThemeVoucher ? 0 : (parseInt(item.points, 10) || 0) * quantity;
  if ((parseInt(user.totalPoints, 10) || 0) < totalCost) throw new Error('积分不足');
  if (item.type === 'physical' && (parseInt(item.stock, 10) || 0) < quantity) throw new Error('库存不足');

  const ownedThemes = Array.from(new Set(['default'].concat(user.ownedThemes || [])));
  if (item.virtualType === 'theme' && ownedThemes.indexOf(item.virtualValue) !== -1) {
    throw new Error('这个主题已经拥有');
  }

  let nextPoints = (parseInt(user.totalPoints, 10) || 0) - totalCost;
  let nextCards = parseInt(user.makeUpCards, 10) || 0;
  let nextThemes = ownedThemes;
  let nextThemeVouchers = Math.max(0, parseInt(user.themeVouchers, 10) || 0);
  if (item.virtualType === 'card') nextCards += (parseInt(item.virtualValue, 10) || 0) * quantity;
  if (item.virtualType === 'points') nextPoints += (parseInt(item.virtualValue, 10) || 0) * quantity;
  if (item.virtualType === 'theme') nextThemes = Array.from(new Set(ownedThemes.concat(item.virtualValue)));
  if (useThemeVoucher) nextThemeVouchers -= 1;

  for (let i = 0; i < quantity; i++) {
    const record = storage.addRedeemRecord({
      itemId: item._id,
      itemName: item.name,
      itemType: item.type,
      pointsSpent: useThemeVoucher ? 0 : (parseInt(item.points, 10) || 0),
      userNickname: user.nickname || '',
      openid: user._openid || '',
      redeemedAt: new Date().toISOString(),
      status: item.type === 'physical' ? 'in_backpack' : 'completed',
      virtualType: item.virtualType || '',
      themeKey: item.virtualType === 'theme' ? item.virtualValue : '',
      paymentMethod: useThemeVoucher ? 'theme_voucher' : 'points'
    });
    if (item.type === 'physical' || item.virtualType === 'theme') {
      const inventory = storage.addToInventory({
        itemId: item._id,
        itemName: item.name,
        itemType: item.type,
        virtualType: item.virtualType || '',
        themeKey: item.virtualType === 'theme' ? item.virtualValue : '',
        image: item.image || '',
        pointsSpent: useThemeVoucher ? 0 : (parseInt(item.points, 10) || 0),
        ownedAt: new Date().toISOString(),
        status: item.type === 'physical' ? 'in_backpack' : 'completed',
        redeemRecordId: record._id
      });
      storage.updateRedeemRecord(record._id, { inventoryId: inventory._id });
    }
  }

  if (item.type === 'physical') {
    storage.updateRedeemItem(item._id, { stock: item.stock - quantity });
  }
  Object.assign(user, {
    totalPoints: nextPoints,
    makeUpCards: nextCards,
    ownedThemes: nextThemes,
    themeVouchers: nextThemeVouchers
  });
  wx.setStorageSync('currentUser', user);
  return {
    points: nextPoints,
    makeUpCards: nextCards,
    ownedThemes: nextThemes,
    themeVouchers: nextThemeVouchers,
    itemType: item.type,
    virtualType: item.virtualType || '',
    themeKey: item.virtualType === 'theme' ? item.virtualValue : '',
    quantity
  };
}

async function inventoryActionAtomic(action, params) {
  params = params || {};
  if (!isCloudReady()) throw new Error('云开发不可用，无法执行背包操作');
  const res = await wx.cloud.callFunction({
    name: 'redeemItem',
    data: {
      action,
      userId: params.userId,
      inventoryIds: params.inventoryIds || [],
      addressId: params.addressId || '',
      requestId: params.requestId || _assetRequestId(action)
    }
  });
  const result = res.result || {};
  if (result.code !== 0) {
    const error = new Error(result.msg || '背包操作失败，请重试');
    error.code = result.code;
    throw error;
  }
  return result.data;
}

async function confirmInventoryAtomic(params) {
  return inventoryActionAtomic('confirmInventory', params);
}

async function cancelInventoryAtomic(params) {
  return inventoryActionAtomic('cancelInventory', params);
}

async function deleteInventoryAtomic(params) {
  return inventoryActionAtomic('deleteInventory', params);
}

async function getLotteryPrizes(options) {
  options = options || {};
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({
      name: 'adminLottery',
      data: { action: options.admin ? 'list' : 'listActive' }
    });
    const result = res.result || {};
    if (result.code !== 0) throw new Error(result.msg || '奖池加载失败');
    return result.data || [];
  }
  const prizes = _storage().getLotteryPrizes() || [];
  return options.admin ? prizes : prizes.filter(function(item) { return item.enabled !== false; });
}

async function saveLotteryPrize(id, prize) {
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({
      name: 'adminLottery',
      data: { action: id ? 'update' : 'add', id: id || '', prize: prize }
    });
    const result = res.result || {};
    if (result.code !== 0) throw new Error(result.msg || '奖品保存失败');
    return result;
  }
  return id ? _storage().updateLotteryPrize(id, prize) : _storage().addLotteryPrize(prize);
}

async function toggleLotteryPrize(id, enabled) {
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({
      name: 'adminLottery',
      data: { action: 'toggle', id: id, enabled: enabled }
    });
    const result = res.result || {};
    if (result.code !== 0) throw new Error(result.msg || '状态更新失败');
    return result;
  }
  return _storage().updateLotteryPrize(id, { enabled: enabled });
}

async function deleteLotteryPrize(id) {
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({
      name: 'adminLottery',
      data: { action: 'delete', id: id }
    });
    const result = res.result || {};
    if (result.code !== 0) throw new Error(result.msg || '奖品删除失败');
    return result;
  }
  return _storage().deleteLotteryPrize(id);
}

function selectLocalLotteryPrize(prizes) {
  var total = prizes.reduce(function(sum, prize) {
    return sum + Math.max(0, parseInt(prize.weight, 10) || 0);
  }, 0);
  if (!total) throw new Error('当前奖池没有可抽取奖品');
  var cursor = Math.random() * total;
  for (var i = 0; i < prizes.length; i++) {
    cursor -= Math.max(0, parseInt(prizes[i].weight, 10) || 0);
    if (cursor < 0) return prizes[i];
  }
  return prizes[prizes.length - 1];
}

async function drawLotteryAtomic(params) {
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({ name: 'drawLottery', data: params });
    const result = res.result || {};
    if (result.code !== 0) {
      const error = new Error(result.msg || '抽奖失败');
      error.code = result.code;
      throw error;
    }
    return result.data;
  }

  const storage = _storage();
  const user = wx.getStorageSync('currentUser') || {};
  const streak = Math.max(0, parseInt(user.checkInStreak, 10) || 0);
  const drawn = Array.isArray(user.drawnMilestones) ? user.drawnMilestones.slice() : [];
  const legacyUsed = Math.max(0, parseInt(user.lotteryUsed, 10) || 0);
  if (!drawn.length && legacyUsed > 0) {
    for (let oldDay = 7; oldDay <= streak && drawn.length < legacyUsed; oldDay += 7) {
      drawn.push(oldDay);
    }
  }
  const available = [];
  for (let day = 7; day <= streak; day += 7) {
    if (drawn.indexOf(day) === -1) available.push(day);
  }
  if (!available.length) throw new Error('当前没有可用抽奖机会');
  const milestone = available.indexOf(params.milestone) !== -1 ? params.milestone : available[0];
  const ownedThemes = Array.from(new Set(['default'].concat(user.ownedThemes || [])));
  const prizes = (storage.getLotteryPrizes() || []).filter(function(prize) {
    if (prize.enabled === false || (parseInt(prize.weight, 10) || 0) <= 0) return false;
    return true;
  });
  const prize = selectLocalLotteryPrize(prizes);
  const themeAlreadyOwned = prize.virtualType === 'theme'
    && ownedThemes.indexOf(prize.virtualValue) !== -1;
  user.totalPoints = Math.max(0, parseInt(user.totalPoints, 10) || 0);
  user.makeUpCards = Math.max(0, parseInt(user.makeUpCards, 10) || 0);
  user.ownedThemes = ownedThemes;
  if (prize.virtualType === 'points') user.totalPoints += parseInt(prize.virtualValue, 10) || 0;
  if (prize.virtualType === 'card') user.makeUpCards += parseInt(prize.virtualValue, 10) || 0;
  if (prize.virtualType === 'theme') user.ownedThemes = Array.from(new Set(ownedThemes.concat(prize.virtualValue)));
  var inventoryId = '';
  var stockReserved = false;
  if (prize.type === 'physical') {
    var stock = Math.max(0, parseInt(prize.stock, 10) || 0);
    stockReserved = stock > 0;
    var record = storage.addRedeemRecord({
      itemId: prize.linkedItemId || prize._id, itemName: prize.name, itemType: 'physical',
      pointsSpent: 0, redeemedAt: new Date().toISOString(), status: 'in_backpack', source: 'lottery',
      lotteryPrizeId: prize._id, stockReserved: stockReserved
    });
    var inventory = storage.addToInventory({
      itemId: prize.linkedItemId || prize._id, itemName: prize.name, itemType: 'physical',
      image: prize.image || '', pointsSpent: 0, ownedAt: new Date().toISOString(),
      status: 'in_backpack', source: 'lottery', redeemRecordId: record._id,
      lotteryPrizeId: prize._id, stockReserved: stockReserved
    });
    inventoryId = inventory._id;
    if (stockReserved) storage.updateLotteryPrize(prize._id, { stock: stock - 1 });
  }
  user.drawnMilestones = Array.from(new Set(drawn.concat(milestone))).sort(function(a, b) { return a - b; });
  user.lotteryUsed = user.drawnMilestones.length;
  user._lastDrawDate = new Date().toISOString().slice(0, 10);
  wx.setStorageSync('currentUser', user);
  const result = {
    prizeId: prize._id,
    name: prize.name,
    type: prize.type,
    virtualType: prize.virtualType || '',
    virtualValue: prize.virtualValue || 0,
    image: prize.image || '', color: prize.color || '#5BA7D8',
    milestone: milestone, points: user.totalPoints, makeUpCards: user.makeUpCards,
    ownedThemes: user.ownedThemes, drawnMilestones: user.drawnMilestones, inventoryId: inventoryId,
    stockReserved: stockReserved, themeAlreadyOwned: themeAlreadyOwned
  };
  storage.addLotteryRecord(Object.assign({ drawnAt: new Date().toISOString() }, result));
  return result;
}

async function reserveLotteryPhysicalInventory(inventoryIds) {
  inventoryIds = Array.from(new Set((inventoryIds || []).filter(Boolean)));
  if (!inventoryIds.length) return { reserved: 0 };
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({
      name: 'drawLottery',
      data: { action: 'reservePhysical', inventoryIds: inventoryIds }
    });
    const result = res.result || {};
    if (result.code !== 0) {
      const error = new Error(result.msg || '奖品暂时缺货');
      error.code = result.code;
      throw error;
    }
    return result.data || { reserved: 0 };
  }
  const storage = _storage();
  const inventory = storage.getUserInventory ? (storage.getUserInventory() || []) : [];
  const pending = inventory.filter(function(item) {
    return inventoryIds.indexOf(item._id) !== -1
      && item.source === 'lottery'
      && item.stockReserved !== true;
  });
  const counts = {};
  pending.forEach(function(item) {
    counts[item.lotteryPrizeId] = (counts[item.lotteryPrizeId] || 0) + 1;
  });
  const prizes = storage.getLotteryPrizes() || [];
  Object.keys(counts).forEach(function(prizeId) {
    const prize = prizes.find(function(item) { return item._id === prizeId; });
    if (!prize || (parseInt(prize.stock, 10) || 0) < counts[prizeId]) {
      throw new Error('奖品暂时缺货，请等待管理员补充库存');
    }
  });
  Object.keys(counts).forEach(function(prizeId) {
    const prize = prizes.find(function(item) { return item._id === prizeId; });
    storage.updateLotteryPrize(prizeId, { stock: (parseInt(prize.stock, 10) || 0) - counts[prizeId] });
  });
  pending.forEach(function(item) {
    storage.updateInventoryItem(item._id, { stockReserved: true, stockReservedAt: new Date().toISOString() });
  });
  return { reserved: pending.length };
}

async function releaseLotteryPhysicalInventory(inventoryIds) {
  inventoryIds = Array.from(new Set((inventoryIds || []).filter(Boolean)));
  if (!inventoryIds.length) return { released: 0 };
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({
      name: 'drawLottery',
      data: { action: 'releasePhysical', inventoryIds: inventoryIds }
    });
    const result = res.result || {};
    if (result.code !== 0) throw new Error(result.msg || '库存释放失败');
    return result.data || { released: 0 };
  }
  const storage = _storage();
  const inventory = storage.getUserInventory() || [];
  const releasing = inventory.filter(function(item) {
    return inventoryIds.indexOf(item._id) !== -1
      && item.source === 'lottery'
      && item.stockReserved === true;
  });
  const counts = {};
  releasing.forEach(function(item) {
    counts[item.lotteryPrizeId] = (counts[item.lotteryPrizeId] || 0) + 1;
  });
  const prizes = storage.getLotteryPrizes() || [];
  Object.keys(counts).forEach(function(prizeId) {
    const prize = prizes.find(function(item) { return item._id === prizeId; });
    if (prize) storage.updateLotteryPrize(prizeId, { stock: (parseInt(prize.stock, 10) || 0) + counts[prizeId] });
  });
  releasing.forEach(function(item) {
    storage.updateInventoryItem(item._id, { stockReserved: false, stockReleasedAt: new Date().toISOString() });
  });
  return { released: releasing.length };
}

async function cancelLotteryPhysicalInventory(userId, inventoryIds) {
  inventoryIds = Array.from(new Set((inventoryIds || []).filter(Boolean)));
  if (!inventoryIds.length) return { cancelled: 0, compensationPoints: 0 };
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({
      name: 'drawLottery',
      data: { action: 'cancelPhysical', userId: userId, inventoryIds: inventoryIds }
    });
    const result = res.result || {};
    if (result.code !== 0) {
      const error = new Error(result.msg || '取消奖品失败');
      error.code = result.code;
      throw error;
    }
    return result.data || { cancelled: 0, compensationPoints: 0 };
  }

  const storage = _storage();
  const inventory = storage.getUserInventory() || [];
  const cancelling = inventory.filter(function(item) {
    return inventoryIds.indexOf(item._id) !== -1
      && item.source === 'lottery'
      && item.status === 'in_backpack';
  });
  const redeemItems = storage.getRedeemItems() || [];
  var compensationPoints = 0;
  const reservedIds = [];
  cancelling.forEach(function(item) {
    var points = Math.max(0, parseInt(item.compensationPoints, 10) || 0);
    if (!points) {
      var linked = redeemItems.find(function(product) { return product._id === item.itemId; });
      points = Math.max(0, parseInt(linked && linked.points, 10) || 0);
    }
    compensationPoints += points;
    if (item.stockReserved === true) reservedIds.push(item._id);
  });
  if (reservedIds.length) await releaseLotteryPhysicalInventory(reservedIds);
  cancelling.forEach(function(item) {
    if (item.redeemRecordId) storage.deleteRedeemRecord(item.redeemRecordId);
    storage.deleteInventoryItem(item._id);
  });
  const user = wx.getStorageSync('currentUser') || {};
  user.totalPoints = Math.max(0, parseInt(user.totalPoints, 10) || 0) + compensationPoints;
  wx.setStorageSync('currentUser', user);
  return { cancelled: cancelling.length, compensationPoints: compensationPoints, points: user.totalPoints };
}

// ════════════════════════════════════════════════════
// 兑换记录
// ════════════════════════════════════════════════════
async function addRedeemRecord(record) {
  if (isCloudReady()) {
    try {
      record._id = await _cloudAdd(REDEEM_RECORD_COL, record);
      return record;
    } catch (e) { console.error('[clouddb] addRedeemRecord fail', e); }
  }
  return _storage().addRedeemRecord(record);
}

async function getRedeemRecords(filter) {
  if (isCloudReady()) {
    try {
      const openid = await getOpenId();
      return await _cloudQueryAll(REDEEM_RECORD_COL, { _openid: openid, ...(filter || {}) }, {
        orderBy: 'redeemedAt',
        orderDesc: 'desc',
        maxRows: 500
      });
    } catch (e) { console.error('[clouddb] getRedeemRecords fail', e); }
  }
  var records = _storage().getRedeemRecords();
  if (filter) {
    return records.filter(function(r) {
      return Object.keys(filter).every(function(k) { return r[k] === filter[k]; });
    });
  }
  return records;
}

// 管理员专用：查询全部用户兑换记录（通过云函数绕过客户端 _openid 限制）
async function getRedeemRecordsAdmin() {
  if (isCloudReady()) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getAdminRecords',
        data: { collection: REDEEM_RECORD_COL, orderBy: 'redeemedAt', orderDesc: 'desc', limit: 500 }
      });
      if (res.result && res.result.code === 0) {
        return res.result.data || [];
      }
      console.error('[clouddb] getRedeemRecordsAdmin error:', res.result);
      return [];
    } catch (e) { console.error('[clouddb] getRedeemRecordsAdmin fail', e); return []; }
  }
  // 本地模式直接返回全部记录
  return _storage().getRedeemRecords();
}

async function updateRedeemRecord(id, updates) {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      await db.collection(REDEEM_RECORD_COL).doc(id).update({ data: updates });
      return { _id: id, ...updates };
    } catch (e) { console.error('[clouddb] updateRedeemRecord fail', e); }
  }
  return _storage().updateRedeemRecord(id, updates);
}

async function deleteRedeemRecord(id) {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      await db.collection(REDEEM_RECORD_COL).doc(id).remove();
      return true;
    } catch (e) { console.error('[clouddb] deleteRedeemRecord fail', e); }
  }
  return _storage().deleteRedeemRecord(id);
}

async function deleteRedeemRecordsAdmin(ids) {
  var targetIds = Array.isArray(ids) ? ids : (ids ? [ids] : []);
  if (targetIds.length === 0) return { code: 0, deleted: 0 };
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({
      name: 'getAdminRecords',
      data: { action: 'delete', collection: REDEEM_RECORD_COL, ids: targetIds }
    });
    var result = res.result || {};
    if (result.code === 0) return result;
    throw new Error(result.msg || '删除兑换记录失败');
  }
  targetIds.forEach(function(id) { _storage().deleteRedeemRecord(id); });
  return { code: 0, deleted: targetIds.length };
}

// ════════════════════════════════════════════════════
// 用户背包
// ════════════════════════════════════════════════════
async function getUserInventory() {
  if (isCloudReady()) {
    try {
      const openid = await getOpenId();
      return await _cloudQueryAll(INVENTORY_COL, { _openid: openid }, {
        orderBy: 'ownedAt',
        orderDesc: 'desc',
        maxRows: 500
      });
    } catch (e) { console.error('[clouddb] getUserInventory fail', e); }
  }
  return _storage().getUserInventory();
}

async function addToInventory(item) {
  if (isCloudReady()) {
    try {
      item._id = await _cloudAdd(INVENTORY_COL, item);
      return item;
    } catch (e) { console.error('[clouddb] addToInventory fail', e); }
  }
  return _storage().addToInventory(item);
}

async function updateInventoryItem(id, updates) {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      await db.collection(INVENTORY_COL).doc(id).update({ data: updates });
      return { _id: id, ...updates };
    } catch (e) { console.error('[clouddb] updateInventoryItem fail', e); }
  }
  return _storage().updateInventoryItem(id, updates);
}

// ════════════════════════════════════════════════════
// 头像框
// ════════════════════════════════════════════════════
async function getAvatarFrames() {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      const { data } = await db.collection(AVATAR_FRAME_COL).get();
      if (!data || data.length === 0) {
        await _seedAvatarFrames(db);
        const { data: seeded } = await db.collection(AVATAR_FRAME_COL).get();

        return seeded;
      }
      return data;
    } catch (e) { console.error('[clouddb] getAvatarFrames fail', e); }
  }
  return _storage().getAvatarFrames();
}

async function deleteInventoryItem(id) {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      await db.collection(INVENTORY_COL).doc(id).remove();
      return true;
    } catch (e) { console.error('[clouddb] deleteInventoryItem fail', e); }
  }
  return _storage().deleteInventoryItem(id);
}


// ══════════════════════════════════════════════════
// 发货单 (shipments)
// ══════════════════════════════════════════════════
var SHIPMENT_COL = 'shipments';

async function getShipments(query) {
  if (isCloudReady()) {
    try {
      var db2 = wx.cloud.database();
      var openid2 = await getOpenId();
      var res = await db2.collection(SHIPMENT_COL).where({ _openid: openid2 }).orderBy('createdAt', 'desc').limit(50).get();
      return res.data;
    } catch (e) { console.error('[clouddb] getShipments fail', e); }
  }
  return _storage().getShipments ? _storage().getShipments() : [];
}

async function getShipmentsAdmin() {
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({
      name: 'adminStore',
      data: { action: 'listShipments' }
    });
    const result = res.result || {};
    if (result.code !== 0) throw new Error(result.msg || '发货单加载失败');
    return result.data || [];
  }
  return _storage().getShipments ? _storage().getShipments() : [];
}

async function addShipment(shipment) {
  if (isCloudReady()) {
    try {
      shipment.createdAt = new Date().toISOString();
      var res = await _cloudAdd(SHIPMENT_COL, shipment);
      return res;
    } catch (e) { console.error('[clouddb] addShipment fail', e); }
  }
  return _storage().addShipment ? _storage().addShipment(shipment) : null;
}

async function updateShipment(id, updates) {
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({
      name: 'adminStore',
      data: {
        action: 'shipOrder',
        shipmentId: id,
        carrier: updates && updates.carrier,
        trackingNo: updates && updates.trackingNo
      }
    });
    const result = res.result || {};
    if (result.code !== 0) throw new Error(result.msg || '发货失败');
    return result.data;
  }
  return _storage().updateShipment ? _storage().updateShipment(id, updates) : null;
}

async function deleteShipment(id) {
  if (isCloudReady()) {
    try {
      var db2 = wx.cloud.database();
      await db2.collection(SHIPMENT_COL).doc(id).remove();
      return true;
    } catch (e) { console.error('[clouddb] deleteShipment fail', e); }
  }
  return _storage().deleteShipment ? _storage().deleteShipment(id) : false;
}

async function deleteShipmentAdmin(id) {
  if (!id) return { code: 0, deleted: 0 };
  if (isCloudReady()) {
    const res = await wx.cloud.callFunction({
      name: 'getAdminRecords',
      data: { action: 'delete', collection: SHIPMENT_COL, id: id }
    });
    var result = res.result || {};
    if (result.code === 0) return result;
    throw new Error(result.msg || '删除发货单失败');
  }
  if (_storage().deleteShipment) _storage().deleteShipment(id);
  return { code: 0, deleted: 1 };
}



async function _seedAvatarFrames(db) {
  const seed = _storage().DEFAULT_AVATAR_FRAMES;
  for (var i = 0; i < seed.length; i++) {
    await db.collection(AVATAR_FRAME_COL).add({ data: seed[i] }).catch(function() {});
  }
}

async function clearUserInventory() {
  if (isCloudReady()) {
    try {
      const openid = await getOpenId();
      const db = wx.cloud.database();
      const { data } = await db.collection(INVENTORY_COL).where({ _openid: openid }).get();
      for (var i = 0; i < data.length; i++) {
        await db.collection(INVENTORY_COL).doc(data[i]._id).remove();
      }
      return data.length;
    } catch (e) { console.error('[clouddb] clearUserInventory fail', e); }
  }
  return _storage().clearUserInventory();
}

async function clearUserRedeemRecords() {
  if (isCloudReady()) {
    try {
      const openid = await getOpenId();
      const db = wx.cloud.database();
      const { data } = await db.collection(REDEEM_RECORD_COL).where({ _openid: openid }).get();
      for (var i = 0; i < data.length; i++) {
        await db.collection(REDEEM_RECORD_COL).doc(data[i]._id).remove();
      }
      return data.length;
    } catch (e) { console.error('[clouddb] clearUserRedeemRecords fail', e); }
  }
  return _storage().clearUserRedeemRecords();
}
async function addAvatarFrame(frame) {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection(AVATAR_FRAME_COL).add({ data: frame });
      frame._id = res._id;
      return frame;
    } catch (e) { console.error('[clouddb] addAvatarFrame fail', e); }
  }
  return _storage().addAvatarFrame(frame);
}

async function updateAvatarFrame(id, updates) {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      await db.collection(AVATAR_FRAME_COL).doc(id).update({ data: updates });
      return { _id: id, ...updates };
    } catch (e) { console.error('[clouddb] updateAvatarFrame fail', e); }
  }
  return _storage().updateAvatarFrame(id, updates);
}

async function deleteAvatarFrame(id) {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      await db.collection(AVATAR_FRAME_COL).doc(id).remove();
      return true;
    } catch (e) { console.error('[clouddb] deleteAvatarFrame fail', e); }
  }
  return _storage().deleteAvatarFrame(id);
}

// ════════════════════════════════════════════════════
// 记账 (expenses)
// ════════════════════════════════════════════════════
async function addExpense(expense) {
  if (expense.amount) expense.amount = Number(expense.amount);
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      await db.collection(EXPENSE_COL).add({ data: expense });
    } catch (e) { console.error('[clouddb] addExpense cloud fail:', e); }
  }
  _storage().addExpense(expense);
  markDataDirty('expenses');
  return expense;
}

async function getExpenses(query = {}) {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      const _ = db.command;
      let cloudQuery = {};
      // 将 dateStart/dateEnd 转为 date 字段的范围查询
      if (query.dateStart || query.dateEnd) {
        let dateFilter = null;
        if (query.dateStart) dateFilter = _.gte(query.dateStart);
        if (query.dateEnd) {
          dateFilter = dateFilter ? dateFilter.and(_.lte(query.dateEnd)) : _.lte(query.dateEnd);
        }
        cloudQuery.date = dateFilter;
      }
      var result = await _cloudQueryAll(EXPENSE_COL, cloudQuery, {
        orderBy: 'date',
        orderDesc: 'desc',
        maxRows: 2000
      });
      return result || [];
    } catch (e) { console.error('[clouddb] getExpenses cloud fail:', e); }
  }
  return _storage().getExpenses(query) || [];
}

async function deleteExpense(id) {
  if (!id) return;
  if (isCloudReady()) {
    try {
      await wx.cloud.database().collection(EXPENSE_COL).doc(id).remove();
    } catch (e) { console.error('[clouddb] deleteExpense cloud fail:', e); }
  }
  _storage().deleteExpense(id);
  markDataDirty('expenses');
}

async function updateExpense(id, updates) {
  if (!id) return;
  if (updates.amount) updates.amount = Number(updates.amount);
  if (isCloudReady()) {
    try {
      await _cloudUpdate(EXPENSE_COL, id, updates);
      markDataDirty('expenses');
      return;
    } catch (e) { console.error('[clouddb] updateExpense cloud fail:', e); throw e; }
  }
  _storage().updateExpense(id, updates);
  markDataDirty('expenses');
}

async function getBackupSnapshot() {
  if (!isCloudReady()) {
    const storage = _storage();
    return {
      cats: storage.getCats() || [],
      healthRecords: storage.getRecords() || [],
      weightRecords: storage.getWeightRecords() || [],
      reminders: storage.getReminders() || [],
      expenses: storage.getAllExpenses() || []
    };
  }
  const [cats, healthRecords, weightRecords, reminders, expenses] = await Promise.all([
    _cloudQueryAll(CAT_COL, {}, { orderBy: '_createTime', orderDesc: 'desc' }),
    _cloudQueryAll(RECORD_COL, {}, { orderBy: 'date', orderDesc: 'desc' }),
    _cloudQueryAll(WEIGHT_COL, {}, { orderBy: 'date', orderDesc: 'desc' }),
    _cloudQueryAll(REMIND_COL, {}, { orderBy: '_createTime', orderDesc: 'desc' }),
    _cloudQueryAll(EXPENSE_COL, {}, { orderBy: 'date', orderDesc: 'desc' })
  ]);
  return { cats, healthRecords, weightRecords, reminders, expenses };
}

function _mergeBackupRows(existing, incoming, replace) {
  if (replace) return incoming.slice();
  const rows = existing.slice();
  const indexes = {};
  rows.forEach(function(row, index) { if (row && row._id) indexes[row._id] = index; });
  incoming.forEach(function(row) {
    if (indexes[row._id] === undefined) {
      indexes[row._id] = rows.length;
      rows.push(row);
    } else {
      rows[indexes[row._id]] = Object.assign({}, rows[indexes[row._id]], row);
    }
  });
  return rows;
}

async function restoreBackupSnapshot(snapshot, mode) {
  const data = snapshot || {};
  const replace = mode === 'replace';
  const groups = [
    { key: 'cats', collection: CAT_COL },
    { key: 'healthRecords', collection: RECORD_COL },
    { key: 'weightRecords', collection: WEIGHT_COL },
    { key: 'reminders', collection: REMIND_COL },
    { key: 'expenses', collection: EXPENSE_COL }
  ];

  if (!isCloudReady()) {
    const storage = _storage();
    storage.saveCats(_mergeBackupRows(storage.getCats() || [], data.cats || [], replace));
    storage.saveRecords(_mergeBackupRows(storage.getRecords() || [], data.healthRecords || [], replace));
    storage.saveWeightRecords(_mergeBackupRows(storage.getWeightRecords() || [], data.weightRecords || [], replace));
    storage.saveReminders(_mergeBackupRows(storage.getReminders() || [], data.reminders || [], replace));
    storage.saveExpenses(_mergeBackupRows(storage.getAllExpenses() || [], data.expenses || [], replace));
    refreshCatsCache();
    return { restored: groups.reduce((sum, group) => sum + (data[group.key] || []).length, 0) };
  }

  for (const group of groups) {
    const incoming = data[group.key] || [];
    if (replace) {
      const current = await _cloudQueryAll(group.collection);
      for (const row of current) await _cloudDelete(group.collection, row._id);
    }
    for (const row of incoming) {
      await _cloudSet(group.collection, row._id, row);
    }
  }
  refreshCatsCache();
  return { restored: groups.reduce((sum, group) => sum + (data[group.key] || []).length, 0) };
}

// ════════════════════════════════════════════════════
// 留言板（feedback）
// ════════════════════════════════════════════════════

async function getFeedback() {
  if (!isCloudReady()) return [];
  try {
    return await _cloudQuery(FEEDBACK_COL, {}, { orderBy: 'createdAt', orderDesc: 'desc' });
  } catch (e) {
    console.error('[clouddb] getFeedback error:', e);
    return [];
  }
}

async function addFeedback(data) {
  if (!isCloudReady()) return null;
  return await _cloudAdd(FEEDBACK_COL, { ...data, createdAt: Date.now() });
}

// 点赞/取消点赞（走云函数，绕过客户端写权限限制）
async function toggleFeedbackLike(feedbackId, openid) {
  if (!isCloudReady()) return;
  try {
    const res = await wx.cloud.callFunction({
      name: 'adminFeedback',
      data: { action: 'toggleLike', feedbackId, openid }
    });
    if (res.result && res.result.code === 0) {
      return res.result.liked;
    }
    console.error('[clouddb] toggleFeedbackLike error:', res.result);
  } catch (e) { console.error('[clouddb] toggleFeedbackLike error:', e); }
}

// 添加评论（走云函数，绕过客户端写权限限制）
async function addFeedbackComment(feedbackId, comment) {
  if (!isCloudReady()) throw new Error('云开发不可用');
  const res = await wx.cloud.callFunction({
    name: 'adminFeedback',
    data: { action: 'addComment', feedbackId, comment }
  });
  if (res.result && res.result.code === 0) {
    return res.result.commentId;
  }
  throw new Error((res.result && res.result.msg) || '评论失败');
}

// 添加评论回复（走云函数，绕过客户端写权限限制）
async function addCommentReply(feedbackId, commentIdx, reply) {
  if (!isCloudReady()) throw new Error('云开发不可用');
  const res = await wx.cloud.callFunction({
    name: 'adminFeedback',
    data: { action: 'addCommentReply', feedbackId, commentIdx, reply }
  });
  if (res.result && res.result.code === 0) {
    return res.result.replyId;
  }
  throw new Error((res.result && res.result.msg) || '回复失败');
}

async function toggleFeedbackAdopted(feedbackId) {
  if (!isCloudReady()) return;
  try {
    const res = await wx.cloud.callFunction({
      name: 'adminFeedback',
      data: { action: 'toggleAdopted', feedbackId }
    });
    return res.result;
  } catch (e) {
    console.error('[clouddb] toggleFeedbackAdopted error:', e);
    return { code: -1, msg: e.message };
  }
}

// 删除留言：作者直删，管理员走云函数
async function deleteFeedback(feedbackId, authorOpenid) {
  if (!isCloudReady()) return { code: -1, msg: '云开发不可用' };
  try {
    const openid = _getCurrentOpenid() || '';
    // 检查是否为作者（作者可直接删自己的文档）
    if (openid && openid === authorOpenid) {
      await _cloudDelete(FEEDBACK_COL, feedbackId);
      return { code: 0 };
    }
    // 非作者尝试管理员删除
    const res = await wx.cloud.callFunction({
      name: 'adminFeedback',
      data: { action: 'delete', feedbackId }
    });
    return res.result || { code: -1, msg: '删除失败' };
  } catch (e) {
    console.error('[clouddb] deleteFeedback error:', e);
    return { code: -1, msg: e.message };
  }
}

// ════════════════════════════════════════════════════
// 通知（notifications）
// ════════════════════════════════════════════════════

async function addNotification(data) {
  if (!isCloudReady()) return;
  try {
    await _cloudAdd(NOTIFY_COL, { ...data, read: false, createdAt: Date.now() });
    if (data && data.toOpenid) delete notifyCountCache[data.toOpenid];
  } catch (e) { console.error('[clouddb] addNotification fail:', e); }
}

async function getUnreadNotifyCount(openid) {
  if (!isCloudReady() || !openid) return 0;
  const cached = notifyCountCache[openid];
  if (cached && Date.now() - cached.ts < SERVICE_CACHE_TTL) return cached.value;
  if (notifyCountRequests[openid]) return notifyCountRequests[openid];
  notifyCountRequests[openid] = _cloudQueryAll(NOTIFY_COL, { toOpenid: openid, read: false }, { maxRows: 999 })
    .then(function(rows) {
      notifyCountCache[openid] = { value: rows.length, ts: Date.now() };
      return rows.length;
    })
    .catch(function(e) {
      console.error('[clouddb] getUnreadNotifyCount fail:', e);
      return 0;
    })
    .finally(function() { delete notifyCountRequests[openid]; });
  return notifyCountRequests[openid];
}

async function getNotifications(openid) {
  if (!isCloudReady() || !openid) return [];
  try {
    return await _cloudQueryAll(NOTIFY_COL, { toOpenid: openid }, {
      orderBy: 'createdAt',
      orderDesc: 'desc',
      maxRows: 200
    });
  } catch (e) { console.error('[clouddb] getNotifications fail:', e); return []; }
}

// 标记全部通知已读（走云函数，绕过客户端写权限限制）
async function markNotificationsRead(openid) {
  if (!isCloudReady() || !openid) return;
  try {
    await wx.cloud.callFunction({
      name: 'adminFeedback',
      data: { action: 'markNotificationsRead', openid }
    });
    delete notifyCountCache[openid];
  } catch (e) { console.error('[clouddb] markNotificationsRead fail:', e); }
}

// ════════════════════════════════════════════════════
// UGC 内容安全校验
// ════════════════════════════════════════════════════

async function checkTextSafe(content) {
  if (!isCloudReady() || !content) return { code: 0 };
  try {
    const res = await wx.cloud.callFunction({
      name: 'contentCheck',
      data: { action: 'msgCheck', content }
    });
    return res.result || { code: -1, msg: '检测失败' };
  } catch (e) {
    console.error('[clouddb] checkTextSafe error:', e);
    return { code: -1, msg: e.message };
  }
}

async function checkImageSafe(cloudFileId) {
  if (!isCloudReady() || !cloudFileId) return { code: 0 };
  try {
    const res = await wx.cloud.callFunction({
      name: 'contentCheck',
      data: { action: 'imgCheck', mediaUrl: cloudFileId }
    });
    return res.result || { code: -1, msg: '检测失败' };
  } catch (e) {
    console.error('[clouddb] checkImageSafe error:', e);
    return { code: -1, msg: e.message };
  }
}

// ════════════════════════════════════════════════════
// 公告（announcements）
// ════════════════════════════════════════════════════

async function getActiveAnnouncement() {
  if (!isCloudReady()) return null;
  const cloudRef = wx.cloud;
  if (announcementCache && announcementCache.cloudRef === cloudRef &&
      Date.now() - announcementCache.ts < SERVICE_CACHE_TTL) {
    return announcementCache.value;
  }
  if (announcementCache && announcementCache.cloudRef !== cloudRef) {
    announcementCache = null;
    announcementRequest = null;
  }
  if (announcementRequest) return announcementRequest;
  announcementRequest = wx.cloud.callFunction({
      name: 'adminAnnouncement',
      data: { action: 'active' }
    })
    .then(function(res) {
      const value = res.result && res.result.code === 0 ? (res.result.data || null) : null;
      announcementCache = { value, ts: Date.now(), cloudRef };
      return value;
    })
    .catch(function(e) {
      console.error('[clouddb] getActiveAnnouncement error:', e);
      return null;
    })
    .finally(function() { announcementRequest = null; });
  return announcementRequest;
}

async function callAnnouncementAdmin(action, data) {
  if (!isCloudReady()) return { code: -1, msg: '云开发不可用' };
  var res = await wx.cloud.callFunction({
    name: 'adminAnnouncement',
    data: Object.assign({ action: action }, data || {})
  });
  announcementCache = null;
  return res.result || { code: -1, msg: '调用失败' };
}

module.exports = {
  isCloudReady,
  // cats
  getCats, getAllCats: getCats, getHomeOverview, getCatById, addCat, updateCat, deleteCat, refreshCatsCache,
  // records
  getRecords, addRecord, updateRecord, deleteRecord,
  // weight
  getWeightRecords, addWeightRecord, updateWeightRecord, deleteWeightRecord,
  // reminders
  getReminders, addReminder, updateReminder, deleteReminder,
  // users
  getUserByOpenid, getUserById, getUserByPhone, addUser, updateUser,
  checkInAtomic, makeUpAtomic, claimShareRewardAtomic,
  getBenefitStatus, claimBenefit,
  getBenefitCampaignsAdmin, previewBenefitAudience, getBenefitClaimsAdmin, saveBenefitCampaign,
  toggleBenefitCampaign, deleteBenefitCampaign,
  searchUsers, adminUpdateUser,
  // feedback
  getFeedback, addFeedback, toggleFeedbackLike, addFeedbackComment, addCommentReply, toggleFeedbackAdopted, deleteFeedback,
  // notifications
  addNotification, getUnreadNotifyCount, getNotifications, markNotificationsRead,
  // announcements
  getActiveAnnouncement, callAnnouncementAdmin,
  // storage
  uploadAvatar, getAvatarUrl, getAvatarUrls,
  // auth
  getOpenId,
  // stats
  getStats,
  // shipping
  getShippingAddresses, addShippingAddress, updateShippingAddress, deleteShippingAddress, setDefaultAddress,
  // redeem items
  getRedeemItems, ensureThemeRedeemItems, addRedeemItem, updateRedeemItem, deleteRedeemItem, redeemItemAtomic,
  confirmInventoryAtomic, cancelInventoryAtomic, deleteInventoryAtomic,
  // lottery
  getLotteryPrizes, saveLotteryPrize, toggleLotteryPrize, deleteLotteryPrize, drawLotteryAtomic,
  reserveLotteryPhysicalInventory, releaseLotteryPhysicalInventory, cancelLotteryPhysicalInventory,
  // redeem records
  getRedeemRecords, getRedeemRecordsAdmin, addRedeemRecord, updateRedeemRecord, deleteRedeemRecord, deleteRedeemRecordsAdmin,
  // inventory
  getUserInventory, addToInventory, updateInventoryItem, deleteInventoryItem,
  clearUserInventory, clearUserRedeemRecords,
  // expenses
  addExpense, getExpenses, updateExpense, deleteExpense, getBackupSnapshot, restoreBackupSnapshot,
  // avatar frames
  getAvatarFrames, addAvatarFrame, updateAvatarFrame, deleteAvatarFrame,
  // shipments
  getShipments, getShipmentsAdmin, addShipment, updateShipment, deleteShipment, deleteShipmentAdmin,
  // content check
  checkTextSafe, checkImageSafe
};
