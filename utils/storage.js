// utils/storage.js
// 本地持久化存储（云开发开通后自动降级为备用）
// 宠物 + 健康记录 + 提醒 三组数据

const CAT_KEY     = 'cats';
const RECORD_KEY = 'health_records';
const WEIGHT_KEY = 'weight_records';
const REMIND_KEY = 'reminders';
const SHIPPING_ADDRESS_KEY = 'shipping_addresses';

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
// 宠物
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
// 体重记录
// ════════════════════════════════════════════════════

function getWeightRecords()             { return _get(WEIGHT_KEY) || []; }
function saveWeightRecords(records)     { _set(WEIGHT_KEY, records); }

function addWeightRecord(record) {
  const records = getWeightRecords();
  records.push(record);
  saveWeightRecords(records);
}

function deleteWeightRecord(id) {
  saveWeightRecords(getWeightRecords().filter(r => r._id !== id));
}

function updateWeightRecord(id, updates) {
  const records = getWeightRecords();
  const idx = records.findIndex(r => r._id === id);
  if (idx !== -1) { records[idx] = { ...records[idx], ...updates }; saveWeightRecords(records); }
  return records[idx];
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

// ════════════════════════════════════════════════════
// 收货地址
// ════════════════════════════════════════════════════

function getShippingAddresses() { return _get(SHIPPING_ADDRESS_KEY) || []; }
function saveShippingAddresses(addresses) { _set(SHIPPING_ADDRESS_KEY, addresses); }

function addShippingAddress(address) {
  const addresses = getShippingAddresses();
  if (!address._id) address._id = 'addr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  if (addresses.length === 0) address.isDefault = true;
  addresses.unshift(address);
  saveShippingAddresses(addresses);
  return addresses;
}

function updateShippingAddress(id, updates) {
  const addresses = getShippingAddresses();
  const idx = addresses.findIndex(a => a._id === id);
  if (idx !== -1) { addresses[idx] = { ...addresses[idx], ...updates }; saveShippingAddresses(addresses); }
  return addresses[idx];
}

function deleteShippingAddress(id) {
  const addresses = getShippingAddresses();
  const deleted = addresses.find(a => a._id === id);
  const filtered = addresses.filter(a => a._id !== id);
  if (deleted && deleted.isDefault && filtered.length > 0) { filtered[0].isDefault = true; }
  saveShippingAddresses(filtered);
}

function setDefaultAddress(id) {
  const addresses = getShippingAddresses();
  addresses.forEach(a => { a.isDefault = (a._id === id); });
  saveShippingAddresses(addresses);
}

// ════════════════════════════════════════════════════
// 积分商城 - 商品
// ════════════════════════════════════════════════════
const REDEEM_ITEM_KEY = 'redeem_items';
const REDEEM_RECORD_KEY = 'redeem_records';
const INVENTORY_KEY = 'user_inventory';
const AVATAR_FRAME_KEY = 'avatar_frames';

// 默认头像框
var DEFAULT_AVATAR_FRAMES = [
  { _id: 'frame_none', name: '无', cssClass: '', image: '', rarity: 'common' },
  { _id: 'frame_golden', name: '金色光环', cssClass: 'frame-golden', image: '', rarity: 'rare', points: 200 },
  { _id: 'frame_sakura', name: '樱花粉', cssClass: 'frame-sakura', image: '', rarity: 'rare', points: 200 },
  { _id: 'frame_ocean', name: '深海蓝', cssClass: 'frame-ocean', image: '', rarity: 'rare', points: 200 },
  { _id: 'frame_emerald', name: '翡翠绿', cssClass: 'frame-emerald', image: '', rarity: 'epic', points: 350 },
  { _id: 'frame_violet', name: '紫罗兰', cssClass: 'frame-violet', image: '', rarity: 'epic', points: 350 },
  { _id: 'frame_rainbow', name: '彩虹之梦', cssClass: 'frame-rainbow', image: '', rarity: 'legendary', points: 500 }
];

// 默认商品
var DEFAULT_REDEEM_ITEMS = [
  { _id: 'item_card_1', name: '1张补签卡', type: 'virtual', virtualType: 'card', virtualValue: 1, points: 50, stock: 9999, enabled: true, image: '', desc: '补签一次，可补签过去7天' },
  { _id: 'item_card_5', name: '5张补签卡', type: 'virtual', virtualType: 'card', virtualValue: 5, points: 200, stock: 9999, enabled: true, image: '', desc: '5张补签卡，超值套装' },
  { _id: 'item_points_50', name: '50积分', type: 'virtual', virtualType: 'points', virtualValue: 50, points: 100, stock: 9999, enabled: true, image: '', desc: '兑换后直接到账50积分' },
  { _id: 'item_pet_toy', name: '羽毛逗宠棒', type: 'physical', points: 300, stock: 50, enabled: true, image: '', desc: '可爱羽毛逗宠棒，让宠物动起来', category: '玩具' },
  { _id: 'item_pet_bowl', name: '宠物陶瓷碗', type: 'physical', points: 500, stock: 30, enabled: true, image: '', desc: '高颜值陶瓷宠物碗，安全健康', category: '餐具' },
  { _id: 'item_pet_bed', name: '宠物小窝', type: 'physical', points: 1000, stock: 10, enabled: true, image: '', desc: '柔软舒适的宠物小窝，给毛孩子一个温暖的家', category: '家居' }
];

var _seedDone = false;

function getRedeemItems() {
  var items = _get(REDEEM_ITEM_KEY);
  if (!items || items.length === 0) { items = DEFAULT_REDEEM_ITEMS.concat([]); _set(REDEEM_ITEM_KEY, items); }
  return items;
}

function saveRedeemItems(items) { _set(REDEEM_ITEM_KEY, items); }

function addRedeemItem(item) {
  if (!item._id) item._id = 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  var items = getRedeemItems();
  items.unshift(item);
  saveRedeemItems(items);
  return items;
}

function updateRedeemItem(id, updates) {
  var items = getRedeemItems();
  var idx = items.findIndex(function(i) { return i._id === id; });
  if (idx !== -1) { items[idx] = { ...items[idx], ...updates }; saveRedeemItems(items); }
  return items[idx];
}

function deleteRedeemItem(id) {
  saveRedeemItems(getRedeemItems().filter(function(i) { return i._id !== id; }));
}

// ════════════════════════════════════════════════════
// 兑换记录
// ════════════════════════════════════════════════════

function getRedeemRecords() { return _get(REDEEM_RECORD_KEY) || []; }
function saveRedeemRecords(records) { _set(REDEEM_RECORD_KEY, records); }

function addRedeemRecord(record) {
  if (!record._id) record._id = 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  var records = getRedeemRecords();
  records.unshift(record);
  saveRedeemRecords(records);
  return record;
}

function updateRedeemRecord(id, updates) {
  var records = getRedeemRecords();
  var idx = records.findIndex(function(r) { return r._id === id; });
  if (idx !== -1) { records[idx] = { ...records[idx], ...updates }; saveRedeemRecords(records); }
  return records[idx];
}

// ════════════════════════════════════════════════════
// 用户背包
// ════════════════════════════════════════════════════

function getUserInventory() { return _get(INVENTORY_KEY) || []; }
function saveUserInventory(inventory) { _set(INVENTORY_KEY, inventory); }

function addToInventory(item) {
  if (!item._id) item._id = 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  var inventory = getUserInventory();
  inventory.unshift(item);
  saveUserInventory(inventory);
  return item;
}


function deleteRedeemRecord(id) {
  var records = getRedeemRecords();
  records = records.filter(function(r) { return r._id !== id; });
  saveRedeemRecords(records);
}

function updateInventoryItem(id, updates) {
  var inventory = getUserInventory();
  var idx = inventory.findIndex(function(i) { return i._id === id; });
  if (idx !== -1) { inventory[idx] = { ...inventory[idx], ...updates }; saveUserInventory(inventory); }
  return inventory[idx];
}

// ════════════════════════════════════════════════════
// 头像框
// ════════════════════════════════════════════════════

function getAvatarFrames() {
  var frames = _get(AVATAR_FRAME_KEY);
  if (!frames || frames.length === 0) { frames = DEFAULT_AVATAR_FRAMES.concat([]); _set(AVATAR_FRAME_KEY, frames); }
  return frames;
}

function saveAvatarFrames(frames) { _set(AVATAR_FRAME_KEY, frames); }

function addAvatarFrame(frame) {
  if (!frame._id) frame._id = 'frame_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  var frames = getAvatarFrames();
  frames.unshift(frame);
  saveAvatarFrames(frames);
  return frames;
}

function updateAvatarFrame(id, updates) {
  var frames = getAvatarFrames();
  var idx = frames.findIndex(function(f) { return f._id === id; });
  if (idx !== -1) { frames[idx] = { ...frames[idx], ...updates }; saveAvatarFrames(frames); }
  return frames[idx];
}


function deleteInventoryItem(id) {
  var items = getUserInventory();
  items = items.filter(function(i) { return i._id !== id; });
  saveUserInventory(items);
}

// ═══ 发货单 ═══
var SHIPMENT_KEY = 'cat_shipments';

function getShipments() {
  return wx.getStorageSync(SHIPMENT_KEY) || [];
}

function saveShipments(data) {
  wx.setStorageSync(SHIPMENT_KEY, data);
}

function addShipment(shipment) {
  var list = getShipments();
  shipment._id = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  shipment.createdAt = new Date().toISOString();
  list.unshift(shipment);
  saveShipments(list);
  return shipment;
}

function updateShipment(id, updates) {
  var list = getShipments();
  for (var i = 0; i < list.length; i++) {
    if (list[i]._id === id) {
      Object.assign(list[i], updates);
      saveShipments(list);
      return list[i];
    }
  }
  return null;
}

function deleteShipment(id) {
  var list = getShipments();
  var newList = list.filter(function(s) { return s._id !== id; });
  saveShipments(newList);
  return true;
}



function clearUserInventory() {
  saveUserInventory([]);
  return 0;
}

// ─── 记账 (expenses) ───
var EXPENSE_KEY = 'expenses';
function getAllExpenses() {
  try { return wx.getStorageSync(EXPENSE_KEY) || []; } catch (e) { return []; }
}
function saveExpenses(list) {
  try { wx.setStorageSync(EXPENSE_KEY, list); } catch (e) {}
}
function addExpense(expense) {
  var list = getAllExpenses();
  if (!expense._id) expense._id = 'exp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  expense.createdAt = expense.createdAt || new Date().toISOString();
  list.unshift(expense);
  saveExpenses(list);
  return expense;
}
function getExpenses(query) {
  var list = getAllExpenses();
  if (!query) return list;
  if (query.dateStart) list = list.filter(function(e) { return e.date >= query.dateStart; });
  if (query.dateEnd) list = list.filter(function(e) { return e.date <= query.dateEnd; });
  list.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
  return list;
}
function deleteExpense(id) {
  var list = getAllExpenses().filter(function(e) { return e._id !== id; });
  saveExpenses(list);
}

function clearUserRedeemRecords() {
  saveRedeemRecords([]);
  return 0;
}

function deleteAvatarFrame(id) {
  saveAvatarFrames(getAvatarFrames().filter(function(f) { return f._id !== id; }));
}

module.exports = {
  getCats, saveCats, addCat, updateCat, removeCat,
  getRecords, saveRecords, addRecord, deleteRecord, updateRecord, getRecordsByCatId,
  getWeightRecords, saveWeightRecords, addWeightRecord, deleteWeightRecord, updateWeightRecord,
  getReminders, saveReminders, addReminder, deleteReminder, updateReminder, getRemindersByCatId,
  copyAvatarSync,
  getShippingAddresses, saveShippingAddresses, addShippingAddress, updateShippingAddress, deleteShippingAddress, setDefaultAddress,
  getRedeemItems, saveRedeemItems, addRedeemItem, updateRedeemItem, deleteRedeemItem,
  getRedeemRecords, addRedeemRecord, updateRedeemRecord, deleteRedeemRecord,
  getUserInventory, addToInventory, updateInventoryItem, deleteInventoryItem,
  clearUserInventory, clearUserRedeemRecords,
  // expenses
  addExpense, getAllExpenses, getExpenses, deleteExpense,
  getAvatarFrames, saveAvatarFrames, DEFAULT_AVATAR_FRAMES, DEFAULT_REDEEM_ITEMS, addAvatarFrame, updateAvatarFrame, deleteAvatarFrame,
  // shipments
  getShipments, addShipment, updateShipment, deleteShipment
};
