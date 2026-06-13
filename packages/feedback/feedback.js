// packages/feedback/feedback.js
// 留言板：发布留言、点赞、评论、通知中心，管理员可采纳/删除
const clouddb = require('../../utils/clouddb.js');
const { isAdmin } = require('../../utils/util.js');

const CATEGORIES = [
  { key: 'all',        label: '全部',  iconPath: '/assets/icons/ui/record.png' },
  { key: 'mine',       label: '我的',  iconPath: '/assets/icons/ui/user.png' },
  { key: 'liked',      label: '喜欢',  iconPath: '/assets/icons/ui/heart.png' },
  { key: 'adopted',    label: '采纳',  iconPath: '/assets/icons/ui/done.png' },
  { key: 'suggestion', label: '建议',  iconPath: '/assets/icons/ui/edit.png' },
  { key: 'bug',        label: 'Bug',   iconPath: '/assets/icons/ui/warning.png' },
  { key: 'experience', label: '体验',  iconPath: '/assets/icons/ui/feedback.png' },
  { key: 'other',      label: '其他',  iconPath: '/assets/icons/ui/other.png' }
];
const { syncPageTheme } = require('../../utils/themes.js');

Page({
  data: {
    isAdmin: false,
    currentOpenid: '',
    feedbacks: [],
    filteredFeedbacks: [],
    filter: 'all',
    categories: CATEGORIES,
    loading: true,
    loadError: false,

    // 通知
    notifications: [],
    unreadNotifications: [],
    unreadNotifyCount: 0,
    latestNotifyAvatar: '',
    showNotifyPanel: false,

    // 评论弹窗
    showCommentModal: false,
    commentTarget: null,
    replyTarget: null,
    commentContent: '',
    commenting: false
  },

  onLoad() {
    this.setData({ isAdmin: isAdmin() });
  },

  onShow() {
    syncPageTheme(this);
    this.loadFeedbacks();
    this._loadNotifications();
  },

  async loadFeedbacks() {
    this.setData({ loading: true, loadError: false });
    try {
      var list = await clouddb.getFeedback() || [];
      var currentUser = {};
      try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}
      var currentOpenid = currentUser._openid || '';

      // 收集所有 cloud:// 文件 ID，批量换取临时链接
      var cloudFileIds = [];
      list.forEach(function(f) {
        if (f.userAvatar && f.userAvatar.indexOf('cloud://') === 0) cloudFileIds.push(f.userAvatar);
        (f.images || []).forEach(function(img) {
          // images 元素可能是字符串或 {fileID, path} 对象
          var fid = typeof img === 'string' ? img : (img && (img.fileID || img.path));
          if (fid && fid.indexOf('cloud://') === 0) cloudFileIds.push(fid);
        });
      });
      var tempUrlMap = {};
      if (cloudFileIds.length > 0) {
        // 去重后分批走云函数（绕过客户端存储权限限制）
        var uniqueIds = [];
        var seen = {};
        cloudFileIds.forEach(function(id) { if (!seen[id]) { seen[id] = true; uniqueIds.push(id); } });
        for (var i = 0; i < uniqueIds.length; i += 50) {
          var batch = uniqueIds.slice(i, i + 50);
          try {
            var cfRes = await wx.cloud.callFunction({
              name: 'adminFeedback',
              data: { action: 'getTempUrls', fileIds: batch }
            });
            if (cfRes.result && cfRes.result.code === 0) {
              (cfRes.result.fileList || []).forEach(function(item) {
                if (item.tempFileURL) tempUrlMap[item.fileID] = item.tempFileURL;
              });
            }
          } catch (e) { console.error('[feedback] getTempUrls batch fail:', e); }
        }
      }

      list.forEach(function(f) {
        f._time = formatTime(f.createdAt);
        f._liked = currentOpenid ? (f.likes || []).indexOf(currentOpenid) !== -1 : false;
        f._commentCount = (f.comments || []).length;
        // 头像：只在 getTempFileURL 成功返回临时链接时才用图片，否则走文字兜底
        var av = f.userAvatar;
        f._avatarUrl = '';
        if (av && av !== 'emoji' && av.indexOf('cloud://') === 0 && tempUrlMap[av]) {
          f._avatarUrl = tempUrlMap[av];
        }
        // 图片：转换成功用临时链接，失败不显示（避免 cloud:// 当本地路径报 500）
        f._imageUrls = [];
        (f.images || []).forEach(function(img) {
          var fid = typeof img === 'string' ? img : (img && (img.fileID || img.path));
          if (fid) {
            var url = tempUrlMap[fid] || '';
            if (url) f._imageUrls.push(url);
          }
        });
      });

      this.setData({ feedbacks: list, filteredFeedbacks: this._applyFilter(this.data.filter, list), loading: false, loadError: false, currentOpenid: currentOpenid });
    } catch (e) {
      console.error('[feedback] load fail:', e);
      this.setData({ loading: false, loadError: true });
    }
  },

  retryLoad() {
    this.loadFeedbacks();
    this._loadNotifications();
  },

  // ─── 通知 ───
  async _loadNotifications() {
    var openid = this.data.currentOpenid;
    if (!openid) {
      try {
        var cu = wx.getStorageSync('currentUser') || {};
        openid = cu._openid || '';
      } catch (e) {}
    }
    if (!openid) return;
    try {
      var list = await clouddb.getNotifications(openid);
      var unread = list.filter(function(n) { return !n.read; });
      list.forEach(function(n) {
        n._time = formatTime(n.createdAt);
        n._iconPath = n.type === 'like' ? '/assets/icons/ui/heart.png' : n.type === 'comment' ? '/assets/icons/ui/comment.png' : '/assets/icons/ui/done.png';
      });
      // 最新一条通知的头像（cloud:// 需走云函数换临时链接）
      var latestAvatar = '';
      if (list.length > 0) {
        var raw = list[0].fromAvatar || '';
        if (raw && raw !== 'emoji' && raw.indexOf('cloud://') === 0) {
          try {
            var cfRes = await wx.cloud.callFunction({
              name: 'adminFeedback',
              data: { action: 'getTempUrls', fileIds: [raw] }
            });
            if (cfRes.result && cfRes.result.code === 0) {
              var files = cfRes.result.fileList || [];
              if (files[0] && files[0].tempFileURL) latestAvatar = files[0].tempFileURL;
            }
          } catch (e) { console.error('[feedback] notify avatar getTempUrls fail:', e); }
        } else {
          latestAvatar = raw;
        }
      }
      this.setData({ notifications: list, unreadNotifyCount: unread.length, latestNotifyAvatar: latestAvatar });
    } catch (e) {
      console.error('[feedback] loadNotifications fail:', e);
    }
  },

  async _markAllNotificationsRead() {
    if (this.data.unreadNotifyCount === 0) return;
    this.setData({ unreadNotifyCount: 0 });
    // 乐观更新本地列表
    var list = this.data.notifications.map(function(n) { n.read = true; return n; });
    this.setData({ notifications: list });
    try {
      var openid = this.data.currentOpenid;
      if (openid) await clouddb.markNotificationsRead(openid);
    } catch (e) {}
  },

  openNotifyPanel() {
    // 先取未读列表，再标记已读
    var unread = this.data.notifications.filter(function(n) { return !n.read; });
    this.setData({ showNotifyPanel: true, unreadNotifications: unread });
    this._markAllNotificationsRead();
  },

  closeNotifyPanel() {
    this.setData({ showNotifyPanel: false });
  },

  // 点击通知 → 定位到对应留言
  goToFeedback(e) {
    var fid = e.currentTarget.dataset.fid;
    var list = this.data.feedbacks;
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i]._id === fid) { idx = i; break; }
    }
    if (idx === -1) {
      wx.showToast({ title: '留言已被删除', icon: 'none' });
      return;
    }
    this.setData({ showNotifyPanel: false });
    // 高亮闪烁一下目标卡片
    var key = 'feedbacks[' + idx + ']._highlight';
    var obj = {}; obj[key] = true; this.setData(obj);
    var self = this;
    setTimeout(function() {
      obj[key] = false;
      self.setData(obj);
    }, 2000);
    // 滚动到该留言
    wx.pageScrollTo({ selector: '#fb-' + idx, duration: 300 });
  },

  // ─── 筛选 ───
  setFilter(e) {
    var f = e.currentTarget.dataset.filter;
    this.setData({ filter: f, filteredFeedbacks: this._applyFilter(f) });
  },

  _applyFilter(f, list) {
    var filter = f || this.data.filter;
    var feedbacks = list || this.data.feedbacks;
    var openid = this.data.currentOpenid;
    if (filter === 'all') return feedbacks;
    if (filter === 'mine') return feedbacks.filter(function(item) { return item._openid === openid; });
    if (filter === 'liked') return feedbacks.filter(function(item) { return item._liked; });
    if (filter === 'adopted') return feedbacks.filter(function(item) { return item.adopted && item._openid === openid; });
    return feedbacks.filter(function(item) { return item.category === filter; });
  },

  _applyCurrentFilter() {
    return this._applyFilter(this.data.filter);
  },

  // ─── 发布 ───
  openPost() {
    wx.navigateTo({ url: '/packages/feedback-post/feedback-post' });
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
        var replyId = await clouddb.addCommentReply(f._id, replyTarget, entry);
        entry._id = replyId;
        if (!f.comments[replyTarget].replies) f.comments[replyTarget].replies = [];
        f.comments[replyTarget].replies.push(entry);
      } else {
        var commentId = await clouddb.addFeedbackComment(f._id, entry);
        entry._id = commentId;
        if (!f.comments) f.comments = [];
        f.comments.push(entry);
        f._commentCount = f.comments.length;
      }

      this.setData({ feedbacks: feedbacks, filteredFeedbacks: this._applyCurrentFilter(), showCommentModal: false, commentTarget: null, replyTarget: null });
      // 通知留言作者
      this._notifyAuthor(f, 'comment');
      // 回复评论时，也通知被回复的评论者（只要不是自己）
      if (replyTarget !== null) {
        var commentedUser = f.comments[replyTarget];
        if (commentedUser && commentedUser._openid) {
          this._notifyUser(commentedUser._openid, f._id, 'comment', (currentUser.nickname || '匿名用户') + ' 回复了你的评论');
        }
      }
      wx.showToast({ title: '评论成功', icon: 'success' });
    } catch (e) {
      console.error('[feedback] comment fail:', e);
      wx.showToast({ title: '评论失败', icon: 'none' });
    } finally {
      this.setData({ commenting: false });
    }
  },

  // ─── 采纳（管理员）───
  async toggleAdopted(e) {
    var fid = e.currentTarget.dataset.id;
    var idx = e.currentTarget.dataset.idx;
    var res = await clouddb.toggleFeedbackAdopted(fid);
    if (res && res.code === 0) {
      var feedbacks = this.data.feedbacks;
      feedbacks[idx].adopted = res.adopted;
      this.setData({ feedbacks: feedbacks, filteredFeedbacks: this._applyCurrentFilter() });
      wx.showToast({ title: res.adopted ? '已采纳' : '已取消采纳', icon: 'success' });
      // 通知作者
      if (res.adopted) this._notifyAuthor(feedbacks[idx], 'adopted');
    } else {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  // ─── 删除留言 ───
  async deleteFeedback(e) {
    var fid = e.currentTarget.dataset.id;
    var idx = e.currentTarget.dataset.idx;
    var fb = this.data.feedbacks[idx];
    if (!fb) return;

    var firstConfirmed = await new Promise(function(r) {
      wx.showModal({
        title: '删除留言',
        content: '留言及其评论、点赞信息会一并删除。',
        confirmText: '继续',
        confirmColor: '#F36B6B',
        success: function(res) { r(res.confirm); }
      });
    });
    if (!firstConfirmed) return;
    var confirmed = await new Promise(function(r) {
      wx.showModal({
        title: '再次确认删除',
        content: '删除后无法恢复，请再次确认是否删除。',
        confirmText: '确认删除',
        confirmColor: '#F36B6B',
        success: function(res) { r(res.confirm); }
      });
    });
    if (!confirmed) return;

    wx.showLoading({ title: '删除中...' });
    var result = await clouddb.deleteFeedback(fid, fb._openid);
    wx.hideLoading();

    if (result && result.code === 0) {
      var feedbacks = this.data.feedbacks;
      feedbacks.splice(idx, 1);
      this.setData({ feedbacks: feedbacks, filteredFeedbacks: this._applyCurrentFilter() });
      wx.showToast({ title: '已删除', icon: 'success' });
    } else {
      wx.showToast({ title: (result && result.msg) || '删除失败', icon: 'none' });
    }
  },

  previewImage(e) {
    var url = e.currentTarget.dataset.url;
    if (url) {
      wx.previewImage({ urls: [url], current: url });
    }
  },

  _notifyAuthor(f, type) {
    if (!f._openid) return;
    var snippet = '';
    if (type === 'like') {
      snippet = this._myNickname() + ' 赞了你的留言';
    } else if (type === 'adopted') {
      snippet = '你的留言被管理员采纳了';
    } else {
      snippet = this._myNickname() + ' 评论了你的留言';
    }
    this._notifyUser(f._openid, f._id, type, snippet);
  },

  _notifyUser(toOpenid, feedbackId, type, snippet) {
    var myOpenid = this.data.currentOpenid;
    if (!myOpenid) { console.warn('[feedback] _notifyUser skip: myOpenid is empty'); return; }
    if (!toOpenid) { console.warn('[feedback] _notifyUser skip: toOpenid is empty'); return; }
    if (toOpenid === myOpenid) return;
    console.log('[feedback] _notifyUser send:', { toOpenid, type, snippet });
    clouddb.addNotification({
      toOpenid: toOpenid,
      fromNickname: this._myNickname(),
      fromAvatar: this._myAvatar(),
      type: type,
      feedbackId: feedbackId,
      snippet: snippet
    });
  },

  _myNickname() {
    try {
      var cu = wx.getStorageSync('currentUser') || {};
      return cu.nickname || '匿名用户';
    } catch (e) { return '匿名用户'; }
  },

  _myAvatar() {
    try {
      var cu = wx.getStorageSync('currentUser') || {};
      return cu.avatar || '';
    } catch (e) { return ''; }
  },

  stopBubble() {},

  async onPullDownRefresh() {
    try { await this.loadFeedbacks(); await this._loadNotifications(); } finally { wx.stopPullDownRefresh(); }
  },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.jpg', title: '宠物小管家Plus - 记录宝贝的健康日常', path: '/pages/cat-list/cat-list' };
  }
});

// ─── 工具 ───
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
