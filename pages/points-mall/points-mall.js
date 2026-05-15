const clouddb = require('../../utils/clouddb.js');
const app = getApp();

Page({
  data: {
    isOnline: true,
    items: [],
    filteredItems: [],
    loading: true,
    filter: 'all',
    currentUser: null,
    points: 0,
    // 兑换弹窗
    showRedeemModal: false,
    redeemTarget: null,
    redeeming: false,
    // 数量选择
    redeemQty: 1,
    redeemMaxQty: 1,
    redeemTotalCost: 0
  },

  async onShow() {
    this.setData({ isOnline: getApp().globalData.isOnline });
    this.loadUser();
    await this.loadItems();
  },

  async loadUser() {
    try {
      var user = wx.getStorageSync('currentUser');
      var points = (user && user.totalPoints) || 0;
      this.setData({ currentUser: user, points: points });
    } catch (e) {}
  },

  async loadItems() {
    this.setData({ loading: true });
    try {
      var items = await clouddb.getRedeemItems();
      var enabled = items ? items.filter(function(i) { return i.enabled !== false; }) : [];
      var filtered = this._applyFilter(enabled);
      this.setData({ items: enabled, filteredItems: filtered, loading: false });
    } catch (e) {
      console.error('[points-mall] load fail:', e);
      this.setData({ items: [], filteredItems: [], loading: false });
    }
  },

  switchFilter(e) {
    var filter = e.currentTarget.dataset.filter;
    var filtered = this._applyFilter(this.data.items, filter);
    this.setData({ filter: filter, filteredItems: filtered });
  },

  _applyFilter(items, filter) {
    var f = filter || this.data.filter;
    if (f === 'all') return items;
    return items.filter(function(i) { return i.type === f; });
  },

  // ── 打开兑换弹窗 ──
  openRedeem(e) {
    const item = e.currentTarget.dataset.item;
    var maxQty = 1;
    if (item.type === 'physical' && item.stock > 1) {
      maxQty = Math.min(item.stock, Math.floor((this.data.points || 0) / Math.max(1, item.points)));
      if (maxQty < 1) maxQty = 1;
    }
    this.setData({
      showRedeemModal: true,
      redeemTarget: item,
      redeemQty: 1,
      redeemMaxQty: maxQty,
      redeemTotalCost: item.points
    });
  },

  closeRedeem() {
    this.setData({ showRedeemModal: false, redeemTarget: null, redeemQty: 1 });
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
    var cost = (this.data.redeemTarget ? this.data.redeemTarget.points : 0) * q;
    this.setData({ redeemQty: q, redeemTotalCost: cost });
  },

  // ── 确认兑换（支持批量） ──
  async confirmRedeem() {
    var self = this;
    var { redeemTarget, points, redeeming, currentUser, redeemQty } = this.data;
    if (redeeming) return;

    var totalCost = redeemTarget.points * redeemQty;

    // 检查积分
    if (points < totalCost) {
      wx.showToast({ title: '积分不足', icon: 'none' }); return;
    }

    // 检查库存（实物）
    if (redeemTarget.type === 'physical' && redeemTarget.stock < redeemQty) {
      wx.showToast({ title: '库存不足', icon: 'none' }); return;
    }

    this.setData({ redeeming: true });

    try {
      // 扣积分
      var newPoints = points - totalCost;
      if (currentUser && currentUser._id) {
        await clouddb.updateUser(currentUser._id, { totalPoints: newPoints });
      }
      var user = wx.getStorageSync('currentUser') || {};
      user.totalPoints = newPoints;
      wx.setStorageSync('currentUser', user);

      // 批量处理：循环 redeemQty 次
      for (var i = 0; i < redeemQty; i++) {
        // 记录兑换
        var record = {
          itemId: redeemTarget._id,
          itemName: redeemTarget.name,
          itemType: redeemTarget.type,
          pointsSpent: redeemTarget.points,
          userNickname: (currentUser && currentUser.nickname) || '',
          openid: (currentUser && currentUser._openid) || '',
          redeemedAt: new Date().toISOString(),
          status: redeemTarget.type === 'physical' ? 'in_backpack' : 'completed'
        };
        await clouddb.addRedeemRecord(record);

        if (redeemTarget.type === 'virtual') {
          // 虚拟商品：累加效果
          if (redeemTarget.virtualType === 'card') {
            user.makeUpCards = (user.makeUpCards || 0) + (redeemTarget.virtualValue || 0);
          } else if (redeemTarget.virtualType === 'points') {
            user.totalPoints = (user.totalPoints || 0) + (redeemTarget.virtualValue || 0);
            newPoints += redeemTarget.virtualValue; // 同步更新 local
          }
        } else {
          // 实物商品：加入背包
          var invItem = {
            itemId: redeemTarget._id,
            itemName: redeemTarget.name,
            itemType: 'physical',
            image: redeemTarget.image || '',
            pointsSpent: redeemTarget.points,
            ownedAt: new Date().toISOString(),
            status: 'in_backpack',
            redeemRecordId: record._id
          };
          await clouddb.addToInventory(invItem);
          await clouddb.updateRedeemRecord(record._id, { inventoryId: invItem._id });
        }
      }

      // 虚拟商品结果写回云端
      if (redeemTarget.type === 'virtual' && currentUser && currentUser._id) {
        await clouddb.updateUser(currentUser._id, {
          makeUpCards: user.makeUpCards,
          totalPoints: user.totalPoints
        });
        wx.setStorageSync('currentUser', user);
      }

      // 更新商品库存
      if (redeemTarget.type === 'physical' && redeemTarget.stock) {
        await clouddb.updateRedeemItem(redeemTarget._id, { stock: redeemTarget.stock - redeemQty });
      }

      var msg = redeemTarget.type === 'virtual' ? '兑换成功' : '已加入背包 ×' + redeemQty;
      wx.showToast({ title: msg, icon: 'success' });

      this.setData({
        points: newPoints,
        showRedeemModal: false,
        redeemTarget: null
      });
      await this.loadItems();
    } catch (e) {
      console.error('[points-mall] redeem fail:', e);
      wx.showToast({ title: '兑换失败，请重试', icon: 'none' });
    } finally {
      this.setData({ redeeming: false });
    }
  },

  goInventory() { wx.navigateTo({ url: '/pages/inventory/inventory' }); },
  stopBubble() {},

  async onPullDownRefresh() {
    try { await this.loadUser(); await this.loadItems(); } finally { wx.stopPullDownRefresh(); }
  },

  onShareAppMessage() {
    return { title: '猫咪健康管家 - 积分商城 🎁', path: '/pages/points-mall/points-mall' };
  },
});