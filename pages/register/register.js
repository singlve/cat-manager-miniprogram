// pages/register/register.js
// 注册页：支持手机号注册
const clouddb = require('../../utils/clouddb.js');
const { hashPassword } = require('../../utils/crypto.js');

Page({
  data: { nickname: '', phone: '', password: '', confirmPassword: '' },

  nicknameInput(e)   { this.setData({ nickname: e.detail.value }); },
  phoneInput(e)      { this.setData({ phone: e.detail.value }); },
  passwordInput(e)   { this.setData({ password: e.detail.value }); },
  confirmInput(e)    { this.setData({ confirmPassword: e.detail.value }); },

  async register() {
    const { nickname, phone, password, confirmPassword } = this.data;
    if (!nickname || !phone || !password) { wx.showToast({ title: '请填写完整', icon: 'none' }); return; }
    if (!/^1[3-9]\d{9}$/.test(phone)) { wx.showToast({ title: '手机号格式错误', icon: 'none' }); return; }
    if (password.length < 6) { wx.showToast({ title: '密码至少6位', icon: 'none' }); return; }
    if (password !== confirmPassword) { wx.showToast({ title: '两次密码不一致', icon: 'none' }); return; }

    wx.showLoading({ title: '注册中...' });

    try {
      // 查重
      const existing = await clouddb.getUserByPhone(phone);
      if (existing) { wx.hideLoading(); wx.showToast({ title: '该手机号已注册', icon: 'none' }); return; }

      // 获取 openid（让同一微信号下注册的账号关联到同一个用户）
      let openid = '';
      try {
        const r = await wx.cloud.callFunction({ name: 'login' });
        openid = r.result && r.result.openid || '';
      } catch (e) { console.warn('[register] get openid failed:', e); }

      // 写入（平台自动注入 _openid）
      const hashedPwd = hashPassword(password);
      const userId = await clouddb.addUser({ nickname, phone, password: hashedPwd, loginType: 'phone' });
      try { wx.setStorageSync('currentUser', { _id: userId, nickname, phone, loginType: 'phone' }); } catch (e) {}
      wx.showToast({ title: '注册成功', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 1000);
    } catch (e) {
      console.error('[register] register error:', e);
      wx.showToast({ title: '注册失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  goLogin() { wx.navigateBack(); },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.png', title: '宠物健康管家 - 记录宝贝的健康日常', path: '/pages/index/index' };
  },
});