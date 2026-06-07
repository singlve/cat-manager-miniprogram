// pages/about/about.js
const { syncPageTheme } = require('../../utils/themes.js');

Page({
  onShow() { syncPageTheme(this); },

  goBack() { wx.navigateBack(); },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.png', title: '关于宠物小管家Plus', path: '/pages/about/about' };
  },
});
