// cloudfunctions/adminFeedback/index.js
// 管理员操作留言板（采纳/取消采纳）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 管理员 openid 白名单（需与 utils/util.js、adminUsers、getAdminRecords 中的保持一致）
const ADMIN_OPENIDS = [
  'oYBpx3ZRljxCk6pODSAyMShkyFJA' // 主账号 openid
];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  if (ADMIN_OPENIDS.indexOf(wxContext.OPENID) === -1) {
    return { code: -1, msg: '无管理员权限' };
  }

  const { action, feedbackId } = event;
  if (!feedbackId) return { code: -1, msg: '缺少 feedbackId' };

  if (action === 'toggleAdopted') {
    try {
      const doc = await db.collection('feedback').doc(feedbackId).get();
      if (!doc.data) return { code: -1, msg: '留言不存在' };
      const newVal = !doc.data.adopted;
      await db.collection('feedback').doc(feedbackId).update({
        data: { adopted: newVal }
      });
      return { code: 0, adopted: newVal };
    } catch (e) {
      console.error('[adminFeedback] toggleAdopted error:', e);
      return { code: -1, msg: e.message };
    }
  }

  return { code: -1, msg: '无效的 action' };
};
