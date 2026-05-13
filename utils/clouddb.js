// utils/clouddb.js
// 云数据库工具层：云开发 + 本地存储自动降级
// 所有页面统一通过此模块操作数据，无需关心底层数据源

// ⚙️ 调试开关：true=强制本地模式，false=自动判断（云环境ID配好后走云端）
const FORCE_LOCAL = false;  // TODO: 云开发部署完成后改为 false

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
  if (options.limit) q = q.limit(options.limit);
  const { data } = await q.get();
  return data || [];
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

// ════════════════════════════════════════════════════
// 猫咪档案（CATS）
// ════════════════════════════════════════════════════

async function getCats() {
  if (!isCloudReady()) return _storage().getCats() || [];
  return await _cloudQuery(CAT_COL, {}, { orderBy: '_createTime', orderDesc: 'desc' });
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

async function addCat(cat) {
  if (!isCloudReady()) { _storage().addCat(cat); return cat._id; }
  return await _cloudAdd(CAT_COL, { ...cat, _createTime: Date.now() });
}

async function updateCat(id, updates) {
  if (!isCloudReady()) { _storage().updateCat(id, updates); return; }
  await _cloudUpdate(CAT_COL, id, updates);
}

async function deleteCat(id) {
  if (!isCloudReady()) { _storage().removeCat(id); return; }
  // 云端：删除关联记录和提醒，再删猫咪
  const records = await _cloudQuery(RECORD_COL, { catId: id });
  for (const r of records) await _cloudDelete(RECORD_COL, r._id);
  const reminders = await _cloudQuery(REMIND_COL, { catId: id });
  for (const r of reminders) await _cloudDelete(REMIND_COL, r._id);
  await _cloudDelete(CAT_COL, id);
}

// ════════════════════════════════════════════════════
// 健康记录（HEALTH RECORDS）
// ════════════════════════════════════════════════════

async function getRecords(filter = {}) {
  if (!isCloudReady()) {
    const records = _storage().getRecords();
    if (filter.catId) return records.filter(r => r.catId === filter.catId);
    return records;
  }
  return await _cloudQuery(RECORD_COL, filter, { orderBy: 'date', orderDesc: 'desc' });
}

async function addRecord(record) {
  if (!isCloudReady()) { _storage().addRecord(record); return record._id; }
  return await _cloudAdd(RECORD_COL, { ...record, _createTime: Date.now() });
}

async function updateRecord(id, updates) {
  if (!isCloudReady()) { _storage().updateRecord(id, updates); return; }
  await _cloudUpdate(RECORD_COL, id, updates);
}

async function deleteRecord(id) {
  if (!isCloudReady()) { _storage().deleteRecord(id); return; }
  await _cloudDelete(RECORD_COL, id);
}

// ════════════════════════════════════════════════════
// 体重记录（WEIGHT RECORDS）
// ════════════════════════════════════════════════════

async function getWeightRecords(filter = {}) {
  if (!isCloudReady()) {
    const records = _storage().getWeightRecords ? _storage().getWeightRecords() : [];
    if (filter.catId) return records.filter(r => r.catId === filter.catId);
    return records;
  }
  return await _cloudQuery(WEIGHT_COL, filter, { orderBy: 'date', orderDesc: 'desc' });
}

async function addWeightRecord(record) {
  if (!isCloudReady()) {
    if (_storage().addWeightRecord) _storage().addWeightRecord(record);
    return record._id;
  }
  return await _cloudAdd(WEIGHT_COL, { ...record, _createTime: Date.now() });
}

async function updateWeightRecord(id, updates) {
  if (!isCloudReady()) {
    if (_storage().updateWeightRecord) _storage().updateWeightRecord(id, updates);
    return;
  }
  await _cloudUpdate(WEIGHT_COL, id, updates);
}

async function deleteWeightRecord(id) {
  if (!isCloudReady()) {
    if (_storage().deleteWeightRecord) _storage().deleteWeightRecord(id);
    return;
  }
  await _cloudDelete(WEIGHT_COL, id);
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
  return await _cloudQuery(REMIND_COL, filter, { orderBy: '_createTime', orderDesc: 'desc' });
}

async function addReminder(reminder) {
  if (!isCloudReady()) { _storage().addReminder(reminder); return reminder._id; }
  return await _cloudAdd(REMIND_COL, { ...reminder, _createTime: Date.now() });
}

async function updateReminder(id, updates) {
  if (!isCloudReady()) { _storage().updateReminder(id, updates); return; }
  await _cloudUpdate(REMIND_COL, id, updates);
}

async function deleteReminder(id) {
  if (!isCloudReady()) { _storage().deleteReminder(id); return; }
  await _cloudDelete(REMIND_COL, id);
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
  await _cloudUpdate(USER_COL, id, updates);
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
    return res.fileID;
  } catch (e) {
    console.error('[clouddb] upload avatar failed:', e);
    return _storage().copyAvatarSync(tempFilePath, catId);
  }
}

