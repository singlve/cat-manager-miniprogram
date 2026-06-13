const cloud = require('wx-server-sdk');
const cloudbase = require('@cloudbase/node-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const app = cloudbase.init({ env: cloudbase.SYMBOL_DEFAULT_ENV });
const db = app.database();

const USER_COL = 'users';
const REQUEST_COL = 'redeem_requests';
const CUMULATIVE_MILESTONES = [
  { days: 7, points: 40, label: '7天' },
  { days: 30, points: 100, label: '30天' },
  { days: 60, points: 200, label: '60天' },
  { days: 100, points: 400, label: '100天' },
  { days: 365, points: 2000, label: '365天' }
];
const EDITABLE_FIELDS = new Set([
  'nickname', 'avatar', 'avatarEmoji', 'phone', 'password', 'loginType', 'activeTheme'
]);

function businessError(code, message) {
  const error = new Error(message);
  error.businessCode = code;
  return error;
}

function chinaDate(offsetDays = 0) {
  const shifted = new Date(Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 86400000);
  return shifted.toISOString().slice(0, 10);
}

function calcCheckInPoints(streak) {
  if (streak <= 3) return 10;
  if (streak <= 7) return 15;
  if (streak <= 30) return 20;
  return 25;
}

function nextCumulativeReward(totalCheckIns, claimedMilestones) {
  const claimed = new Set(Array.isArray(claimedMilestones) ? claimedMilestones : []);
  return CUMULATIVE_MILESTONES.find(item =>
    totalCheckIns >= item.days && !claimed.has(item.days)
  ) || null;
}

function normalizeThemes(value) {
  const themes = Array.isArray(value) ? value.slice() : [];
  if (!themes.includes('default')) themes.unshift('default');
  return Array.from(new Set(themes.filter(Boolean)));
}

function snapshot(user) {
  return {
    totalPoints: Math.max(0, parseInt(user.totalPoints, 10) || 0),
    totalCheckIns: Math.max(0, parseInt(user.totalCheckIns, 10) || 0),
    lastCheckInDate: String(user.lastCheckInDate || ''),
    checkInStreak: Math.max(0, parseInt(user.checkInStreak, 10) || 0),
    makeUpCards: Math.max(0, parseInt(user.makeUpCards, 10) || 0),
    makeUpDates: Array.isArray(user.makeUpDates) ? user.makeUpDates : [],
    monthlyMakeUpCount: Math.max(0, parseInt(user.monthlyMakeUpCount, 10) || 0),
    monthlyMakeUpMonth: String(user.monthlyMakeUpMonth || ''),
    claimedCumulativeMilestones: Array.isArray(user.claimedCumulativeMilestones)
      ? user.claimedCumulativeMilestones
      : [],
    lastGroupShareDate: String(user.lastGroupShareDate || ''),
    lastTimelineShareDate: String(user.lastTimelineShareDate || '')
  };
}

async function getOwnedUser(transaction, userId, openid) {
  if (!userId) throw businessError('INVALID_ARGUMENT', '缺少用户信息');
  const userRef = transaction.collection(USER_COL).doc(userId);
  const userResult = await userRef.get();
  const user = userResult && userResult.data;
  if (!user || user._openid !== openid) {
    throw businessError('USER_NOT_FOUND', '用户信息不存在或无权操作');
  }
  return { userRef, user };
}

function requestSignature(action, event) {
  return JSON.stringify({
    action,
    userId: String(event.userId || ''),
    date: String(event.date || ''),
    shareType: String(event.shareType || '')
  });
}

async function runIdempotent(event, openid, action, handler) {
  const requestId = String(event.requestId || '');
  if (!requestId) throw businessError('INVALID_ARGUMENT', '缺少请求标识');
  const signature = requestSignature(action, event);
  return db.runTransaction(async transaction => {
    const requestRef = transaction.collection(REQUEST_COL).doc(requestId);
    let oldRequest = null;
    try { oldRequest = await requestRef.get(); } catch (error) { oldRequest = null; }
    if (oldRequest && oldRequest.data) {
      if (oldRequest.data._openid !== openid || oldRequest.data.signature !== signature) {
        throw businessError('INVALID_REQUEST', '请求标识与当前操作不匹配');
      }
      return oldRequest.data.result;
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

async function updateFields(event, openid) {
  const userId = String(event.userId || '');
  const updates = event.updates && typeof event.updates === 'object' ? event.updates : {};
  const safeUpdates = {};
  Object.keys(updates).forEach(key => {
    if (EDITABLE_FIELDS.has(key)) safeUpdates[key] = updates[key];
  });
  if (!Object.keys(safeUpdates).length) {
    throw businessError('NO_EDITABLE_FIELDS', '没有可更新的资料字段');
  }

  return db.runTransaction(async transaction => {
    const { userRef, user } = await getOwnedUser(transaction, userId, openid);
    if (Object.prototype.hasOwnProperty.call(safeUpdates, 'activeTheme')) {
      const ownedThemes = normalizeThemes(user.ownedThemes);
      if (!ownedThemes.includes(String(safeUpdates.activeTheme || 'default'))) {
        throw businessError('THEME_NOT_OWNED', '尚未拥有该主题');
      }
    }
    if (safeUpdates.phone) {
      const duplicate = await transaction.collection(USER_COL).where({
        phone: String(safeUpdates.phone)
      }).get();
      const occupied = (duplicate.data || []).some(item => item._id !== userId);
      if (occupied) throw businessError('PHONE_EXISTS', '该手机号已被其他账号绑定');
    }
    await userRef.update(safeUpdates);
    return { updated: safeUpdates };
  });
}

async function checkIn(event, openid) {
  const userId = String(event.userId || '');
  return runIdempotent(event, openid, 'checkIn', async transaction => {
    const { userRef, user } = await getOwnedUser(transaction, userId, openid);
    const today = chinaDate();
    const yesterday = chinaDate(-1);
    if (user.lastCheckInDate === today) {
      return Object.assign(snapshot(user), { alreadyChecked: true, pointsEarned: 0 });
    }

    const streak = user.lastCheckInDate === yesterday
      ? Math.max(0, parseInt(user.checkInStreak, 10) || 0) + 1
      : 1;
    const totalCheckIns = Math.max(0, parseInt(user.totalCheckIns, 10) || 0) + 1;
    const basePoints = Math.max(0, parseInt(user.totalPoints, 10) || 0);
    const checkInPoints = calcCheckInPoints(streak);
    const claimed = Array.isArray(user.claimedCumulativeMilestones)
      ? user.claimedCumulativeMilestones.slice()
      : [];
    const cumulativeReward = nextCumulativeReward(totalCheckIns, claimed);
    if (cumulativeReward) claimed.push(cumulativeReward.days);
    const totalPoints = basePoints + checkInPoints + (cumulativeReward ? cumulativeReward.points : 0);
    const updates = {
      totalPoints,
      totalCheckIns,
      lastCheckInDate: today,
      checkInStreak: streak,
      claimedCumulativeMilestones: claimed
    };
    await userRef.update(updates);
    return Object.assign(snapshot(Object.assign({}, user, updates)), {
      alreadyChecked: false,
      pointsEarned: checkInPoints,
      cumulativeReward: cumulativeReward
        ? {
            earned: true,
            points: cumulativeReward.points,
            milestone: cumulativeReward.days,
            label: cumulativeReward.label
          }
        : null
    });
  });
}

async function makeUp(event, openid) {
  const userId = String(event.userId || '');
  const date = String(event.date || '');
  return runIdempotent(event, openid, 'makeUp', async transaction => {
    const { userRef, user } = await getOwnedUser(transaction, userId, openid);
    const today = chinaDate();
    const currentMonth = today.slice(0, 7);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= today || date.slice(0, 7) !== currentMonth) {
      throw businessError('INVALID_DATE', '只能补签本月已过去的日期');
    }
    const makeUpDates = Array.isArray(user.makeUpDates) ? user.makeUpDates.slice() : [];
    if (makeUpDates.includes(date)) throw businessError('ALREADY_MADE_UP', '该日期已经补签');
    const oldMonthlyCount = user.monthlyMakeUpMonth === currentMonth
      ? Math.max(0, parseInt(user.monthlyMakeUpCount, 10) || 0)
      : 0;
    if (oldMonthlyCount >= 4) throw businessError('MONTHLY_LIMIT', '本月补签次数已达上限');
    const cost = oldMonthlyCount + 1;
    const cards = Math.max(0, parseInt(user.makeUpCards, 10) || 0);
    if (cards < cost) throw businessError('CARD_NOT_ENOUGH', '补签卡不足，需要 ' + cost + ' 张');

    makeUpDates.push(date);
    const totalCheckIns = Math.max(0, parseInt(user.totalCheckIns, 10) || 0) + 1;
    const claimed = Array.isArray(user.claimedCumulativeMilestones)
      ? user.claimedCumulativeMilestones.slice()
      : [];
    const cumulativeReward = nextCumulativeReward(totalCheckIns, claimed);
    if (cumulativeReward) claimed.push(cumulativeReward.days);
    const totalPoints = Math.max(0, parseInt(user.totalPoints, 10) || 0) +
      (cumulativeReward ? cumulativeReward.points : 0);
    const updates = {
      totalPoints,
      totalCheckIns,
      makeUpCards: cards - cost,
      makeUpDates,
      monthlyMakeUpCount: oldMonthlyCount + 1,
      monthlyMakeUpMonth: currentMonth,
      claimedCumulativeMilestones: claimed
    };
    await userRef.update(updates);
    return Object.assign(snapshot(Object.assign({}, user, updates)), {
      cost,
      cumulativeReward: cumulativeReward
        ? {
            earned: true,
            points: cumulativeReward.points,
            milestone: cumulativeReward.days,
            label: cumulativeReward.label
          }
        : null
    });
  });
}

async function shareReward(event, openid) {
  const userId = String(event.userId || '');
  const shareType = event.shareType === 'timeline' ? 'timeline' : 'group';
  return runIdempotent(event, openid, 'shareReward', async transaction => {
    const { userRef, user } = await getOwnedUser(transaction, userId, openid);
    const today = chinaDate();
    const field = shareType === 'timeline' ? 'lastTimelineShareDate' : 'lastGroupShareDate';
    if (user[field] === today) {
      return Object.assign(snapshot(user), { alreadyRewarded: true });
    }
    const updates = {
      makeUpCards: Math.max(0, parseInt(user.makeUpCards, 10) || 0) + 1,
      [field]: today
    };
    await userRef.update(updates);
    return Object.assign(snapshot(Object.assign({}, user, updates)), { alreadyRewarded: false });
  });
}

exports.main = async event => {
  const openid = cloud.getWXContext().OPENID;
  const action = String(event.action || '');
  if (!openid) return { code: 'NOT_LOGGED_IN', msg: '无法获取用户身份' };
  try {
    let data;
    if (action === 'updateFields') data = await updateFields(event, openid);
    else if (action === 'checkIn') data = await checkIn(event, openid);
    else if (action === 'makeUp') data = await makeUp(event, openid);
    else if (action === 'shareReward') data = await shareReward(event, openid);
    else throw businessError('INVALID_ACTION', '不支持的用户操作');
    return { code: 0, data: data && data.result ? data.result : data };
  } catch (error) {
    console.error('[userAccount] failed:', action, error);
    return {
      code: error.businessCode || 'USER_ACTION_FAILED',
      msg: error.message || '操作失败，请重试'
    };
  }
};
