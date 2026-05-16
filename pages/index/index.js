// pages/index/index.js
const app = getApp();

Page({
  data: {},

  onLoad() {
    // 检查是否已登录，自动跳转
    wx.checkSession({
      success: () => {
        app.getOpenId();
        setTimeout(() => {
          wx.switchTab({ url: '/pages/cat-list/cat-list' });
        }, 500);
      },
      fail: () => {
        wx.redirectTo({ url: '/pages/login/login' });
      }
    });
  },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.png', title: '宠物健康管家 - 记录宝贝的健康日常', path: '/pages/index/index' };
  },
});