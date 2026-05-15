// pages/about/about.js
Page({
  goBack() { wx.navigateBack(); },

  onShareAppMessage() {
    return { title: '关于猫咪健康管家 ℹ️', path: '/pages/about/about' };
  },
});