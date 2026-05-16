// cloudfunctions/adminAnnouncement/index.js
// 管理员公告管理（增删改查、启停）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLL = 'announcements';

const ADMIN_OPENIDS = [
  'oYBpx3ZRljxCk6pODSAyMShkyFJA' // 主账号 openid
];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  if (ADMIN_OPENIDS.indexOf(wxContext.OPENID) === -1) {
    return { code: -1, msg: '无管理员权限' };
  }

  const { action } = event;

  // ── 添加 ──
  if (action === 'add') {
    const { content } = event;
    if (!content || !content.trim()) return { code: -1, msg: '请输入公告内容' };
    try {
      // 先停用所有旧公告
      const { data: actives } = await db.collection(COLL)
        .where({ isActive: true }).get();
      for (const a of actives) {
        await db.collection(COLL).doc(a._id).update({ data: { isActive: false } });
      }

      const res = await db.collection(COLL).add({
        data: { content: content.trim(), isActive: true, createdAt: Date.now() }
      });
      return { code: 0, id: res._id };
    } catch (e) {
      return { code: -1, msg: e.message };
    }
  }

  // ── 切换启停 ──
  if (action === 'toggle') {
    const { id } = event;
    if (!id) return { code: -1, msg: '缺少 id' };
    try {
      const doc = await db.collection(COLL).doc(id).get();
      if (!doc.data) return { code: -1, msg: '公告不存在' };
      const newVal = !doc.data.isActive;
      // 如果要启用，先停用其他
      if (newVal) {
        const { data: actives } = await db.collection(COLL)
          .where({ isActive: true }).get();
        for (const a of actives) {
          await db.collection(COLL).doc(a._id).update({ data: { isActive: false } });
        }
      }
      await db.collection(COLL).doc(id).update({ data: { isActive: newVal } });
      return { code: 0, isActive: newVal };
    } catch (e) {
      return { code: -1, msg: e.message };
    }
  }

  // ── 删除 ──
  if (action === 'delete') {
    const { id } = event;
    if (!id) return { code: -1, msg: '缺少 id' };
    try {
      await db.collection(COLL).doc(id).remove();
      return { code: 0 };
    } catch (e) {
      return { code: -1, msg: e.message };
    }
  }

  // ── 列表 ──
  if (action === 'list') {
    try {
      const { data } = await db.collection(COLL)
        .orderBy('createdAt', 'desc').limit(50).get();
      return { code: 0, data };
    } catch (e) {
      return { code: -1, msg: e.message };
    }
  }

  return { code: -1, msg: '无效的 action' };
};
