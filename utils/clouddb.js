// utils/clouddb.js
// 云数据库工具层：云开发 + 本地存储自动降级
// 所有页面统一通过此模块操作数据，无需关心底层数据源

// ⚙️ 调试开关：true=强制本地模式，false=自动判断（云环境ID配好后走云端）
const FORCE_LOCAL = false;  // TODO: 云开发部署完成后改为 false

// 集合名常量
const CAT_COL    = 'cats';
const RECORD_COL = 'health_records';
const REMIND_COL = 'reminders';
const USER_COL   = 'users';

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
  const res = await wx.cloud.database().collection(collection).add({ data });
  return res._id;
}

async function _cloudUpdate(collection, id, updates) {
  await wx.cloud.database().collection(collection).doc(id).update({ data: updates });
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
  // 必须显式用 _openid 过滤，微信云权限模型不会自动过滤查询结果
  const data = await _cloudQuery(USER_COL, { _openid: openid });
  return data.length > 0 ? data[0] : null;
}

async function getUserByPhone(phone) {
  if (!isCloudReady()) return null;
  const data = await _cloudQuery(USER_COL, { phone: phone });
  return data.length > 0 ? data[0] : null;
}

async function addUser(user) {
  if (!isCloudReady()) return null;
  // 注意：_openid 由平台自动注入到文档（基于创建者的身份），不能手动写入
  return await _cloudAdd(USER_COL, { ...user, _createTime: Date.now() });
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

module.exports = {
  isCloudReady,
  // cats
  getCats, getAllCats: getCats, getCatById, addCat, updateCat, deleteCat,
  // records
  getRecords, addRecord, updateRecord, deleteRecord,
  // reminders
  getReminders, addReminder, updateReminder, deleteReminder,
  // users
  getUserByOpenid, getUserByPhone, addUser, updateUser,
  // storage
  uploadAvatar, getAvatarUrl,
  // auth
  getOpenId,
  // stats
  getStats
};
