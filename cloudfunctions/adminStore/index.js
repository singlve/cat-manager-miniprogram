const cloud = require('wx-server-sdk');
const cloudbase = require('@cloudbase/node-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const wxDb = cloud.database();
const app = cloudbase.init({ env: cloudbase.SYMBOL_DEFAULT_ENV });
const db = app.database();

const LEGACY_ADMIN_OPENID = 'oYBpx3ZRljxCk6pODSAyMShkyFJA';
const ITEM_COL = 'redeem_items';
const SHIPMENT_COL = 'shipments';
const INVENTORY_COL = 'user_inventory';
const RECORD_COL = 'redeem_records';
const USER_COL = 'users';
const VIRTUAL_TYPES = new Set(['card', 'points', 'theme']);

async function isServerAdmin(openid) {
  if (!openid) return false;
  const configured = String(process.env.ADMIN_OPENIDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (configured.includes(openid) || openid === LEGACY_ADMIN_OPENID) return true;
  const result = await wxDb.collection(USER_COL)
    .where({ _openid: openid, role: 'admin' })
    .limit(1)
    .get();
  return !!(result.data && result.data.length);
}

function cleanItem(input) {
  input = input && typeof input === 'object' ? input : {};
  const type = input.type === 'physical' ? 'physical' : 'virtual';
  const item = {
    name: String(input.name || '').trim().slice(0, 40),
    type,
    points: Math.max(0, Math.min(1000000, parseInt(input.points, 10) || 0)),
    stock: Math.max(0, Math.min(999999, parseInt(input.stock, 10) || 0)),
    enabled: input.enabled !== false,
    desc: String(input.desc || '').trim().slice(0, 200),
    image: String(input.image || '').trim().slice(0, 500)
  };
  if (!item.name) throw new Error('请输入商品名称');
  if (type === 'virtual') {
    const virtualType = VIRTUAL_TYPES.has(input.virtualType) ? input.virtualType : 'card';
    item.virtualType = virtualType;
    item.virtualValue = virtualType === 'theme'
      ? String(input.virtualValue || '').trim().slice(0, 60)
      : Math.max(1, Math.min(1000000, parseInt(input.virtualValue, 10) || 1));
    if (virtualType === 'theme' && !item.virtualValue) throw new Error('请选择主题');
    if (virtualType === 'theme') {
      item.stock = 9999;
      item.systemManaged = true;
      item.systemKey = 'theme:' + item.virtualValue;
    }
  }
  return item;
}

async function listAll(collection, orderBy, direction, maxRows = 500) {
  const rows = [];
  let skip = 0;
  while (rows.length < maxRows) {
    let query = wxDb.collection(collection).skip(skip).limit(Math.min(100, maxRows - rows.length));
    if (orderBy) query = query.orderBy(orderBy, direction || 'desc');
    const result = await query.get();
    const batch = result.data || [];
    rows.push(...batch);
    if (batch.length < 100) break;
    skip += batch.length;
  }
  return rows;
}

async function shipOrder(event) {
  const shipmentId = String(event.shipmentId || '');
  const carrier = String(event.carrier || '').trim().slice(0, 30);
  const trackingNo = String(event.trackingNo || '').trim().slice(0, 80);
  if (!shipmentId || !carrier || !trackingNo) throw new Error('发货参数不完整');

  return db.runTransaction(async transaction => {
    const shipmentRef = transaction.collection(SHIPMENT_COL).doc(shipmentId);
    const shipmentResult = await shipmentRef.get();
    const shipment = shipmentResult && shipmentResult.data;
    if (!shipment) throw new Error('发货单不存在');
    if (shipment.status !== 'pending') throw new Error('该发货单当前不能重复发货');
    const shippedAt = new Date().toISOString();
    const updates = { status: 'shipped', carrier, trackingNo, shippedAt };
    await shipmentRef.update(updates);

    for (const inventoryId of (shipment.inventoryIds || [])) {
      const ref = transaction.collection(INVENTORY_COL).doc(inventoryId);
      const result = await ref.get();
      if (result && result.data && result.data.status === 'pending') {
        await ref.update({ status: 'shipped', carrier, trackingNo });
      }
    }
    for (const recordId of (shipment.redeemRecordIds || [])) {
      const ref = transaction.collection(RECORD_COL).doc(recordId);
      const result = await ref.get();
      if (result && result.data && result.data.status === 'pending') {
        await ref.update(updates);
      }
    }
    return { shipped: true };
  });
}

exports.main = async event => {
  const openid = cloud.getWXContext().OPENID;
  if (!(await isServerAdmin(openid))) return { code: 'FORBIDDEN', msg: '无管理员权限' };
  const action = String(event.action || '');
  try {
    if (action === 'listItems') {
      return { code: 0, data: await listAll(ITEM_COL, '', '', 500) };
    }
    if (action === 'saveItem') {
      const id = String(event.id || '');
      const item = cleanItem(event.item);
      if (id) {
        await wxDb.collection(ITEM_COL).doc(id).update({ data: item });
        return { code: 0, data: Object.assign({ _id: id }, item) };
      }
      const result = await wxDb.collection(ITEM_COL).add({
        data: Object.assign({}, item, { createdAt: new Date().toISOString() })
      });
      return { code: 0, data: Object.assign({ _id: result._id }, item) };
    }
    if (action === 'deleteItem') {
      const id = String(event.id || '');
      const result = await wxDb.collection(ITEM_COL).doc(id).get();
      const item = result && result.data;
      if (!item) throw new Error('商品不存在');
      if (item.virtualType === 'theme') throw new Error('主题商品只能下架，不能删除');
      await wxDb.collection(ITEM_COL).doc(id).remove();
      return { code: 0, data: { deleted: 1 } };
    }
    if (action === 'listShipments') {
      return { code: 0, data: await listAll(SHIPMENT_COL, 'createdAt', 'desc', 500) };
    }
    if (action === 'listUserPhones') {
      const users = await listAll(USER_COL, '', '', 500);
      return {
        code: 0,
        data: users.map(user => ({ _openid: user._openid || '', phone: user.phone || '' }))
      };
    }
    if (action === 'shipOrder') {
      const data = await shipOrder(event);
      return { code: 0, data: data && data.result ? data.result : data };
    }
    return { code: 'INVALID_ACTION', msg: '不支持的管理操作' };
  } catch (error) {
    console.error('[adminStore] failed:', action, error);
    return { code: 'ADMIN_STORE_FAILED', msg: error.message || '管理操作失败' };
  }
};
