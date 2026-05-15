// 云函数：清空指定集合或所有集合的所有文档（仅限管理员）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 管理员 openid 白名单（需与 utils/util.js 中的 ADMIN_OPENIDS 保持一致）
const ADMIN_OPENIDS = [
  'oYBpx3ZRljxCk6pODSAyMShkyFJA'  // 主账号 openid
];

// 允许清理的集合白名单
const ALLOWED_COLLECTIONS = ['users', 'cats', 'health_records', 'reminders', 'reminder_logs'];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  if (ADMIN_OPENIDS.indexOf(wxContext.OPENID) === -1) {
    return { success: false, message: '无管理员权限' };
  }

  const { action } = event;

  const toClean = action === 'all'
    ? ALLOWED_COLLECTIONS
    : (ALLOWED_COLLECTIONS.includes(action) ? [action] : []);

  if (toClean.length === 0) {
    return { success: false, message: '无效的集合名称' };
  }

  const results = {};

  for (const col of toClean) {
    let deleted = 0;
    try {
      // 循环批量删除，直到集合清空
      while (true) {
        const { data } = await db.collection(col).limit(100).get();
        if (data.length === 0) break;

        const ids = data.map(d => d._id);
        for (const id of ids) {
          try {
            await db.collection(col).doc(id).remove();
            deleted++;
          } catch (e) {
            // 忽略单条删除失败（如权限问题）
          }
        }
        if (data.length < 100) break;
      }
      results[col] = { success: true, deleted };
    } catch (e) {
      results[col] = { success: false, error: e.message || String(e) };
    }
  }

  return { success: true, results };
};
