// pages/login/login.js
// 登录页：微信一键登录 + 手机号登录 + 手机号绑定
const clouddb = require('../../utils/clouddb.js');
const { verifyPassword } = require('../../utils/crypto.js');

// ─── 默认头像（灰色宠物占位符） ───
const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjYwIiBmaWxsPSIjRjVGNUY1Ii8+PHRleHQgeD0iNjAiIHk9Ijc4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjU2IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+8J+QsTwvdGV4dD48L3N2Zz4=';

const { syncPageTheme } = require('../../utils/themes.js');

Page({
  onShow() { syncPageTheme(this); },

  data: {
    phone: '', password: '', showOtherLogin: false,
    // 完善资料弹窗（新用户绑定手机后由 bind-phone 页 redirect 回来触发）
    showProfileSetup: false,
    profileAvatar: '',
    profileNickname: ''
  },

  onLoad(options) {
    // 从 bind-phone 页回来时，显示完善资料弹窗
    if (options && options.action === 'setupProfile') {
      this.setData({ showProfileSetup: true });
      return;
    }
    // 只在 storage 仍有用户时自动登录（刚退出登录 storage 已清空，不会触发）
    const app = getApp();
    if (app.isLoggedIn()) {
      wx.switchTab({ url: '/pages/cat-list/cat-list' });
    }
  },

  // ─── 微信一键登录 ───
  onWxLogin(e) {
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

        if (!loginRes.code) { wx.hideLoading(); wx.showToast({ title: '微信登录失败', icon: 'none' }); return; }

        wx.cloud.callFunction({
          name: 'login', data: { code: loginRes.code },
          success: async cloudRes => {
            wx.hideLoading();

            const openid = cloudRes.result && (cloudRes.result.openid || cloudRes.result.userinfo && cloudRes.result.userinfo.openid);
            if (!openid) {
              wx.showModal({ title: '获取用户失败', content: '云函数 login 未返回 openid，请确认已部署且云数据库权限正确', showCancel: false });
              return;
            }


            let user = null;
            try { user = await clouddb.getUserByOpenid(openid); } catch (e) { console.error('[login] getUserByOpenid error:', e); }


            if (user && user.phone) {
              try { wx.setStorageSync('currentUser', user); } catch (err) {}
              wx.showToast({ title: '登录成功', icon: 'success' });
              setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
            } else if (user) {
              try { wx.setStorageSync('currentUser', user); } catch (err) {}
              const needPwd = user.password ? 0 : 1;
              wx.navigateTo({ url: `/pages/bind-phone/bind-phone?mode=login&needPassword=${needPwd}&isNewUser=0` });
            } else {
              wx.showLoading({ title: '创建账号中...' });
              const newUser = {
                nickname: '',
                avatar: '',
                loginType: 'wechat',
                createdAt: new Date().toISOString()
              };

              let id = null;
              try { id = await clouddb.addUser(newUser); } catch (e) { console.error('[login] addUser error:', e); }

              if (!id) {
                wx.hideLoading();
                wx.showModal({
                  title: '创建账号失败',
                  content: '请确认云数据库 users 集合已创建且权限为「所有用户可读，仅创建者可写」。',
                  showCancel: false
                });
                return;
              }

              newUser._id = id;
              try { wx.setStorageSync('currentUser', newUser); } catch (err) {}
              wx.hideLoading();
              wx.navigateTo({ url: '/pages/bind-phone/bind-phone?mode=login&needPassword=1&isNewUser=1' });
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
    try {
      const res = await wx.cloud.callFunction({ name: 'getPhoneNumber', data: { code } });

      
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
      let id = null;
      try { id = await clouddb.addUser(newUser); } catch (e) { console.error('[login] addUser error:', e); }
      if (!id) {
        wx.hideLoading();
        wx.showModal({
          title: '创建账号失败',
          content: '请确认云数据库 users 集合已创建且权限正确。',
          showCancel: false
        });
        return;
      }
      newUser._id = id;
      try { wx.setStorageSync('currentUser', newUser); } catch (err) {}
      wx.hideLoading();
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
    }
  },

  // ─── 阻止事件冒泡 ───
  stopBubble() {},

  // ─── 手机号密码登录 ───
  phoneInput(e)    { this.setData({ phone: e.detail.value }); },
  passwordInput(e) { this.setData({ password: e.detail.value }); },

  async login() {
    const { phone, password } = this.data;
    if (!phone || !password) { wx.showToast({ title: '请填写完整', icon: 'none' }); return; }
    if (!/^1[3-9]\d{9}$/.test(phone)) { wx.showToast({ title: '手机号格式错误', icon: 'none' }); return; }

    wx.showLoading({ title: '登录中...' });
    const user = await clouddb.getUserByPhone(phone);
    wx.hideLoading();
    if (!user) { wx.showToast({ title: '用户不存在，请先注册', icon: 'none' }); return; }
    if (!verifyPassword(password, user.password)) { wx.showToast({ title: '密码错误', icon: 'none' }); return; }
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
        // UGC 图片安全校验
        var imgCheck = await clouddb.checkImageSafe(avatarUrl);
        if (imgCheck.code !== 0) {
          wx.showToast({ title: '头像包含违规内容，请更换', icon: 'none' });
          avatarUrl = DEFAULT_AVATAR;
        }
      } catch (e) {
        console.error('[login] avatar upload failed:', e);
        wx.showToast({ title: '头像上传失败，已跳过', icon: 'none' });
        avatarUrl = DEFAULT_AVATAR;
      }
    } else if (!profileAvatar) {
      avatarUrl = DEFAULT_AVATAR;
    }

    if (!nickname) nickname = '宠物爱好者';

    // 更新用户记录
    try {
      const currentUser = wx.getStorageSync('currentUser');
      if (currentUser && currentUser._id) {
        await clouddb.updateUser(currentUser._id, { nickname, avatar: avatarUrl });
        currentUser.nickname = nickname;
        currentUser.avatar = avatarUrl;
        wx.setStorageSync('currentUser', currentUser);
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
          nickname: currentUser.nickname || '宠物爱好者',
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
  goRegister() { wx.navigateTo({ url: '/pages/register/register' }); },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.png', title: '宠物小管家Plus - 记录宝贝的健康日常', path: '/pages/cat-list/cat-list' };
  },
});
