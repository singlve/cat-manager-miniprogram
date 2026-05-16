// pages/feedback/feedback.js
// 留言板：发布留言、点赞、评论，管理员可采纳
const clouddb = require('../../utils/clouddb.js');
const { isAdmin } = require('../../utils/util.js');

const CATEGORIES = [
  { key: 'all',        label: '全部',  icon: '📋' },
  { key: 'suggestion', label: '建议',  icon: '💡' },
  { key: 'bug',        label: 'Bug',   icon: '🐛' },
  { key: 'experience', label: '体验',  icon: '💬' },
  { key: 'other',      label: '其他',  icon: '📌' }
];
Page({
  data: {
    isAdmin: false,
    feedbacks: [],
    filteredFeedbacks: [],
    filter: 'all',
    categories: CATEGORIES,
    loading: true,

    // 评论弹窗
    showCommentModal: false,
    commentTarget: null,    // feedback index
    replyTarget: null,      // comment index (null = 回复主贴)
    commentContent: '',
    commenting: false
  },

  onLoad() {
    this.setData({ isAdmin: isAdmin() });
  },

  onShow() {
    this.loadFeedbacks();
  },

  async loadFeedbacks() {
    this.setData({ loading: true });
    try {
      var list = await clouddb.getFeedback() || [];
      // 获取当前用户 openid
      var currentUser = {};
      try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}
      var currentOpenid = currentUser._openid || '';

      list.forEach(function(f) {
        f._time = formatTime(f.createdAt);
        f._liked = currentOpenid ? (f.likes || []).indexOf(currentOpenid) !== -1 : false;
        f._commentCount = (f.comments || []).length;
      });

      this.setData({ feedbacks: list, filteredFeedbacks: list, loading: false });
    } catch (e) {
      console.error('[feedback] load fail:', e);
      this.setData({ loading: false });
    }
  },

  // ─── 筛选 ───
  setFilter(e) {
    var f = e.currentTarget.dataset.filter;
    this.setData({ filter: f, filteredFeedbacks: this._applyFilter(f) });
  },

  _applyFilter(f) {
    var filter = f || this.data.filter;
    var list = this.data.feedbacks;
    if (filter === 'all') return list;
    return list.filter(function(item) { return item.category === filter; });
  },

  _applyCurrentFilter() {
    return this._applyFilter(this.data.filter);
  },

  // ─── 发布 ───
  openPost() {
    wx.navigateTo({ url: '/pages/feedback-post/feedback-post' });
  },

  // ─── 点赞 ───
  async toggleLike(e) {
    var fid = e.currentTarget.dataset.id;
    var idx = e.currentTarget.dataset.idx;
    var app = getApp();
    if (!app.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    var currentUser = {};
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}
    var openid = currentUser._openid;
    if (!openid) { wx.showToast({ title: '获取用户信息失败', icon: 'none' }); return; }

    // 乐观更新
    var feedbacks = this.data.feedbacks;
    var f = feedbacks[idx];
    var likes = f.likes || [];
    var likedIdx = likes.indexOf(openid);
    if (likedIdx === -1) {
      likes.push(openid);
      f.likeCount = (f.likeCount || 0) + 1;
      f._liked = true;
    } else {
      likes.splice(likedIdx, 1);
      f.likeCount = Math.max(0, (f.likeCount || 1) - 1);
      f._liked = false;
    }
    this.setData({ feedbacks: feedbacks, filteredFeedbacks: this._applyCurrentFilter() });

    // 异步写云端 + 通知
    clouddb.toggleFeedbackLike(fid, openid);
    if (f._liked) this._notifyAuthor(f, 'like');
  },

  // ─── 评论 ───
  openComment(e) {
    var idx = e.currentTarget.dataset.idx;
    var cmtIdx = e.currentTarget.dataset.cmtIdx;
    var app = getApp();
    if (!app.isLoggedIn()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    this.setData({
      showCommentModal: true,
      commentTarget: idx,
      replyTarget: cmtIdx !== undefined ? cmtIdx : null,
      commentContent: ''
    });
  },

  replyComment(e) {
    this.openComment(e);
  },

  closeComment() { this.setData({ showCommentModal: false, commentTarget: null }); },

  onCommentInput(e) { this.setData({ commentContent: e.detail.value }); },

  async doComment() {
    var content = (this.data.commentContent || '').trim();
    if (!content) { wx.showToast({ title: '请输入内容', icon: 'none' }); return; }

    var currentUser = {};
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}

    var feedbacks = this.data.feedbacks;
    var f = feedbacks[this.data.commentTarget];
    var replyTarget = this.data.replyTarget;
    var entry = {
      _openid: currentUser._openid || '',
      userNickname: currentUser.nickname || '匿名用户',
      userAvatar: currentUser.avatar || '',
      content: content,
      createdAt: new Date().toISOString()
    };

    this.setData({ commenting: true });

    try {
      if (replyTarget !== null) {
        // 回复某条评论
        await clouddb.addCommentReply(f._id, replyTarget, entry);
        if (!f.comments[replyTarget].replies) f.comments[replyTarget].replies = [];
        f.comments[replyTarget].replies.push(entry);
      } else {
        // 回复主贴
        await clouddb.addFeedbackComment(f._id, entry);
        if (!f.comments) f.comments = [];
        f.comments.push(entry);
        f._commentCount = f.comments.length;
      }

      this.setData({ feedbacks: feedbacks, filteredFeedbacks: this._applyCurrentFilter(), showCommentModal: false, commentTarget: null, replyTarget: null });
      this._notifyAuthor(f, 'comment');
      wx.showToast({ title: '评论成功', icon: 'success' });
    } catch (e) {
      console.error('[feedback] comment fail:', e);
      wx.showToast({ title: '评论失败', icon: 'none' });
    } finally {
      this.setData({ commenting: false });
    }
  },

  // ─── 采纳（管理员） ───
  async toggleAdopted(e) {
    var fid = e.currentTarget.dataset.id;
    var idx = e.currentTarget.dataset.idx;
    var res = await clouddb.toggleFeedbackAdopted(fid);
    if (res && res.code === 0) {
      var feedbacks = this.data.feedbacks;
      feedbacks[idx].adopted = res.adopted;
      this.setData({ feedbacks: feedbacks, filteredFeedbacks: this._applyCurrentFilter() });
      wx.showToast({ title: res.adopted ? '已采纳' : '已取消采纳', icon: 'success' });
    } else {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  previewImage(e) {
    var url = e.currentTarget.dataset.url;
    var fb = this.data.feedbackList; // not used, need to show all images from this feedback
    if (url) {
      wx.previewImage({ urls: [url], current: url });
    }
  },

  _notifyAuthor(f, type) {
    var currentUser = {};
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}
    var myOpenid = currentUser._openid;
    if (!myOpenid || !f._openid || f._openid === myOpenid) return; // 不给自己发通知

    var snippet = '';
    if (type === 'like') {
      snippet = (currentUser.nickname || '匿名用户') + ' 赞了你的留言';
    } else {
      snippet = (currentUser.nickname || '匿名用户') + ' 评论了你的留言';
    }

    clouddb.addNotification({
      toOpenid: f._openid,
      fromNickname: currentUser.nickname || '匿名用户',
      type: type,
      feedbackId: f._id,
      snippet: snippet
    });
  },

  stopBubble() {},

  async onPullDownRefresh() {
    try { await this.loadFeedbacks(); } finally { wx.stopPullDownRefresh(); }
  },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.png', title: '宠物健康管家 - 留言板', path: '/pages/feedback/feedback' };
  }
});

// ─── 工具：格式化时间 ───
function formatTime(ts) {
  if (!ts) return '';
  var d = new Date(typeof ts === 'number' ? ts : ts);
  var now = new Date();
  var diff = now - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}
