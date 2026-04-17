// pages/login/login.js
// 登录页：微信一键登录 + 手机号密码登录
const clouddb = require('../../utils/clouddb.js');

// 调试开关：true=模拟登录，false=走云端
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
function randomNickname() { return randomPick(NICKNAMES); }
function randomAvatar() { return randomPick(AVATARS); }

Page({
  data: { phone: '', password: '', showOtherLogin: false },

  onLoad() {
    const app = getApp();
    if (app.globalData && app.globalData.openid) this._autoLogin(app.globalData.openid);
  },

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
    if (e.detail.errMsg && e.detail.errMsg.indexOf('deny') !== -1) {
      wx.showToast({ title: '需要授权才能登录', icon: 'none' }); return;
    }

    wx.showLoading({ title: '登录中...' });

    wx.login({
      success: loginRes => {
        if (!loginRes.code) { wx.hideLoading(); wx.showToast({ title: '微信登录失败', icon: 'none' }); return; }

        if (FORCE_MOCK) {
          setTimeout(() => {
            wx.hideLoading();
            const mockUser = { _id: 'wx_user_' + Date.now(), _openid: 'mock_openid_' + Date.now(), nickname: randomNickname(), avatar: randomAvatar(), loginType: 'wechat' };
            try { wx.setStorageSync('currentUser', mockUser); } catch (err) {}
            wx.showToast({ title: '登录成功', icon: 'success' });
            setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
          }, 600);
          return;
        }

        // 云端登录
        wx.cloud.callFunction({
          name: 'login', data: { code: loginRes.code },
          success: async cloudRes => {
            wx.hideLoading();
            const openid = cloudRes.result && cloudRes.result.openid;
            if (!openid) { wx.showToast({ title: '获取用户标识失败', icon: 'none' }); return; }

            let user = await clouddb.getUserByOpenid(openid);
            if (!user) {
              // 新用户：随机分配昵称和头像
              user = { _openid: openid, nickname: randomNickname(), avatar: randomAvatar(), loginType: 'wechat', createdAt: new Date().toISOString() };
              await clouddb.addUser(user);
            }
            try { wx.setStorageSync('currentUser', user); } catch (err) {}
            wx.showToast({ title: '登录成功', icon: 'success' });
            setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
          },
          fail: () => { wx.hideLoading(); wx.showToast({ title: '云函数调用失败', icon: 'none' }); }
        });
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: 'wx.login 失败', icon: 'none' }); }
    });
  },

  // ─── 手机号密码登录 ───
  phoneInput(e)    { this.setData({ phone: e.detail.value }); },
  passwordInput(e) { this.setData({ password: e.detail.value }); },

  login() {
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
    wx.cloud.database().collection('users').where({ phone }).get({
      success: res => {
        wx.hideLoading();
        if (!res.data || !res.data.length) { wx.showToast({ title: '用户不存在，请先注册', icon: 'none' }); return; }
        const user = res.data[0];
        if (user.password !== password) { wx.showToast({ title: '密码错误', icon: 'none' }); return; }
        try { wx.setStorageSync('currentUser', user); } catch (err) {}
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 800);
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '网络错误，请重试', icon: 'none' }); }
    });
  },

  toggleOtherLogin() { this.setData({ showOtherLogin: !this.data.showOtherLogin }); },
  goRegister() { wx.navigateTo({ url: '/pages/register/register' }); }
});
