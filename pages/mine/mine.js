// pages/mine/mine.js
// 「我的」页面
const clouddb = require('../../utils/clouddb.js');

function getAvatarEmoji(currentUser) {
  if (currentUser && currentUser.avatarEmoji) return currentUser.avatarEmoji;
  if (currentUser && currentUser.avatar && currentUser.avatar.startsWith('data:image/svg')) return '😺';
  return '😺';
}

Page({
  data: {
    nickname: '加载中...',
    avatar: '',
    avatarEmoji: '😺',
    phone: '',
    catCount: 0,
    reminderCount: 0,
    recordCount: 0,
    // 资料编辑
    showEditModal: false,
    editNickname: '',
    editEmoji: '😺',
    emojiList: ['😺', '😸', '😻', '🐱', '😽', '😹', '😼', '🐈', '🐈‍⬛', '🦁', '🐯', '🐻', '🐨', '🐼', '🐰', '🐶', '🐹', '🐷', '🦊', '🦄'],
    // 绑定手机
    showBindPhone: false,
    bindPhone: '',
    bindPassword: '',
    bindConfirm: ''
  },

  onShow() { this.loadUserInfo(); },

  async loadUserInfo() {
    let currentUser = null;
    try { currentUser = wx.getStorageSync('currentUser'); } catch (e) {}

    const nickname = (currentUser && currentUser.nickname) || '猫咪爱好者';
    const avatarEmoji = getAvatarEmoji(currentUser);

    this.setData({
      nickname,
      avatar: currentUser && currentUser.avatar || '',
      avatarEmoji,
      phone: currentUser && currentUser.phone
        ? currentUser.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
        : ''
    });

    try {
      const [cats, reminders, records] = await Promise.all([
        clouddb.getCats(),
        clouddb.getReminders(),
        clouddb.getRecords()
      ]);
      this.setData({
        catCount: cats.length,
        reminderCount: reminders.length,
        recordCount: records.length
      });
    } catch (e) {
      console.error('[mine] loadUserInfo error:', e);
    }
  },

  goCats()      { wx.switchTab({ url: '/pages/cat-list/cat-list' }); },
  goReminders() { wx.switchTab({ url: '/pages/reminders/reminders' }); },
  goRecords()   { wx.navigateTo({ url: '/pages/health-records/health-records' }); },
  goAbout()     { wx.navigateTo({ url: '/pages/about/about' }); },

  // ─── 编辑个人资料 ───
  openEditProfile() {
    this.setData({
      showEditModal: true,
      editNickname: this.data.nickname,
      editEmoji: this.data.avatarEmoji
    });
  },

  stopBubble() {}, // 阻止事件冒泡

  selectEmoji(e) { this.setData({ editEmoji: e.currentTarget.dataset.emoji }); },

  onNicknameInput(e) { this.setData({ editNickname: e.detail.value }); },

  confirmEdit() {
    const nickname = this.data.editNickname.trim();
    if (!nickname) { wx.showToast({ title: '昵称不能为空', icon: 'none' }); return; }

    let currentUser = null;
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}
    currentUser.nickname = nickname;
    currentUser.avatar = 'emoji';
    currentUser.avatarEmoji = this.data.editEmoji;
    try { wx.setStorageSync('currentUser', currentUser); } catch (e) {}

    if (currentUser._id) {
      clouddb.updateUser(currentUser._id, {
        nickname,
        avatar: 'emoji',
        avatarEmoji: this.data.editEmoji
      }).catch(() => {});
    }

    this.setData({ showEditModal: false, nickname, avatarEmoji: this.data.editEmoji });
    wx.showToast({ title: '保存成功', icon: 'success' });
  },

  closeEditModal() { this.setData({ showEditModal: false }); },

  // ─── 绑定手机号 ───
  openBindPhone() {
    this.setData({ showBindPhone: true, bindPhone: '', bindPassword: '', bindConfirm: '' });
  },

  onGetPhoneNumber(e) {
    if (!e.detail || !e.detail.code) { wx.showToast({ title: '请允许获取手机号', icon: 'none' }); return; }
    this._doBindPhoneByWechat(e.detail.code);
  },

  bindPhoneInput(e) { this.setData({ bindPhone: e.detail.value.trim() }); },
  bindPasswordInput(e) { this.setData({ bindPassword: e.detail.value }); },
  bindConfirmInput(e) { this.setData({ bindConfirm: e.detail.value }); },

  async _doBindPhoneByWechat(code) {
    wx.showLoading({ title: '绑定中...' });
    if (clouddb.FORCE_LOCAL) {
      setTimeout(() => { wx.hideLoading(); this._finishBindPhone({ phone: '138****8888' }); }, 800);
      return;
    }
    try {
      const res = await wx.cloud.callFunction({ name: 'getPhoneNumber', data: { code } });
      if (res.result && res.result.phone) {
        this._finishBindPhone({ phone: res.result.phone });
      } else {
        wx.hideLoading();
        wx.showToast({ title: '微信获取失败，请手动输入', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '绑定失败，请重试', icon: 'none' });
    }
  },

  async onManualBindPhone() {
    const { bindPhone, bindPassword, bindConfirm } = this.data;
    if (!/^1[3-9]\d{9}$/.test(bindPhone)) { wx.showToast({ title: '请输入正确手机号', icon: 'none' }); return; }

    let currentUser = null;
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}
    const hasPassword = !!(currentUser && currentUser.password);

    if (!hasPassword) {
      // 首次绑定，需设置密码
      if (!bindPassword || bindPassword.length < 6) { wx.showToast({ title: '密码至少6位', icon: 'none' }); return; }
      if (bindPassword !== bindConfirm) { wx.showToast({ title: '两次密码不一致', icon: 'none' }); return; }
    }

    // 查重（不能绑定到其他账号）
    wx.showLoading({ title: '绑定中...' });
    const existing = await clouddb.getUserByPhone(bindPhone);
    if (existing && existing._openid !== currentUser._openid) {
      wx.hideLoading();
      wx.showToast({ title: '该手机号已被其他账号绑定', icon: 'none' }); return;
    }

    const updates = { phone: bindPhone };
    if (bindPassword) updates.password = bindPassword;
    if (currentUser._id) await clouddb.updateUser(currentUser._id, updates);
    currentUser.phone = bindPhone;
    if (bindPassword) currentUser.password = bindPassword;
    try { wx.setStorageSync('currentUser', currentUser); } catch (e) {}
    wx.hideLoading();
    wx.showToast({ title: '绑定成功', icon: 'success' });
    this.setData({ showBindPhone: false, phone: bindPhone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'), bindPhone: '', bindPassword: '', bindConfirm: '' });
  },

  async _finishBindPhone({ phone }) {
    let currentUser = null;
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}
    if (currentUser._id) await clouddb.updateUser(currentUser._id, { phone });
    currentUser.phone = phone;
    try { wx.setStorageSync('currentUser', currentUser); } catch (e) {}
    wx.hideLoading();
    wx.showToast({ title: '绑定成功', icon: 'success' });
    this.setData({ showBindPhone: false, phone: phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') });
  },

  closeBindPhone() { this.setData({ showBindPhone: false }); },

  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: res => {
        if (!res.confirm) return;
        wx.clearStorageSync();
        getApp().globalData.openid = null;
        wx.redirectTo({ url: '/pages/login/login' });
      }
    });
  }
});
