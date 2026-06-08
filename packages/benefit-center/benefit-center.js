const clouddb = require('../../utils/clouddb.js');
const { getInitialThemeData } = require('../../utils/themes.js');
const initialTheme = getInitialThemeData();

Page({
  data: {
    loading: true,
    loadError: false,
    claiming: false,
    campaign: null,
    claimed: false,
    canClaim: false,
    themeVouchers: 0,
    themeClass: initialTheme.themeClass
  },

  onShow() {
    const active = getApp().applyTheme();
    this.setData({ themeClass: active.className });
    this.loadBenefit();
  },

  async loadBenefit() {
    this.setData({ loading: true, loadError: false });
    try {
      const status = await clouddb.getBenefitStatus();
      this.applyStatus(status);
    } catch (error) {
      console.error('[benefit-center] load failed:', error);
      this.setData({ loadError: true });
    } finally {
      this.setData({ loading: false });
    }
  },

  applyStatus(status) {
    const currentUser = wx.getStorageSync('currentUser') || {};
    currentUser.themeVouchers = Math.max(0, parseInt(status.themeVouchers, 10) || 0);
    if (status.claimed && status.campaign) {
      currentUser.claimedBenefits = Array.from(new Set(
        (currentUser.claimedBenefits || []).concat(status.campaign.id)
      ));
    }
    wx.setStorageSync('currentUser', currentUser);
    this.setData({
      campaign: status.campaign || null,
      claimed: !!status.claimed,
      canClaim: !!status.canClaim,
      themeVouchers: currentUser.themeVouchers
    });
  },

  async claimBenefit() {
    if (this.data.claiming || !this.data.canClaim) return;
    this.setData({ claiming: true });
    try {
      const status = await clouddb.claimBenefit();
      this.applyStatus(status);
      wx.showToast({
        title: status.alreadyClaimed ? '已经领取过啦' : '兑换券已到账',
        icon: status.alreadyClaimed ? 'none' : 'success'
      });
    } catch (error) {
      console.error('[benefit-center] claim failed:', error);
      wx.showToast({ title: error.message || '领取失败，请重试', icon: 'none' });
    } finally {
      this.setData({ claiming: false });
    }
  },

  goThemeMall() {
    wx.navigateTo({ url: '/packages/points-mall/points-mall?filter=virtual' });
  },

  async onPullDownRefresh() {
    try { await this.loadBenefit(); } finally { wx.stopPullDownRefresh(); }
  }
});
