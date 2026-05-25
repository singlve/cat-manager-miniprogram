// pages/bind-phone/bind-phone.js
// 绑定手机号独立页面（替代弹窗，解决 iOS fixed + 键盘导致的文字偏移问题）
const clouddb = require('../../utils/clouddb.js');
const { hashPassword } = require('../../utils/crypto.js');

Page({
  data: {
    mode: 'mine',       // 'login' | 'mine'
    needPassword: true,
    tempUser: null,
    isNewUser: false
  },

  onLoad(options) {
    const mode = options.mode || 'mine';
    const needPassword = options.needPassword !== '0';  // 默认需要密码
    const isNewUser = options.isNewUser === '1';

    // login 模式从 storage 取 tempUser
    let tempUser = null;
    if (mode === 'login') {
      try { tempUser = wx.getStorageSync('currentUser'); } catch (e) {}
    }

    this.setData({ mode, needPassword, tempUser, isNewUser });
  },

  onPhoneInput(e)  { this._phone = e.detail.value.trim(); },
  onPasswordInput(e) { this._password = e.detail.value; },
  onConfirmInput(e)  { this._confirm = e.detail.value; },

  async submit() {
    const phone = this._phone || '';
    const password = this._password || '';
    const confirm = this._confirm || '';
    const { mode, needPassword, tempUser } = this.data;

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return;
    }

    // 密码校验：填了任一密码字段就两个都要校验；都没填且 needPassword 则必填
    const hasAnyPwd = password || confirm;
    if (hasAnyPwd) {
      if (!password || password.length < 6) {
        wx.showToast({ title: '密码至少6位', icon: 'none' }); return;
      }
      if (password !== confirm) {
        wx.showToast({ title: '两次密码不一致', icon: 'none' }); return;
      }
    } else if (needPassword) {
      wx.showToast({ title: '请设置密码（至少6位）', icon: 'none' }); return;
    }

    wx.showLoading({ title: '绑定中...' });

    try {
      if (mode === 'login') {
        await this._bindForLogin(phone, password);
      } else {
        await this._bindForMine(phone, password);
      }
    } catch (e) {
      wx.hideLoading();
      console.error('[bind-phone] submit error:', e);
      wx.showToast({ title: '绑定失败，请重试', icon: 'none' });
    }
  },

  // login 模式：绑定到 tempUser（从 storage 读取的 currentUser）
  async _bindForLogin(phone, password) {
    const { isNewUser, needPassword } = this.data;
    let tempUser = this.data.tempUser;

    // 如果 tempUser 缺少 _id，尝试重新从 storage 读取
    if (!tempUser || !tempUser._id) {
      try { tempUser = wx.getStorageSync('currentUser') || null; } catch (e) {}
    }
    if (!tempUser || !tempUser._id) {
      wx.hideLoading();
      wx.showToast({ title: '用户数据异常，请重新登录', icon: 'none' }); return;
    }

    const openid = tempUser._openid || getApp().globalData.openid || '';

    // 查重
    const existing = await clouddb.getUserByPhone(phone);
    if (existing && openid && existing._openid !== openid) {
      wx.hideLoading();
      wx.showToast({ title: '该手机号已被其他账号绑定', icon: 'none' }); return;
    }

    const updates = { phone, loginType: 'wechat_phone' };
    if (password) {
      updates.password = hashPassword(password);
    }

    await clouddb.updateUser(tempUser._id, updates);

    // 更新本地 currentUser
    const merged = Object.assign({}, tempUser, { phone, loginType: 'wechat_phone' });
    if (password) merged.password = hashPassword(password);
    try { wx.setStorageSync('currentUser', merged); } catch (e) {}

    wx.hideLoading();
    wx.showToast({ title: '绑定成功', icon: 'success' });

    // 新用户 → 完善资料；老用户 → 首页
    setTimeout(() => {
      if (isNewUser) {
        wx.redirectTo({ url: '/pages/login/login?action=setupProfile' });
      } else {
        wx.switchTab({ url: '/pages/cat-list/cat-list' });
      }
    }, 800);
  },

  // mine 模式：更新当前已登录用户
  async _bindForMine(phone, password) {
    let currentUser = null;
    try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}

    // 查重
    const existing = await clouddb.getUserByPhone(phone);
    if (existing && currentUser._openid && existing._openid !== currentUser._openid) {
      wx.hideLoading();
      wx.showToast({ title: '该手机号已被其他账号绑定', icon: 'none' }); return;
    }

    const updates = { phone };
    if (password) {
      updates.password = hashPassword(password);
    }
    if (currentUser._id) {
      await clouddb.updateUser(currentUser._id, updates);
    }

    currentUser.phone = phone;
    if (password) currentUser.password = hashPassword(password);
    try { wx.setStorageSync('currentUser', currentUser); } catch (e) {}

    wx.hideLoading();
    wx.showToast({ title: '绑定成功', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 800);
  },

  skip() {
    const { tempUser, isNewUser } = this.data;
    if (tempUser && isNewUser) {
      // 新用户跳过绑定 → 完善资料
      wx.redirectTo({ url: '/pages/login/login?action=setupProfile' });
    } else {
      wx.switchTab({ url: '/pages/cat-list/cat-list' });
    }
  }
});
