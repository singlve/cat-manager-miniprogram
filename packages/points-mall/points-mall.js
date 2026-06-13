const clouddb = require('../../utils/clouddb.js');
const { reportError } = require('../../utils/error-log.js');
const {
  getTheme,
  getThemeProducts,
  normalizeOwnedThemes,
  getInitialThemeData
} = require('../../utils/themes.js');
const initialTheme = getInitialThemeData();

Page({
  data: {
    isOnline: true,
    items: [],
    filteredItems: [],
    loading: true,
    loadError: false,
    filter: 'all',
    currentUser: null,
    points: 0,
    themeVouchers: 0,
    themeVoucherMaxPoints: 0,
    ownedThemes: ['default'],
    themeClass: initialTheme.themeClass,
    themeKey: initialTheme.themeKey,
    themePrimary: initialTheme.themePrimary,
    themeSecondary: initialTheme.themeSecondary,
    // 兑换弹窗
    showRedeemModal: false,
    redeemTarget: null,
    redeeming: false,
    redeemRequestId: '',
    redeemMethod: 'points',
    voucherEligible: false,
    // 数量选择
    redeemQty: 1,
    redeemMaxQty: 1,
    redeemTotalCost: 0,
    showRulesModal: false,
    showRecordsModal: false,
    recordsLoading: false,
    redeemRecords: []
  },

  onLoad(options) {
    if (options && options.filter) {
      this.setData({ filter: options.filter });
    }
  },

  async onShow() {
    var app = getApp();
    var activeTheme = app.applyTheme();
    this.setData({
      isOnline: app.globalData.isOnline,
      themeClass: activeTheme.className,
      themeKey: activeTheme.key,
      themePrimary: activeTheme.primary,
      themeSecondary: activeTheme.secondary
    });
    await this.loadUser();
    await this.loadItems();
  },

  async loadUser() {
    try {
      var user = wx.getStorageSync('currentUser');
      if (user && user._id) {
        try {
          var cloudUser = await clouddb.getUserById(user._id);
          if (cloudUser) {
            user = Object.assign({}, user, cloudUser);
            wx.setStorageSync('currentUser', user);
          }
        } catch (e) {}
      }
      var points = (user && user.totalPoints) || 0;
      var ownedThemes = normalizeOwnedThemes(user && user.ownedThemes);
      var themeVouchers = Math.max(0, parseInt(user && user.themeVouchers, 10) || 0);
      var benefitStatus = null;
      if (user && user._id) {
        try { benefitStatus = await clouddb.getBenefitStatus(); } catch (e) {}
      }
      if (benefitStatus) {
        themeVouchers = Math.max(0, parseInt(benefitStatus.themeVouchers, 10) || 0);
        user.themeVouchers = themeVouchers;
        wx.setStorageSync('currentUser', user);
      }
      this.setData({
        currentUser: user,
        points: points,
        ownedThemes: ownedThemes,
        themeVouchers: themeVouchers,
        themeVoucherMaxPoints: benefitStatus
          ? (parseInt(benefitStatus.voucherMaxPoints, 10) || 1000)
          : (themeVouchers > 0 ? 1000 : 0)
      });
    } catch (e) {}
  },

  async loadItems() {
    this.setData({ loading: true, loadError: false });
    try {
      var items = await clouddb.getRedeemItems();
      var allItems = items || [];
      var existingIds = allItems.reduce(function(map, item) {
        map[item._id] = true;
        if (item.virtualType === 'theme') map['theme:' + item.virtualValue] = true;
        return map;
      }, {});
      getThemeProducts().forEach(function(item) {
        if (!existingIds[item._id] && !existingIds['theme:' + item.virtualValue]) {
          allItems.push(item);
        }
      });
      var enabled = allItems.filter(function(i) { return i.enabled !== false; });
      var ownedThemes = this.data.ownedThemes;
      enabled = enabled.map(function(item) {
        var isTheme = item.type === 'virtual' && item.virtualType === 'theme';
        var themeMeta = isTheme ? getTheme(item.virtualValue) : null;
        return Object.assign({}, item, {
          _owned: isTheme && ownedThemes.indexOf(item.virtualValue) !== -1,
          _voucherEligible: isTheme &&
            ownedThemes.indexOf(item.virtualValue) === -1 &&
            (parseInt(item.points, 10) || 0) <= (this.data.themeVoucherMaxPoints || 0),
          limited: isTheme ? !!themeMeta.limited : !!item.limited,
          badge: isTheme ? (themeMeta.badge || item.badge || '') : (item.badge || '')
        });
      }, this);
      var filtered = this._applyFilter(enabled);
      this.setData({ items: enabled, filteredItems: filtered, loading: false });
    } catch (e) {
      console.error('[points-mall] load fail:', e);
      this.setData({ items: [], filteredItems: [], loading: false, loadError: true });
    }
  },

  retryLoad() { this.loadItems(); },

  openRules() {
    this.setData({ showRulesModal: true });
  },

  closeRules() {
    this.setData({ showRulesModal: false });
  },

  async openRedeemRecords() {
    this.setData({ showRecordsModal: true, recordsLoading: true });
    try {
      var records = await clouddb.getRedeemRecords();
      records = (records || []).map(function(record) {
        return Object.assign({}, record, {
          _timeText: formatRedeemTime(record.redeemedAt),
          _statusText: getRedeemStatusText(record),
          _costText: record.paymentMethod === 'theme_voucher'
            ? '主题券'
            : '-' + (record.pointsSpent || 0)
        });
      });
      this.setData({ redeemRecords: records, recordsLoading: false });
    } catch (e) {
      console.error('[points-mall] load records fail:', e);
      this.setData({ redeemRecords: [], recordsLoading: false });
      wx.showToast({ title: '记录加载失败', icon: 'none' });
    }
  },

  closeRedeemRecords() {
    this.setData({ showRecordsModal: false });
  },

  goThemeCenter() {
    wx.navigateTo({ url: '/packages/theme-center/theme-center' });
  },

  switchFilter(e) {
    var filter = e.currentTarget.dataset.filter;
    var filtered = this._applyFilter(this.data.items, filter);
    this.setData({ filter: filter, filteredItems: filtered });
  },

  _applyFilter(items, filter) {
    var f = filter || this.data.filter;
    if (f === 'all') return items;
    if (f === 'voucher') return items.filter(function(i) { return i._voucherEligible; });
    return items.filter(function(i) { return i.type === f; });
  },

  // ── 打开兑换弹窗 ──
  openRedeem(e) {
    const item = e.currentTarget.dataset.item;
    if (item.virtualType === 'theme' && item._owned) {
      wx.showToast({ title: '这个主题已经拥有', icon: 'none' });
      return;
    }
    var maxQty = 1;
    if (item.type === 'physical' && item.stock > 1) {
      maxQty = Math.min(item.stock, Math.floor((this.data.points || 0) / Math.max(1, item.points)));
      if (maxQty < 1) maxQty = 1;
    }
    var voucherEligible = item.virtualType === 'theme' &&
      (parseInt(item.points, 10) || 0) <= this.data.themeVoucherMaxPoints &&
      this.data.themeVouchers > 0;
    this.setData({
      showRedeemModal: true,
      redeemTarget: item,
      redeemRequestId: 'redeem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
      redeemQty: 1,
      redeemMaxQty: maxQty,
      redeemTotalCost: voucherEligible ? 0 : item.points,
      voucherEligible: voucherEligible,
      redeemMethod: voucherEligible ? 'theme_voucher' : 'points'
    });
  },

  closeRedeem() {
    this.setData({
      showRedeemModal: false,
      redeemTarget: null,
      redeemQty: 1,
      redeemRequestId: '',
      redeemMethod: 'points',
      voucherEligible: false
    });
  },

  selectRedeemMethod(e) {
    var method = e.currentTarget.dataset.method;
    if (method === 'theme_voucher' && !this.data.voucherEligible) return;
    var cost = method === 'theme_voucher'
      ? 0
      : ((this.data.redeemTarget && this.data.redeemTarget.points) || 0) * this.data.redeemQty;
    this.setData({ redeemMethod: method, redeemTotalCost: cost });
  },

  // ── 数量调节 ──
  qtyMinus() {
    var q = this.data.redeemQty - 1;
    if (q < 1) q = 1;
    this._updateQty(q);
  },
  qtyPlus() {
    var q = this.data.redeemQty + 1;
    if (q > this.data.redeemMaxQty) q = this.data.redeemMaxQty;
    this._updateQty(q);
  },
  setRedeemQty(e) {
    var q = parseInt(e.currentTarget.dataset.qty) || 1;
    if (q < 1) q = 1;
    if (q > this.data.redeemMaxQty) q = this.data.redeemMaxQty;
    this._updateQty(q);
  },
  _updateQty(q) {
    var cost = this.data.redeemMethod === 'theme_voucher'
      ? 0
      : (this.data.redeemTarget ? this.data.redeemTarget.points : 0) * q;
    this.setData({ redeemQty: q, redeemTotalCost: cost });
  },

  // ── 确认兑换（支持批量） ──
  async confirmRedeem() {
    var { redeemTarget, points, redeeming, currentUser, redeemQty, redeemMethod } = this.data;
    if (redeeming) return;
    if (!redeemTarget) return;

    if (redeemTarget.virtualType === 'theme' &&
        this.data.ownedThemes.indexOf(redeemTarget.virtualValue) !== -1) {
      wx.showToast({ title: '这个主题已经拥有', icon: 'none' });
      this.closeRedeem();
      return;
    }

    var totalCost = redeemMethod === 'theme_voucher' ? 0 : redeemTarget.points * redeemQty;

    // 检查积分
    if (redeemMethod === 'points' && points < totalCost) {
      wx.showToast({ title: '积分不足', icon: 'none' }); return;
    }

    // 检查库存（实物）
    if (redeemTarget.type === 'physical' && redeemTarget.stock < redeemQty) {
      wx.showToast({ title: '库存不足', icon: 'none' }); return;
    }

    this.setData({ redeeming: true });

    try {
      var user = wx.getStorageSync('currentUser') || {};
      var requestId = this.data.redeemRequestId || (
        'redeem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
      );
      this.setData({ redeemRequestId: requestId });
      var result = await clouddb.redeemItemAtomic({
        userId: currentUser && currentUser._id,
        itemId: redeemTarget._id,
        quantity: redeemQty,
        requestId: requestId,
        paymentMethod: redeemMethod
      });
      user.totalPoints = result.points;
      user.makeUpCards = result.makeUpCards;
      user.ownedThemes = normalizeOwnedThemes(result.ownedThemes);
      user.themeVouchers = Math.max(0, parseInt(result.themeVouchers, 10) || 0);
      wx.setStorageSync('currentUser', user);

      var msg = result.virtualType === 'theme'
        ? '主题已解锁'
        : (result.itemType === 'virtual' ? '兑换成功' : '已加入背包 ×' + result.quantity);
      var redeemedThemeKey = result.themeKey || '';
      if (!redeemedThemeKey) {
        wx.showToast({ title: msg, icon: 'success' });
      }

      this.setData({
        points: result.points,
        ownedThemes: normalizeOwnedThemes(user.ownedThemes),
        themeVouchers: user.themeVouchers,
        currentUser: user,
        showRedeemModal: false,
        redeemTarget: null,
        redeemRequestId: '',
        redeemMethod: 'points',
        voucherEligible: false
      });
      await this.loadItems();
      if (redeemedThemeKey) {
        this.promptUseRedeemedTheme(redeemedThemeKey);
      }
    } catch (e) {
      reportError('pointsMall.redeem', e, { itemId: redeemTarget && redeemTarget._id, quantity: redeemQty });
      wx.showToast({ title: e.message || '兑换失败，请重试', icon: 'none' });
    } finally {
      this.setData({ redeeming: false });
    }
  },

  promptUseRedeemedTheme(themeKey) {
    var theme = getTheme(themeKey);
    var self = this;
    wx.showModal({
      title: '主题已解锁',
      content: theme.name + ' 已永久加入你的背包，现在就换上看看吗？',
      cancelText: '稍后再说',
      confirmText: '立即使用',
      success: function(res) {
        if (res.confirm) self.applyRedeemedTheme(themeKey);
      }
    });
  },

  async applyRedeemedTheme(themeKey) {
    var oldUser = {};
    try { oldUser = Object.assign({}, wx.getStorageSync('currentUser') || {}); } catch (e) {}
    var oldThemeKey = oldUser.activeTheme || getApp().globalData.activeTheme || 'default';
    var nextUser = Object.assign({}, oldUser, {
      activeTheme: themeKey,
      ownedThemes: normalizeOwnedThemes((oldUser.ownedThemes || []).concat(themeKey))
    });
    var cloudThemeSaved = false;
    wx.showLoading({ title: '正在换上主题' });
    try {
      if (nextUser._id) {
        await clouddb.updateUser(nextUser._id, {
          activeTheme: themeKey,
          ownedThemes: nextUser.ownedThemes
        });
        cloudThemeSaved = true;
      }
      wx.setStorageSync('currentUser', nextUser);
      var active = getApp().applyTheme(themeKey);
      this.setData({
        currentUser: nextUser,
        themeClass: active.className,
        themeKey: active.key,
        themePrimary: active.primary,
        themeSecondary: active.secondary
      });
      wx.hideLoading();
      try { wx.vibrateShort({ type: 'light' }); } catch (e) {}
      wx.showToast({ title: '主题已启用', icon: 'success' });
    } catch (e) {
      if (oldUser._id && cloudThemeSaved) {
        try {
          await clouddb.updateUser(oldUser._id, {
            activeTheme: oldThemeKey,
            ownedThemes: normalizeOwnedThemes(oldUser.ownedThemes)
          });
        } catch (rollbackError) {}
      }
      try { wx.setStorageSync('currentUser', oldUser); } catch (storageError) {}
      var restored = getApp().applyTheme(oldThemeKey);
      this.setData({
        currentUser: oldUser,
        themeClass: restored.className,
        themeKey: restored.key,
        themePrimary: restored.primary,
        themeSecondary: restored.secondary
      });
      wx.hideLoading();
      wx.showToast({ title: '启用失败，已恢复原主题', icon: 'none' });
    }
  },

  goInventory() { wx.navigateTo({ url: '/packages/inventory/inventory' }); },
  stopBubble() {},

  async onPullDownRefresh() {
    try { await this.loadUser(); await this.loadItems(); } finally { wx.stopPullDownRefresh(); }
  },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.jpg', title: '宠物小管家Plus - 积分商城', path: '/packages/points-mall/points-mall' };
  },
});

function formatRedeemTime(value) {
  if (!value) return '时间未知';
  var date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16).replace('T', ' ');
  var pad = function(number) { return String(number).padStart(2, '0'); };
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function getRedeemStatusText(record) {
  if (record.itemType === 'virtual') return '已到账';
  return {
    in_backpack: '背包中',
    shipping: '待发货',
    shipped: '已发货',
    completed: '已完成',
    cancelled: '已取消'
  }[record.status] || '已兑换';
}
