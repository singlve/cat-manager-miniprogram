// cloudfunctions/adminUsers/index.js
// 管理员搜索/更新用户数据
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const ADMIN_OPENIDS = [
  'oYBpx3ZRljxCk6pODSAyMShkyFJA'
];

// 允许管理员修改的字段
const ALLOWED_UPDATE_FIELDS = [
  'lastCheckInDate', 'checkInStreak', 'totalCheckIns',
  'makeUpDates', 'makeUpCards', 'monthlyMakeUpCount',
  'drawnMilestones', 'lotteryUsed', 'lotteryUsedMonth',
  'totalPoints', 'claimedCumulativeMilestones',
  'nickname'
];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  if (ADMIN_OPENIDS.indexOf(wxContext.OPENID) === -1) {
    return { code: -1, msg: '无管理员权限' };
  }

  const { action } = event;

  // ── 搜索用户 ──
  if (action === 'search') {
    const { type, keyword } = event;
    if (!keyword || !keyword.trim()) {
      return { code: -1, msg: '请输入搜索关键词' };
    }

    try {
      let data = [];
      if (type === 'phone') {
        // 手机号精确匹配
        const res = await db.collection('users')
          .where({ phone: keyword.trim() })
          .limit(20)
          .get();
        data = res.data;
      } else {
        // 昵称模糊匹配
        const res = await db.collection('users')
          .where({ nickname: db.RegExp({ regexp: keyword.trim(), options: 'i' }) })
          .limit(20)
          .get();
        data = res.data;
      }

      // 脱敏：移除密码字段
      const clean = data.map(u => {
        const { password, ...safe } = u;
        return safe;
      });

      return { code: 0, data: clean };
    } catch (e) {
      console.error('[adminUsers] search error:', e);
      return { code: -1, msg: '搜索失败: ' + e.message };
    }
  }

  // ── 更新用户 ──
  if (action === 'update') {
    const { userId, updates } = event;
    if (!userId) return { code: -1, msg: '缺少 userId' };
    if (!updates || typeof updates !== 'object') return { code: -1, msg: '缺少更新数据' };

    // 字段白名单过滤
    const filtered = {};
    for (const key of Object.keys(updates)) {
      if (ALLOWED_UPDATE_FIELDS.indexOf(key) !== -1) {
        filtered[key] = updates[key];
      }
    }

    if (Object.keys(filtered).length === 0) {
      return { code: -1, msg: '没有可更新的字段' };
    }

    try {
      await db.collection('users').doc(userId).update({ data: filtered });
      return { code: 0, msg: '更新成功' };
    } catch (e) {
      console.error('[adminUsers] update error:', e);
      return { code: -1, msg: '更新失败: ' + e.message };
    }
  }

  return { code: -1, msg: '无效的 action: ' + (action || '无') };
};
