// pages/webview/webview.js
Page({
  data: { url: '' },
  onLoad(options) {
    if (options.url) {
      this.setData({ url: decodeURIComponent(options.url) });
    }
  },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.png', title: '宠物小管家Plus - 记录宝贝的健康日常', path: '/pages/cat-list/cat-list' };
  },
});
