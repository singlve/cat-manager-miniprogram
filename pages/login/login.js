// pages/login/login.js
// 登录页：微信一键登录 + 手机号登录 + 手机号绑定
const clouddb = require('../../utils/clouddb.js');

const FORCE_MOCK = false;

// ─── 随机默认昵称池（猫咪主题） ───
const NICKNAMES = [
  '爱猫人士', '铲屎官', '猫奴一号', '喵星人伙伴', '猫咖常客',
  '猫咪家长', '小猫管理员', '毛孩子妈', '喵喵铲屎官', '养猫达人',
  '橘座驾到', '布偶控', '英短爱好者', '猫条批发商', '主子服务员',
  '小鱼干猎人', '猫薄荷上瘾', '撸猫专家', '猫窝建筑师', '猫罐头品鉴师'
];

// ─── 随机默认头像（纯色 + emoji，预编码 base64） ───
const AVATARS = [
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjYwIiBmaWxsPSIjRkY2QjZCIi8+PHRleHQgeD0iNjAiIHk9Ijc4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjU2IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+8J+QsTwvdGV4dD48L3N2Zz4=',
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjYwIiBmaWxsPSIjNEVDREM0Ii8+PHRleHQgeD0iNjAiIHk9Ijc4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjU2IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+8J+YujwvdGV4dD48L3N2Zz4=',
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjYwIiBmaWxsPSIjNDVCN0QxIi8+PHRleHQgeD0iNjAiIHk9Ijc4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjU2IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+8J+YuDwvdGV4dD48L3N2Zz4=',
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjYwIiBmaWxsPSIjOTZDRUI0Ii8+PHRleHQgeD0iNjAiIHk9Ijc4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjU2IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+8J+YuzwvdGV4dD48L3N2Zz4=',
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjYwIiBmaWxsPSIjRkZFQUE3Ii8+PHRleHQgeD0iNjAiIHk9Ijc4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjU2IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+8J+ZgDwvdGV4dD48L3N2Zz4=',
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjYwIiBmaWxsPSIjRERBMEREIi8+PHRleHQgeD0iNjAiIHk9Ijc4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjU2IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+8J+YuTwvdGV4dD48L3N2Zz4=',
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjYwIiBmaWxsPSIjODdDRUVCIi8+PHRleHQgeD0iNjAiIHk9Ijc4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjU2IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+8J+mgTwvdGV4dD48L3N2Zz4=',
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjYwIiBmaWxsPSIjRjBCMjdBIi8+PHRleHQgeD0iNjAiIHk9Ijc4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjU2IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+8J+QrzwvdGV4dD48L3N2Zz4='
];

function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

