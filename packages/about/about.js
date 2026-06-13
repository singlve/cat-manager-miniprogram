// packages/about/about.js
const { syncPageTheme } = require('../../utils/themes.js');

Page({
  onShow() { syncPageTheme(this); },

  goBack() { wx.navigateBack(); },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.jpg', title: '关于宠物小管家Plus', path: '/packages/about/about' };
  },
});
