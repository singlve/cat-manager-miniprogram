// pages/login/login.js
// 登录页：微信一键登录 + 手机号登录 + 手机号绑定
const clouddb = require('../../utils/clouddb.js');

const FORCE_MOCK = false;

// ─── 默认头像（灰色猫咪占位符） ───
const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjYwIiBmaWxsPSIjRjVGNUY1Ii8+PHRleHQgeD0iNjAiIHk9Ijc4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjU2IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+8J+QsTwvdGV4dD48L3N2Zz4=';

Page({
  data: {
    phone: '', password: '', showOtherLogin: false,
    // 微信登录成功后的中间状态（待绑定手机）
    tempUser: null,
    showBindPhone: false,
    showPasswordInput: false, // 是否显示密码设置（首次绑定手机时）
    bindPhone: '', bindPassword: '', bindConfirm: '', bindPhoneError: '',
    // 完善资料弹窗
    showProfileSetup: false,
    profileAvatar: '',
    profileNickname: '',
    isNewUser: false
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
              nickname: '测试用户',
              avatar: DEFAULT_AVATAR,
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
            console.log('[login] login cloud result:', JSON.stringify(cloudRes));
            const openid = cloudRes.result && (cloudRes.result.openid || cloudRes.result.userinfo && cloudRes.result.userinfo.openid);
            if (!openid) {
              wx.showModal({ title: '获取用户失败', content: '云函数 login 未返回 openid，请确认已部署且云数据库权限正确', showCancel: false });
              return;
            }
            console.log('[login] step1: openid=', openid);

            let user = null;
            try { user = await clouddb.getUserByOpenid(openid); } catch (e) { console.error('[login] getUserByOpenid error:', e); }
            console.log('[login] step2: user=', JSON.stringify(user));

            if (user && user.phone) {
              try { wx.setStorageSync('currentUser', user); } catch (err) {}
              wx.showToast({ title: '登录成功', icon: 'success' });
              setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
            } else if (user) {
              console.log('[login] step3: 已有账号无手机号，显示绑定弹窗');
              this.setData({ tempUser: user, showBindPhone: true, showPasswordInput: true });
            } else {
              const newUser = {
                _openid: openid,
                nickname: '',
                avatar: '',
                loginType: 'wechat',
                createdAt: new Date().toISOString()
              };
              console.log('[login] step3: 新用户，创建账号, newUser=', JSON.stringify(newUser));
              let id = null;
              try { id = await clouddb.addUser(newUser); } catch (e) { console.error('[login] addUser error:', e); }
              console.log('[login] step4: addUser returned id=', id);
              newUser._id = id;
              try { wx.setStorageSync('currentUser', newUser); } catch (err) {}
              console.log('[login] step5: setData({tempUser, showBindPhone:true, isNewUser:true})');
              this.setData({ tempUser: newUser, showBindPhone: true, showPasswordInput: true, isNewUser: true });
              console.log('[login] step6: showToast');
              wx.showToast({ title: id ? '登录成功，请绑定手机号' : '请绑定手机号', icon: 'none', duration: 2500 });
              console.log('[login] done, id=', id);
            }
          },
          fail: err => {
            wx.hideLoading();
            console.error('[login] cloud callFunction login fail:', JSON.stringify(err));
            const errMsg = err && (err.message || JSON.stringify(err));
            // 检查是否是依赖未安装的错误
            const isDepMissing = errMsg && errMsg.includes('Cannot find module');
            wx.showModal({
              title: '云函数调用失败',
              content: isDepMissing
                ? '云函数 login 的依赖 wx-server-sdk 未正确安装。请在微信开发者工具中：\n1. 右键 cloudfunctions/login\n2. 选择「上传并部署（上传 node_modules）」\n3. 等待上传完成后再试'
                : '云函数 login 调用失败：' + errMsg + '\n\n请在微信开发者工具中部署以下云函数：\n• login\n• getPhoneNumber（同样需要「上传并部署（上传 node_modules）」）',
              showCancel: false
            });
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
          nickname: '测试用户',
          avatar: DEFAULT_AVATAR,
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
      console.log('[login] getPhoneNumber result:', JSON.stringify(res));
      
      // 兼容两种返回格式
      let phone = null;
      if (res.result) {
        // 格式1: { phone_info: { phoneNumber: 'xxx' } }
        if (res.result.phone_info && res.result.phone_info.phoneNumber) {
          phone = res.result.phone_info.phoneNumber;
        }
        // 格式2: { phone: 'xxx' }
        else if (res.result.phone) {
          phone = res.result.phone;
        }
      }
      
      if (phone) {
        await this._loginWithPhone(phone);
      } else {
        wx.hideLoading();
        const errMsg = res.result && (res.result.errMsg || res.result.errmsg) || JSON.stringify(res.result || res);
        console.error('[login] getPhoneNumber no phone, result:', errMsg);
        wx.showModal({
          title: '获取手机号失败',
          content: '错误信息：' + errMsg + '\n\n请确认：\n1. 云函数 getPhoneNumber 已部署\n2. 小程序已开通手机号快速验证组件',
          showCancel: false
        });
      }
    } catch (e) {
      wx.hideLoading();
      console.error('[login] _doWxPhoneLogin error:', e);
      wx.showModal({
        title: '登录失败',
        content: '错误：' + (e.message || JSON.stringify(e)) + '\n\n请确认云函数 getPhoneNumber 已部署到线上环境',
        showCancel: false
      });
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
      // 已注册用户：直接登录
      // 注意：_openid 由平台自动注入，不需要手动更新
      try { wx.setStorageSync('currentUser', user); } catch (err) {}
      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
    } else {
      // 新用户：创建账号（平台自动注入 _openid）
      const newUser = {
        nickname: '',
        avatar: '',
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
    const { tempUser, isNewUser } = this.data;
    if (!tempUser) return;
    try { wx.setStorageSync('currentUser', tempUser); } catch (e) {}
    this.setData({ showBindPhone: false, tempUser: null });

    if (isNewUser) {
      // 新用户：弹出完善资料
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        this.setData({ showProfileSetup: true, profileAvatar: '', profileNickname: '' });
      }, 800);
    } else {
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
    }
  },

  // ─── 阻止事件冒泡 ───
  stopBubble() {},

  // onGetPhoneNumber 已移除（个人主体小程序无法使用 getPhoneNumber 组件）

  // ─── 手动输入手机号绑定 ───
  bindPhoneInput(e) {
    const val = e.detail.value.trim();
    this.setData({ bindPhone: val, bindPhoneError: '' });
    // 输满11位后自动校验格式
    if (val.length === 11) this._validatePhoneInline(val);
  },

  // 实时校验手机号格式
  _validatePhoneInline(val) {
    if (!/^1[3-9]\d{9}$/.test(val)) {
      this.setData({ bindPhoneError: '手机号格式不正确，请检查后重新输入' });
      return false;
    }
    return true;
  },
  bindPasswordInput(e) { this.setData({ bindPassword: e.detail.value }); },
  bindConfirmInput(e)  { this.setData({ bindConfirm: e.detail.value }); },

  onManualBindPhone() {
    const { bindPhone, bindPassword, bindConfirm, showPasswordInput, tempUser } = this.data;

    // ── 手机号格式校验 ──
    if (!bindPhone) {
      this.setData({ bindPhoneError: '请输入手机号' }); return;
    }
    if (!/^1[3-9]\d{9}$/.test(bindPhone)) {
      this.setData({ bindPhoneError: '手机号格式不正确（11位，以1开头）' }); return;
    }
    this.setData({ bindPhoneError: '' });

    if (tempUser && tempUser.phone) {
      // 已有手机，跳过密码设置直接绑定
      this._doBindPhoneByPhone(bindPhone);
      return;
    }
    // 密码栏已随弹窗一起显示，直接验证
    if (!bindPassword || bindPassword.length < 6) { wx.showToast({ title: '请输入密码（至少6位）', icon: 'none' }); return; }
    if (bindPassword !== bindConfirm) { wx.showToast({ title: '两次密码不一致', icon: 'none' }); return; }
    this._doBindPhoneByPhone(bindPhone, bindPassword);
  },

  // _doBindPhone 已移除（个人主体小程序无法使用 getPhoneNumber 组件）

  // 用手动输入手机号绑定
  async _doBindPhoneByPhone(phone, password) {
    wx.showLoading({ title: '绑定中...' });
    try {
      // 查重（如果不是当前用户的手机）
      const existing = await clouddb.getUserByPhone(phone);
      if (existing && existing._openid !== this.data.tempUser._openid) {
        wx.hideLoading();
        wx.showToast({ title: '该手机号已被其他账号绑定', icon: 'none' }); return;
      }
      await this._finishBind({ phone, password: password || undefined });
    } catch (e) {
      wx.hideLoading();
      console.error('[login] _doBindPhoneByPhone error:', e);
      wx.showModal({ title: '绑定失败', content: '错误：' + (e.message || JSON.stringify(e)), showCancel: false });
    }
  },

  async _finishBind({ phone, password }) {
    const { tempUser, isNewUser } = this.data;
    if (!tempUser) { wx.hideLoading(); return; }
    const updates = { phone };
    if (password) updates.password = password;
    updates.loginType = 'wechat_phone';

    if (tempUser._id) {
      await clouddb.updateUser(tempUser._id, updates);
    }
    const mergedUser = { ...tempUser, phone, loginType: 'wechat_phone' };
    if (password) mergedUser.password = password;
    try { wx.setStorageSync('currentUser', mergedUser); } catch (e) {}

    wx.hideLoading();
    this.setData({ showBindPhone: false, tempUser: null, bindPhone: '', bindPassword: '', bindConfirm: '', showPasswordInput: false, bindPhoneError: '' });

    if (isNewUser) {
      // 新用户：弹出完善资料
      wx.showToast({ title: '绑定成功', icon: 'success' });
      setTimeout(() => {
        this.setData({ showProfileSetup: true, profileAvatar: '', profileNickname: '' });
      }, 800);
    } else {
      wx.showToast({ title: '绑定成功', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
    }
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

  // ─── 完善资料 ───
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    this.setData({ profileAvatar: avatarUrl });
  },

  profileNicknameInput(e) {
    this.setData({ profileNickname: e.detail.value.trim() });
  },

  async saveProfile() {
    const { profileAvatar, profileNickname } = this.data;
    let avatarUrl = profileAvatar;
    let nickname = profileNickname;

    // 上传头像到云存储
    if (profileAvatar && !profileAvatar.startsWith('data:') && !profileAvatar.startsWith('http')) {
      wx.showLoading({ title: '保存中...', mask: true });
      try {
        const ext = profileAvatar.split('.').pop() || 'png';
        const cloudPath = `user-avatars/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const res = await wx.cloud.uploadFile({ cloudPath, filePath: profileAvatar });
        avatarUrl = res.fileID;
        console.log('[login] avatar uploaded:', avatarUrl);
      } catch (e) {
        console.error('[login] avatar upload failed:', e);
        wx.showToast({ title: '头像上传失败，已跳过', icon: 'none' });
        avatarUrl = DEFAULT_AVATAR;
      }
    } else if (!profileAvatar) {
      avatarUrl = DEFAULT_AVATAR;
    }

    if (!nickname) nickname = '猫咪爱好者';

    // 更新用户记录
    try {
      const currentUser = wx.getStorageSync('currentUser');
      if (currentUser && currentUser._id) {
        await clouddb.updateUser(currentUser._id, { nickname, avatar: avatarUrl });
        currentUser.nickname = nickname;
        currentUser.avatar = avatarUrl;
        wx.setStorageSync('currentUser', currentUser);
        console.log('[login] profile saved:', nickname);
      }
    } catch (e) {
      console.error('[login] save profile error:', e);
    }

    wx.hideLoading();
    wx.showToast({ title: '设置完成', icon: 'success' });
    this.setData({ showProfileSetup: false, profileAvatar: '', profileNickname: '', isNewUser: false });
    setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
  },

  skipProfileSetup() {
    // 使用默认值
    try {
      const currentUser = wx.getStorageSync('currentUser');
      if (currentUser && currentUser._id) {
        const defaults = {
          nickname: currentUser.nickname || '猫咪爱好者',
          avatar: currentUser.avatar || DEFAULT_AVATAR
        };
        clouddb.updateUser(currentUser._id, defaults);
        currentUser.nickname = defaults.nickname;
        currentUser.avatar = defaults.avatar;
        wx.setStorageSync('currentUser', currentUser);
      }
    } catch (e) { console.warn('[login] skipProfileSetup error:', e); }

    this.setData({ showProfileSetup: false, profileAvatar: '', profileNickname: '', isNewUser: false });
    wx.showToast({ title: '登录成功', icon: 'success' });
    setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
  },

  toggleOtherLogin() { this.setData({ showOtherLogin: !this.data.showOtherLogin }); },
  goRegister() { wx.navigateTo({ url: '/pages/register/register' }); }
});