Page({
  data: {
    phone: '', password: '', showOtherLogin: false,
    // 微信登录成功后的中间状态（待绑定手机）
    tempUser: null,
    showBindPhone: false,
    showPasswordInput: false, // 是否显示密码设置（首次绑定手机时）
    bindPhone: '', bindPassword: '', bindConfirm: ''
  },

  onLoad() {
    const app = getApp();
    if (app.globalData && app.globalData.openid) this._autoLogin(app.globalData.openid);
  },

  // ─── 自动登录（已有 openid） ───
  async _autoLogin(openid) {
    if (FORCE_MOCK) return;
    const user = await clouddb.getUserByOpenid(openid);
    if (user) {
      try { wx.setStorageSync('currentUser', user); } catch (e) {}
      wx.switchTab({ url: '/pages/cat-list/cat-list' });
    }
  },

  // ─── 微信一键登录 ───
  onWxLogin(e) {
    console.log('[login] onWxLogin triggered, detail:', JSON.stringify(e.detail));
    if (e.detail && e.detail.errMsg && e.detail.errMsg.indexOf('deny') !== -1) {
      wx.showToast({ title: '需要授权才能登录', icon: 'none' }); return;
    }
    if (e.detail && e.detail.code) {
      // 微信手机号授权登录
      wx.showLoading({ title: '登录中...' });
      this._doWxPhoneLogin(e.detail.code);
      return;
    }
    // 兜底：没有 code 也尝试走 wx.login
    wx.showLoading({ title: '登录中...' });
    wx.login({
      success: loginRes => {
        console.log('[login] wx.login success, code:', loginRes.code);
        if (!loginRes.code) { wx.hideLoading(); wx.showToast({ title: '微信登录失败', icon: 'none' }); return; }

        if (FORCE_MOCK) {
          setTimeout(() => {
            wx.hideLoading();
            const mockUser = {
              _id: 'wx_user_' + Date.now(),
              _openid: 'mock_openid_' + Date.now(),
              nickname: randomPick(NICKNAMES),
              avatar: randomPick(AVATARS),
              loginType: 'wechat'
            };
            try { wx.setStorageSync('currentUser', mockUser); } catch (err) {}
            wx.showToast({ title: '登录成功', icon: 'success' });
            setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
          }, 600);
          return;
        }

        wx.cloud.callFunction({
          name: 'login', data: { code: loginRes.code },
          success: async cloudRes => {
            wx.hideLoading();
            const openid = cloudRes.result && cloudRes.result.openid;
            if (!openid) { wx.showToast({ title: '获取用户标识失败', icon: 'none' }); return; }

            let user = await clouddb.getUserByOpenid(openid);
            if (user && user.phone) {
              try { wx.setStorageSync('currentUser', user); } catch (err) {}
              wx.showToast({ title: '登录成功', icon: 'success' });
              setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
            } else if (user) {
              this.setData({ tempUser: user, showBindPhone: true });
            } else {
              const newUser = {
                _openid: openid,
                nickname: randomPick(NICKNAMES),
                avatar: randomPick(AVATARS),
                loginType: 'wechat',
                createdAt: new Date().toISOString()
              };
              const id = await clouddb.addUser(newUser);
              newUser._id = id;
              try { wx.setStorageSync('currentUser', newUser); } catch (err) {}
              this.setData({ tempUser: newUser, showBindPhone: true });
            }
          },
          fail: err => {
            wx.hideLoading();
            console.error('[login] cloud callFunction fail:', err);
            wx.showToast({ title: '云函数调用失败，请确认已部署', icon: 'none', duration: 2500 });
          }
        });
      },
      fail: err => {
        wx.hideLoading();
        console.error('[login] wx.login fail:', err);
        wx.showToast({ title: '微信登录失败', icon: 'none' });
      }
    });
  },

  // ─── 微信手机号授权登录 ───
  async _doWxPhoneLogin(code) {
    if (FORCE_MOCK) {
      setTimeout(() => {
        wx.hideLoading();
        const mockUser = {
          _id: 'wx_user_' + Date.now(),
          _openid: 'mock_openid_' + Date.now(),
          nickname: randomPick(NICKNAMES),
          avatar: randomPick(AVATARS),
          loginType: 'wechat',
          phone: '138****8888'
        };
        try { wx.setStorageSync('currentUser', mockUser); } catch (err) {}
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
      }, 600);
      return;
    }
    try {
      const res = await wx.cloud.callFunction({ name: 'getPhoneNumber', data: { code } });
      console.log('[login] getPhoneNumber result:', JSON.stringify(res.result));
      if (res.result && res.result.phone_info && res.result.phone_info.phoneNumber) {
        const phone = res.result.phone_info.phoneNumber;
        await this._loginWithPhone(phone);
      } else if (res.result && res.result.phone) {
        await this._loginWithPhone(res.result.phone);
      } else {
        wx.hideLoading();
        wx.showToast({ title: '获取手机号失败，请重试', icon: 'none', duration: 2500 });
      }
    } catch (e) {
      wx.hideLoading();
      console.error('[login] _doWxPhoneLogin error:', e);
      wx.showToast({ title: '登录失败，请确认云函数已部署', icon: 'none', duration: 2500 });
    }
  },

  // ─── 通过手机号登录或注册（内部方法） ───
  async _loginWithPhone(phone) {
    // 同时获取 openid，确保用户文档有正确的 _openid
    let openid = '';
    try {
      const r = await wx.cloud.callFunction({ name: 'login' });
      openid = r.result && r.result.openid || '';
    } catch (e) {
      console.warn('[login] get openid failed:', e);
    }

    const user = await clouddb.getUserByPhone(phone);
    if (user) {
      // 已注册用户：更新 openid（如果之前没记录的话）
      if (!user._openid && openid) {
        await clouddb.updateUser(user._id, { _openid: openid });
        user._openid = openid;
      }
      try { wx.setStorageSync('currentUser', user); } catch (err) {}
      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
    } else {
      // 新用户：创建账号（平台自动注入 _openid）
      const newUser = {
        nickname: randomPick(NICKNAMES),
        avatar: randomPick(AVATARS),
        phone: phone,
        loginType: 'wechat_phone',
        createdAt: new Date().toISOString()
      };
      const id = await clouddb.addUser(newUser);
      newUser._id = id;
      try { wx.setStorageSync('currentUser', newUser); } catch (err) {}
      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
    }
  },

  // ─── 跳过绑定（暂不绑定手机） ───
  skipBindPhone() {
    const { tempUser } = this.data;
    if (!tempUser) return;
    try { wx.setStorageSync('currentUser', tempUser); } catch (e) {}
    this.setData({ showBindPhone: false, tempUser: null });
    wx.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
  },

  // ─── 阻止事件冒泡 ───
  stopBubble() {},

  // ─── 微信手机号快速绑定 ───
  onGetPhoneNumber(e) {
    if (!e.detail || !e.detail.code) {
      wx.showToast({ title: '请允许获取手机号', icon: 'none' }); return;
    }
    this._doBindPhone(e.detail.code);
  },

  // ─── 手动输入手机号绑定 ───
  bindPhoneInput(e)  { this.setData({ bindPhone: e.detail.value.trim() }); },
  bindPasswordInput(e) { this.setData({ bindPassword: e.detail.value }); },
  bindConfirmInput(e)  { this.setData({ bindConfirm: e.detail.value }); },

  onManualBindPhone() {
    const { bindPhone, bindPassword, bindConfirm, tempUser } = this.data;
    if (!bindPhone || !/^1[3-9]\d{9}$/.test(bindPhone)) {
      wx.showToast({ title: '请输入正确手机号', icon: 'none' }); return;
    }
    if (tempUser && tempUser.phone) {
      // 已有手机，跳过密码设置直接绑定
      this._doBindPhoneByPhone(bindPhone);
    } else {
      // 新绑定，需设密码
      if (!bindPassword || bindPassword.length < 6) { wx.showToast({ title: '密码至少6位', icon: 'none' }); return; }
      if (bindPassword !== bindConfirm) { wx.showToast({ title: '两次密码不一致', icon: 'none' }); return; }
      this._doBindPhoneByPhone(bindPhone, bindPassword);
    }
  },

  // 用微信手机号绑定（需云函数解密）
  async _doBindPhone(code) {
    wx.showLoading({ title: '绑定中...' });
    if (FORCE_MOCK) {
      setTimeout(() => {
        wx.hideLoading();
        this._finishBind({ phone: '138****8888' });
      }, 800);
      return;
    }
    try {
      const res = await wx.cloud.callFunction({ name: 'getPhoneNumber', data: { code } });
      if (res.result && res.result.phone) {
        this._finishBind({ phone: res.result.phone });
      } else {
        // 解密失败，改为手动输入
        wx.hideLoading();
        wx.showToast({ title: '微信获取手机号失败，请手动输入', icon: 'none', duration: 2000 });
        this.setData({ showPasswordInput: true });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '绑定失败，请重试', icon: 'none' });
    }
  },

  // 用手动输入手机号绑定
  async _doBindPhoneByPhone(phone, password) {
    wx.showLoading({ title: '绑定中...' });
    // 查重（如果不是当前用户的手机）
    const existing = await clouddb.getUserByPhone(phone);
    if (existing && existing._openid !== this.data.tempUser._openid) {
      wx.hideLoading();
      wx.showToast({ title: '该手机号已被其他账号绑定', icon: 'none' }); return;
    }
    this._finishBind({ phone, password: password || undefined });
  },

  async _finishBind({ phone, password }) {
    const { tempUser } = this.data;
    if (!tempUser) return;
    const updates = { phone };
    if (password) updates.password = password;
    updates.loginType = 'wechat_phone';
    // 确保 _openid 也记录到绑定文档里
    if (tempUser._openid) updates._openid = tempUser._openid;

    if (tempUser._id) {
      await clouddb.updateUser(tempUser._id, updates);
    }
    const mergedUser = { ...tempUser, phone, loginType: 'wechat_phone' };
    if (password) mergedUser.password = password;
    try { wx.setStorageSync('currentUser', mergedUser); } catch (e) {}

    wx.hideLoading();
    wx.showToast({ title: '绑定成功', icon: 'success' });
    this.setData({ showBindPhone: false, tempUser: null, bindPhone: '', bindPassword: '', bindConfirm: '', showPasswordInput: false });
    setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
  },

  // ─── 手机号密码登录 ───
  phoneInput(e)    { this.setData({ phone: e.detail.value }); },
  passwordInput(e) { this.setData({ password: e.detail.value }); },

  async login() {
    const { phone, password } = this.data;
    if (!phone || !password) { wx.showToast({ title: '请填写完整', icon: 'none' }); return; }
    if (!/^1[3-9]\d{9}$/.test(phone)) { wx.showToast({ title: '手机号格式错误', icon: 'none' }); return; }

    if (FORCE_MOCK) {
      wx.showLoading({ title: '登录中...' });
      setTimeout(() => {
        wx.hideLoading();
        if (phone === '13800138000' && password === '123456') {
          try { wx.setStorageSync('currentUser', { _id: 'phone_user', phone, nickname: '测试用户', loginType: 'phone' }); } catch (err) {}
          wx.showToast({ title: '登录成功', icon: 'success' });
          setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
        } else {
          wx.showToast({ title: '手机号或密码错误（测试: 13800138000 / 123456）', icon: 'none', duration: 3000 });
        }
      }, 600);
      return;
    }

    wx.showLoading({ title: '登录中...' });
    const user = await clouddb.getUserByPhone(phone);
    wx.hideLoading();
    if (!user) { wx.showToast({ title: '用户不存在，请先注册', icon: 'none' }); return; }
    if (user.password !== password) { wx.showToast({ title: '密码错误', icon: 'none' }); return; }
    try { wx.setStorageSync('currentUser', user); } catch (err) {}
    wx.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
  },

  toggleOtherLogin() { this.setData({ showOtherLogin: !this.data.showOtherLogin }); },
  goRegister() { wx.navigateTo({ url: '/pages/register/register' }); }
});
