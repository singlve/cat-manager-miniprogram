// pages/feedback-post/feedback-post.js
const clouddb = require('../../utils/clouddb.js');

const POST_CATEGORIES = [
  { key: 'suggestion', label: '💡 建议' },
  { key: 'bug',        label: '🐛 Bug'  },
  { key: 'experience', label: '💬 体验' },
  { key: 'other',      label: '📌 其他' }
];

Page({
  data: {
    categories: POST_CATEGORIES,
    categoryIdx: 0,
    content: '',
    images: [],       // [{path, uploading}]
    maxImages: 4,
    submitting: false
  },

  onLoad() {
    var app = getApp();
    if (!app.isLoggedIn()) {
      wx.showModal({
        title: '需要登录',
        content: '登录后才能发布留言',
        confirmText: '去登录',
        success: function(r) { if (r.confirm) wx.navigateTo({ url: '/pages/login/login' }); else wx.navigateBack(); }
      });
    }
  },

  onCategoryChange(e) {
    this.setData({ categoryIdx: parseInt(e.detail.value) });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  // ─── 选择图片 ───
  chooseImage() {
    var remaining = this.data.maxImages - this.data.images.length;
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传' + this.data.maxImages + '张', icon: 'none' });
      return;
    }

    var self = this;
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function(res) {
        var newImages = (res.tempFiles || []).map(function(f) {
          return { path: f.tempFilePath, uploading: true };
        });
        self.setData({ images: self.data.images.concat(newImages) });
        // 逐个上传
        newImages.forEach(function(img, i) {
          self._uploadImage(self.data.images.length - newImages.length + i, img.path);
        });
      }
    });
  },

  async _uploadImage(idx, tempPath) {
    try {
      var currentUser = wx.getStorageSync('currentUser') || {};
      var cloudPath = 'feedback/' + Date.now() + '_' + idx + '.jpg';
      var res = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath });
      var images = this.data.images;
      images[idx] = { path: res.fileID, fileID: res.fileID, uploading: false };
      this.setData({ images: images });
    } catch (e) {
      console.error('[feedback-post] upload fail:', e);
      var images = this.data.images;
      images[idx].uploading = false;
      images[idx].error = true;
      this.setData({ images: images });
      wx.showToast({ title: '图片上传失败', icon: 'none' });
    }
  },

  removeImage(e) {
    var idx = e.currentTarget.dataset.idx;
    var images = this.data.images;
    images.splice(idx, 1);
    this.setData({ images: images });
  },

  // ─── 提交 ───
  async submit() {
    var content = (this.data.content || '').trim();
    if (!content) { wx.showToast({ title: '请输入内容', icon: 'none' }); return; }
    if (content.length > 1000) { wx.showToast({ title: '内容不能超过1000字', icon: 'none' }); return; }

    // 检查是否还有图片在上传
    var pending = this.data.images.filter(function(i) { return i.uploading; });
    if (pending.length > 0) {
      wx.showToast({ title: '图片上传中，请稍候', icon: 'none' });
      return;
    }

    var currentUser = {};
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}

    this.setData({ submitting: true });

    try {
      var imageUrls = this.data.images
        .filter(function(i) { return i.fileID && !i.error; })
        .map(function(i) { return i.fileID; });

      await clouddb.addFeedback({
        category: POST_CATEGORIES[this.data.categoryIdx].key,
        content: content,
        images: imageUrls,
        userNickname: currentUser.nickname || '匿名用户',
        userAvatar: currentUser.avatar || '',
        _openid: currentUser._openid || '',
        likes: [],
        likeCount: 0,
        comments: [],
        adopted: false
      });

      wx.showToast({ title: '发布成功', icon: 'success' });
      setTimeout(function() { wx.navigateBack(); }, 1000);
    } catch (e) {
      console.error('[feedback-post] submit fail:', e);
      wx.showToast({ title: '发布失败，请重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.png', title: '宠物健康管家 - 留言板', path: '/pages/feedback/feedback' };
  }
});
