// pages/services/services.js
// 「服务」Tab：集中承接工具、互动和管理入口
const clouddb = require('../../utils/clouddb.js');
const { isAdmin } = require('../../utils/util.js');
const { getInitialThemeData } = require('../../utils/themes.js');
const initialTheme = getInitialThemeData();

Page({
  data: {
    isOnline: true,
    isLoggedIn: false,
    isAdmin: false,
    showFeedback: false,
    notifyCount: 0,
    benefitAvailable: false,
    themeClass: initialTheme.themeClass,
    themeKey: initialTheme.themeKey,
    themePrimary: initialTheme.themePrimary,
    themeSecondary: initialTheme.themeSecondary
  },

  onShow() {
    const app = getApp();
    const loggedIn = app.isLoggedIn();
    const activeTheme = app.applyTheme();
    this.setData({
      isOnline: app.globalData.isOnline,
      isLoggedIn: loggedIn,
      isAdmin: isAdmin(),
      showFeedback: false,
      notifyCount: 0,
      benefitAvailable: false,
      themeClass: activeTheme.className,
      themeKey: activeTheme.key,
      themePrimary: activeTheme.primary,
      themeSecondary: activeTheme.secondary
    });

    if (loggedIn) {
      this._checkFeedbackEntry();
      this._loadNotifyCount();
      this._loadBenefitStatus();
    }
  },

  async _checkFeedbackEntry() {
    try {
      const announcement = await clouddb.getActiveAnnouncement();
      this.setData({ showFeedback: !!announcement });
    } catch (e) {
      this.setData({ showFeedback: false });
    }
  },

  async _loadNotifyCount() {
    try {
      const currentUser = wx.getStorageSync('currentUser') || {};
      if (!currentUser._openid) return;
      const count = await clouddb.getUnreadNotifyCount(currentUser._openid);
      this.setData({ notifyCount: count });
    } catch (e) {}
  },

  async _loadBenefitStatus() {
    try {
      const status = await clouddb.getBenefitStatus();
      this.setData({ benefitAvailable: !!status.canClaim });
    } catch (e) {
      this.setData({ benefitAvailable: false });
    }
  },

  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); },
  goExpense() { wx.navigateTo({ url: '/pages/expense/expense' }); },
  goDataBackup() { wx.navigateTo({ url: '/pages/data-backup/data-backup' }); },
  goShippingAddress() { wx.navigateTo({ url: '/pages/shipping-address/shipping-address' }); },
  goThemeCenter() { wx.navigateTo({ url: '/packages/theme-center/theme-center' }); },
  goBenefitCenter() { wx.navigateTo({ url: '/packages/benefit-center/benefit-center' }); },
  goFeedback() { wx.navigateTo({ url: '/pages/feedback/feedback' }); },
  goAdminAnnounce() { wx.navigateTo({ url: '/packages/admin-announcement/admin-announcement' }); },
  goAdmin() { wx.navigateTo({ url: '/packages/admin-items/admin-items' }); },
  goAdminData() { wx.navigateTo({ url: '/packages/admin-data/admin-data' }); }
});
