// utils/storage.js
// 本地持久化存储（云开发开通后自动降级为备用）
// 猫咪 + 健康记录 + 提醒 三组数据

const CAT_KEY    = 'cats';
const RECORD_KEY = 'health_records';
const REMIND_KEY = 'reminders';

// ════════════════════════════════════════════════════
// 通用读写
// ════════════════════════════════════════════════════
function _get(key) {
  try { const d = wx.getStorageSync(key); return d ? JSON.parse(d) : null; } catch (e) { return null; }
}
function _set(key, data) {
  try { wx.setStorageSync(key, JSON.stringify(data)); } catch (e) { console.error('[storage] set fail:', e); }
}

// ════════════════════════════════════════════════════
// 猫咪
// ════════════════════════════════════════════════════

function getCats()    { return _get(CAT_KEY) || []; }
function saveCats(cats) { _set(CAT_KEY, cats); }

function addCat(cat) {
  const cats = getCats();
  cats.unshift(cat);
  saveCats(cats);
  return cats;
}

function updateCat(id, updates) {
  const cats = getCats();
  const idx = cats.findIndex(c => c._id === id);
  if (idx !== -1) { cats[idx] = { ...cats[idx], ...updates }; saveCats(cats); }
  return cats;
}

function removeCat(id) {
  saveCats(getCats().filter(c => c._id !== id));
  // 同时删除该猫的健康记录和提醒
  saveRecords(getRecords().filter(r => r.catId !== id));
  saveReminders(getReminders().filter(r => r.catId !== id));
}

// ════════════════════════════════════════════════════
// 健康记录
// ════════════════════════════════════════════════════

function getRecords()          { return _get(RECORD_KEY) || []; }
function saveRecords(records)  { _set(RECORD_KEY, records); }

function addRecord(record) {
  const records = getRecords();
  records.unshift(record);
  saveRecords(records);
  return record;
}

function deleteRecord(id) {
  saveRecords(getRecords().filter(r => r._id !== id));
}

function updateRecord(id, updates) {
  const records = getRecords();
  const idx = records.findIndex(r => r._id === id);
  if (idx !== -1) { records[idx] = { ...records[idx], ...updates }; saveRecords(records); }
  return records[idx];
}

function getRecordsByCatId(catId) {
  return getRecords().filter(r => r.catId === catId);
}

// ════════════════════════════════════════════════════
// 提醒
// ════════════════════════════════════════════════════

function getReminders()            { return _get(REMIND_KEY) || []; }
function saveReminders(reminders)  { _set(REMIND_KEY, reminders); }

function addReminder(reminder) {
  const reminders = getReminders();
  reminders.unshift(reminder);
  saveReminders(reminders);
  return reminder;
}

function deleteReminder(id) {
  saveReminders(getReminders().filter(r => r._id !== id));
}

function updateReminder(id, updates) {
  const reminders = getReminders();
  const idx = reminders.findIndex(r => r._id === id);
  if (idx !== -1) { reminders[idx] = { ...reminders[idx], ...updates }; saveReminders(reminders); }
  return reminders[idx];
}

function getRemindersByCatId(catId) {
  return getReminders().filter(r => r.catId === catId);
}

// ════════════════════════════════════════════════════
// 头像本地持久化
// ════════════════════════════════════════════════════

function copyAvatarSync(tempPath, catId) {
  if (!tempPath || (!tempPath.includes('/tmp/') && !tempPath.includes('wxfile://'))) {
    return tempPath;
  }
  try {
    const fs = wx.getFileSystemManager();
    const savedPath = `${wx.env.USER_DATA_PATH}/avatar_${catId}_${Date.now()}.jpg`;
    fs.saveFileSync(tempPath, savedPath);
    return savedPath;
  } catch (e) { return tempPath; }
}

module.exports = {
  getCats, saveCats, addCat, updateCat, removeCat,
  getRecords, saveRecords, addRecord, deleteRecord, updateRecord, getRecordsByCatId,
  getReminders, saveReminders, addReminder, deleteReminder, updateReminder, getRemindersByCatId,
  copyAvatarSync
};
