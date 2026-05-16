// pages/about/about.js
Page({
  goBack() { wx.navigateBack(); },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.png', title: '关于宠物健康管家 ℹ️', path: '/pages/about/about' };
  },
});