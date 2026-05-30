// pages/about/about.js
Page({
  goBack() { wx.navigateBack(); },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.png', title: '关于宠物小管家Plus', path: '/pages/about/about' };
  },
});
