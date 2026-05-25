// cloudfunctions/adminFeedback/index.js
// 留言板操作：管理员（采纳/删除）+ 公开（评论/回复）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 管理员 openid 白名单
const ADMIN_OPENIDS = [
  'oYBpx3ZRljxCk6pODSAyMShkyFJA'
];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { action, feedbackId } = event;

  // ── 公开操作：批量换取云存储临时链接（绕过客户端存储权限）──
  if (action === 'getTempUrls') {
    const fileIds = event.fileIds;
    if (!fileIds || !fileIds.length) return { code: -1, msg: '缺少 fileIds' };
    try {
      const res = await cloud.getTempFileURL({ fileList: fileIds });
      return { code: 0, fileList: res.fileList };
    } catch (e) {
      return { code: -1, msg: e.message };
    }
  }

  // ── 公开操作：标记通知已读 ──
  if (action === 'markNotificationsRead') {
    const targetOpenid = event.openid || wxContext.OPENID;
    if (!targetOpenid) return { code: -1, msg: '无法获取用户身份' };
    try {
      const { data } = await db.collection('notifications')
        .where({ toOpenid: targetOpenid, read: false }).get();
      for (const item of data) {
        await db.collection('notifications').doc(item._id).update({ data: { read: true } });
      }
      return { code: 0, count: data.length };
    } catch (e) {
      return { code: -1, msg: e.message };
    }
  }

  // ── 公开操作：点赞/取消点赞 ──
  if (action === 'toggleLike') {
    if (!feedbackId) return { code: -1, msg: '缺少 feedbackId' };
    const likeOpenid = event.openid || wxContext.OPENID;
    if (!likeOpenid) return { code: -1, msg: '无法获取用户身份' };
    try {
      const doc = await db.collection('feedback').doc(feedbackId).get();
      if (!doc.data) return { code: -1, msg: '留言不存在' };
      const likes = doc.data.likes || [];
      const idx = likes.indexOf(likeOpenid);
      if (idx === -1) {
        await db.collection('feedback').doc(feedbackId).update({
          data: { likes: _.push([likeOpenid]), likeCount: _.inc(1) }
        });
        return { code: 0, liked: true };
      } else {
        await db.collection('feedback').doc(feedbackId).update({
          data: { likes: _.pull(likeOpenid), likeCount: _.inc(-1) }
        });
        return { code: 0, liked: false };
      }
    } catch (e) {
      return { code: -1, msg: e.message };
    }
  }

  // ── 公开操作：添加评论（任何登录用户可调用）──
  if (action === 'addComment') {
    if (!feedbackId) return { code: -1, msg: '缺少 feedbackId' };
    const comment = event.comment;
    if (!comment || !comment.content) return { code: -1, msg: '缺少评论内容' };
    comment._id = 'cmt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    comment.replies = [];
    try {
      await db.collection('feedback').doc(feedbackId).update({
        data: { comments: _.push([comment]) }
      });
      return { code: 0, commentId: comment._id };
    } catch (e) {
      return { code: -1, msg: e.message };
    }
  }

  // ── 公开操作：添加评论回复 ──
  if (action === 'addCommentReply') {
    if (!feedbackId) return { code: -1, msg: '缺少 feedbackId' };
    const commentIdx = event.commentIdx;
    const reply = event.reply;
    if (commentIdx === undefined || commentIdx === null) return { code: -1, msg: '缺少 commentIdx' };
    if (!reply || !reply.content) return { code: -1, msg: '缺少回复内容' };
    try {
      const doc = await db.collection('feedback').doc(feedbackId).get();
      if (!doc.data) return { code: -1, msg: '留言不存在' };
      const comments = doc.data.comments || [];
      if (!comments[commentIdx]) return { code: -1, msg: '评论不存在' };
      reply._id = 'rpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      if (!comments[commentIdx].replies) comments[commentIdx].replies = [];
      comments[commentIdx].replies.push(reply);
      await db.collection('feedback').doc(feedbackId).update({
        data: { comments }
      });
      return { code: 0, replyId: reply._id };
    } catch (e) {
      return { code: -1, msg: e.message };
    }
  }

  // ── 以下为管理员专属操作 ──
  if (ADMIN_OPENIDS.indexOf(wxContext.OPENID) === -1) {
    return { code: -1, msg: '无管理员权限' };
  }

  if (!feedbackId) return { code: -1, msg: '缺少 feedbackId' };

  // 采纳/取消采纳
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
      return { code: -1, msg: e.message };
    }
  }

  // 删除留言
  if (action === 'delete') {
    try {
      await db.collection('feedback').doc(feedbackId).remove();
      return { code: 0 };
    } catch (e) {
      return { code: -1, msg: e.message };
    }
  }

  return { code: -1, msg: '无效的 action' };
};
