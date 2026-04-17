// pages/mine/mine.js
// 「我的」页面
const clouddb = require('../../utils/clouddb.js');

const AVATAR_EMOJIS = ['😺', '😸', '😻', '🐱', '😽', '😹', '😼', '🐈'];

function getAvatarEmoji(avatarData) {
  if (avatarData && avatarData.startsWith('data:image/svg')) {
    return '😺';
  }
  return AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)];
}

Page({
  data: {
    nickname: '加载中...',
    avatar: '',
    avatarEmoji: '😺',
    phone: '',
    catCount: 0,
    reminderCount: 0,
    recordCount: 0
  },

  onShow() { this.loadUserInfo(); },

  async loadUserInfo() {
    let currentUser = null;
    try { currentUser = wx.getStorageSync('currentUser'); } catch (e) {}

    const nickname = (currentUser && currentUser.nickname) || '猫咪爱好者';
    const avatarEmoji = getAvatarEmoji(currentUser && currentUser.avatar);

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
