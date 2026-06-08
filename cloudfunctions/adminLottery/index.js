const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLL = 'lottery_prizes';
const LEGACY_ADMIN_OPENID = 'oYBpx3ZRljxCk6pODSAyMShkyFJA';

const DEFAULT_PRIZES = [
  { _id: 'lottery_points_5', name: '5积分', type: 'virtual', virtualType: 'points', virtualValue: 5, weight: 30, color: '#E9857B', enabled: true, sort: 10 },
  { _id: 'lottery_points_10', name: '10积分', type: 'virtual', virtualType: 'points', virtualValue: 10, weight: 25, color: '#5BA7D8', enabled: true, sort: 20 },
  { _id: 'lottery_card_1', name: '1张补签卡', type: 'virtual', virtualType: 'card', virtualValue: 1, weight: 20, color: '#6BC6B3', enabled: true, sort: 30 },
  { _id: 'lottery_none', name: '谢谢参与', type: 'virtual', virtualType: 'none', virtualValue: 0, weight: 10, color: '#A5AFBC', enabled: true, sort: 40 },
  { _id: 'lottery_points_20', name: '20积分', type: 'virtual', virtualType: 'points', virtualValue: 20, weight: 10, color: '#FFB86B', enabled: true, sort: 50 },
  { _id: 'lottery_card_2', name: '2张补签卡', type: 'virtual', virtualType: 'card', virtualValue: 2, weight: 5, color: '#8F7CC3', enabled: true, sort: 60 }
];

function normalizeThemes(value) {
  const themes = Array.isArray(value) ? value.slice() : [];
  if (themes.indexOf('default') === -1) themes.unshift('default');
  return Array.from(new Set(themes.filter(Boolean)));
}

async function isServerAdmin(openid) {
  if (!openid) return false;
  const configured = String(process.env.ADMIN_OPENIDS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (configured.indexOf(openid) !== -1 || openid === LEGACY_ADMIN_OPENID) return true;
  const result = await db.collection('users').where({ _openid: openid, role: 'admin' }).limit(1).get();
  return !!(result.data && result.data.length);
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

async function ensureCollection() {
  try {
    await db.collection(COLL).limit(1).get();
  } catch (error) {
    if (!isCollectionMissing(error)) throw error;
    try {
      await db.createCollection(COLL);
    } catch (createError) {
      // 两个首次请求可能同时创建集合；若另一请求已创建成功，可继续使用。
      if (!/already exists|DATABASE_COLLECTION_EXIST|COLLECTION_EXIST/i.test(String(createError && (createError.message || createError.errMsg) || ''))) {
        throw createError;
      }
    }
  }
}

async function ensureDefaults() {
  await ensureCollection();
  const existing = await db.collection(COLL).limit(1).get();
  if (existing.data && existing.data.length) return;
  for (const prize of DEFAULT_PRIZES) {
    const { _id, ...data } = prize;
    await db.collection(COLL).doc(_id).set({
      data: Object.assign({}, data, { createdAt: Date.now(), updatedAt: Date.now() })
    });
  }
}

function normalizePrize(input) {
  const type = input.type === 'physical' ? 'physical' : 'virtual';
  const allowedVirtual = ['points', 'card', 'theme', 'none'];
  const virtualType = allowedVirtual.indexOf(input.virtualType) !== -1 ? input.virtualType : 'points';
  const prize = {
    name: String(input.name || '').trim(),
    type,
    weight: Math.max(0, parseInt(input.weight, 10) || 0),
    enabled: input.enabled !== false,
    color: String(input.color || '#5BA7D8'),
    image: String(input.image || ''),
    desc: String(input.desc || '').trim(),
    sort: parseInt(input.sort, 10) || 0,
    updatedAt: Date.now()
  };
  if (type === 'virtual') {
    prize.virtualType = virtualType;
    prize.virtualValue = virtualType === 'theme'
      ? String(input.virtualValue || '')
      : Math.max(0, parseInt(input.virtualValue, 10) || 0);
    prize.stock = 999999;
  } else {
    prize.stock = Math.max(0, parseInt(input.stock, 10) || 0);
    prize.linkedItemId = String(input.linkedItemId || '');
  }
  return prize;
}

exports.main = async event => {
  const wxContext = cloud.getWXContext();
  const action = event.action;

  try {
    if (action === 'listActive') {
      await ensureDefaults();
      const result = await db.collection(COLL).orderBy('sort', 'asc').limit(50).get();
      let ownedThemes = ['default'];
      if (wxContext.OPENID) {
        const userResult = await db.collection('users')
          .where({ _openid: wxContext.OPENID })
          .limit(1)
          .get();
        if (userResult.data && userResult.data[0]) {
          ownedThemes = normalizeThemes(userResult.data[0].ownedThemes);
        }
      }
      const prizes = (result.data || []).filter(prize => {
        if (prize.enabled === false) return false;
        if ((parseInt(prize.weight, 10) || 0) <= 0) return false;
        if (prize.type === 'physical' && (parseInt(prize.stock, 10) || 0) <= 0) return false;
        if (prize.virtualType === 'theme' && ownedThemes.indexOf(prize.virtualValue) !== -1) return false;
        return true;
      });
      return { code: 0, data: prizes };
    }

    if (!(await isServerAdmin(wxContext.OPENID))) {
      return { code: 'FORBIDDEN', msg: '无管理员权限' };
    }

    if (action === 'list') {
      await ensureDefaults();
      const result = await db.collection(COLL).orderBy('sort', 'asc').limit(100).get();
      return { code: 0, data: result.data || [] };
    }

    if (action === 'add') {
      await ensureDefaults();
      const prize = normalizePrize(event.prize || {});
      if (!prize.name) return { code: 'INVALID_NAME', msg: '请输入奖品名称' };
      if (prize.type === 'virtual' && prize.virtualType === 'theme' && !prize.virtualValue) {
        return { code: 'INVALID_THEME', msg: '请选择主题' };
      }
      prize.createdAt = Date.now();
      const result = await db.collection(COLL).add({ data: prize });
      return { code: 0, id: result._id };
    }

    if (action === 'update') {
      await ensureCollection();
      if (!event.id) return { code: 'INVALID_ID', msg: '缺少奖品ID' };
      const prize = normalizePrize(event.prize || {});
      if (!prize.name) return { code: 'INVALID_NAME', msg: '请输入奖品名称' };
      await db.collection(COLL).doc(event.id).update({ data: prize });
      return { code: 0 };
    }

    if (action === 'toggle') {
      await ensureCollection();
      if (!event.id) return { code: 'INVALID_ID', msg: '缺少奖品ID' };
      await db.collection(COLL).doc(event.id).update({
        data: { enabled: !!event.enabled, updatedAt: Date.now() }
      });
      return { code: 0 };
    }

    if (action === 'delete') {
      await ensureCollection();
      if (!event.id) return { code: 'INVALID_ID', msg: '缺少奖品ID' };
      await db.collection(COLL).doc(event.id).remove();
      return { code: 0 };
    }

    if (action === 'seed') {
      await ensureDefaults();
      return { code: 0 };
    }
    return { code: 'INVALID_ACTION', msg: '无效的 action' };
  } catch (error) {
    console.error('[adminLottery] failed:', error);
    return { code: 'LOTTERY_ADMIN_FAILED', msg: error.message || '操作失败' };
  }
};