async function getAvatarUrl(fileId) {
  if (!fileId) return '';
  if (!fileId.startsWith('cloud://')) return fileId; // 本地路径直接用
  if (!isCloudReady()) return fileId;
  try {
    const res = await wx.cloud.getTempFileURL({ fileList: [fileId] });
    if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
      return res.fileList[0].tempFileURL;
    }
    return fileId;
  } catch (e) { return fileId; }
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
      const next = new Date(r.lastDate);
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
async function getRedeemItems() {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      const { data } = await db.collection(REDEEM_ITEM_COL).get();
      if (!data || data.length === 0) {
        await _seedRedeemItems(db);
        const { data: seeded } = await db.collection(REDEEM_ITEM_COL).get();
        return seeded;
      }
      return data;
    } catch (e) { console.error('[clouddb] getRedeemItems fail', e); }
  }
  return _storage().getRedeemItems();
}

async function _seedRedeemItems(db) {
  const seed = _storage().DEFAULT_REDEEM_ITEMS || _storage().getRedeemItems();
  for (var i = 0; i < seed.length; i++) {
    await db.collection(REDEEM_ITEM_COL).add({ data: seed[i] }).catch(function() {});
  }
}

async function addRedeemItem(item) {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection(REDEEM_ITEM_COL).add({ data: item });
      item._id = res._id;
      return item;
    } catch (e) { console.error('[clouddb] addRedeemItem fail', e); }
  }
  return _storage().addRedeemItem(item);
}

async function updateRedeemItem(id, updates) {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      await db.collection(REDEEM_ITEM_COL).doc(id).update({ data: updates });
      return { _id: id, ...updates };
    } catch (e) { console.error('[clouddb] updateRedeemItem fail', e); }
  }
  return _storage().updateRedeemItem(id, updates);
}

async function deleteRedeemItem(id) {
  if (isCloudReady()) {
    try {
      const db = wx.cloud.database();
      await db.collection(REDEEM_ITEM_COL).doc(id).remove();
      return true;
    } catch (e) { console.error('[clouddb] deleteRedeemItem fail', e); }
  }
  return _storage().deleteRedeemItem(id);
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
      const db = wx.cloud.database();
      const openid = await getOpenId();
      const coll = db.collection(REDEEM_RECORD_COL).where({ _openid: openid, ...filter });
      const { data } = await coll.orderBy('redeemedAt', 'desc').get();
      return data;
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

// ════════════════════════════════════════════════════
// 用户背包
// ════════════════════════════════════════════════════
async function getUserInventory() {
  if (isCloudReady()) {
    try {
      const openid = await getOpenId();
      const db = wx.cloud.database();
      const { data } = await db.collection(INVENTORY_COL)
        .where({ _openid: openid })
        .orderBy('ownedAt', 'desc')
        .get();
      return data;
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
    try {
      var db2 = wx.cloud.database();
      var res = await db2.collection(SHIPMENT_COL).orderBy('createdAt', 'desc').limit(100).get();
      return res.data;
    } catch (e) { console.error('[clouddb] getShipmentsAdmin fail', e); }
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
    try {
      var db2 = wx.cloud.database();
      await db2.collection(SHIPMENT_COL).doc(id).update({ data: updates });
      return { _id: id, ...updates };
    } catch (e) { console.error('[clouddb] updateShipment fail', e); }
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

module.exports = {
  isCloudReady,
  // cats
  getCats, getAllCats: getCats, getCatById, addCat, updateCat, deleteCat,
  // records
  getRecords, addRecord, updateRecord, deleteRecord,
  // weight
  getWeightRecords, addWeightRecord, updateWeightRecord, deleteWeightRecord,
  // reminders
  getReminders, addReminder, updateReminder, deleteReminder,
  // users
  getUserByOpenid, getUserByPhone, addUser, updateUser,
  // storage
  uploadAvatar, getAvatarUrl,
  // auth
  getOpenId,
  // stats
  getStats,
  // shipping
  getShippingAddresses, addShippingAddress, updateShippingAddress, deleteShippingAddress, setDefaultAddress,
  // redeem items
  getRedeemItems, addRedeemItem, updateRedeemItem, deleteRedeemItem,
  // redeem records
  getRedeemRecords, getRedeemRecordsAdmin, addRedeemRecord, updateRedeemRecord, deleteRedeemRecord,
  // inventory
  getUserInventory, addToInventory, updateInventoryItem, deleteInventoryItem,
  clearUserInventory, clearUserRedeemRecords,
  // avatar frames
  getAvatarFrames, addAvatarFrame, updateAvatarFrame, deleteAvatarFrame,
  // shipments
  getShipments, getShipmentsAdmin, addShipment, updateShipment, deleteShipment
};
