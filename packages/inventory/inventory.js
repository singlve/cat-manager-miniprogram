// pages/inventory/inventory.js
// 我的背包 — 合并展示 + 数量选择 + 筛选
const clouddb = require('../../utils/clouddb.js');
const { getInitialThemeData } = require('../../utils/themes.js');
const initialTheme = getInitialThemeData();

Page({
  data: {
    isOnline: true,
    filterTab: 'all',       // 'all' | 'physical' | 'virtual'
    items: [],              // all consolidated items
    filteredItems: [],      // filtered view
    addresses: [],
    loading: true,
    loadError: false,
    emptyText: '还没有兑换商品',
    // 确认兑换弹窗
    showConfirm: false,
    confirmTarget: null,
    confirmQty: 1,
    confirmMax: 1,
    selectedAddressId: '',
    saving: false,

    // 物流查询弹窗
    showTracking: false,
    trackingLoading: false,
    trackingResult: null,
    currentTrackingCarrier: '',
    currentTrackingNo: '',
    themeClass: initialTheme.themeClass,
    themeKey: initialTheme.themeKey,
    themePrimary: initialTheme.themePrimary,
    themeSecondary: initialTheme.themeSecondary
  },

  onShow() {
    var app = getApp();
    var activeTheme = app.applyTheme();
    this.setData({
      isOnline: app.globalData.isOnline,
      themeClass: activeTheme.className,
      themeKey: activeTheme.key,
      themePrimary: activeTheme.primary,
      themeSecondary: activeTheme.secondary
    });
    this.loadAll();
  },

  async loadAll() {
    this.setData({ loading: true, loadError: false });
    try {
      const [raw, addresses] = await Promise.all([
        clouddb.getUserInventory(),
        clouddb.getShippingAddresses()
      ]);

      // 按 itemId 合并，保留每条原始记录用于展示
      const groups = {};
      (raw || []).forEach(function(item) {
        var key = item.itemId || item._id;
        if (!groups[key]) {
          groups[key] = {
            key: key,
            itemId: item.itemId || key,
            name: item.itemName || item.name || '商品',
            image: item.image || '',
            itemType: item.itemType || 'physical',
            virtualType: item.virtualType || '',
            themeKey: item.themeKey || '',
            points: item.pointsSpent || item.points || 0,
            totalQty: 0,
            inBackpackQty: 0,
            pendingQty: 0,
            shippedQty: 0,
            receivedQty: 0,
            completedQty: 0,
            waitingStockQty: 0,
            rawItems: [],
            // 各状态下明细
            inBackpackItems: [],
            pendingItems: [],
            shippedItems: [],
            receivedItems: [],
            completedItems: []
          };
        }
        var g = groups[key];
        g.totalQty++;
        g.rawItems.push(item);
        if (item.source === 'lottery' && item.stockReserved !== true && item.status === 'in_backpack') {
          g.waitingStockQty++;
        }
        if (item.status === 'pending') {
          g.pendingQty++;
          g.pendingItems.push(item);
        } else if (item.status === 'shipped') {
          g.shippedQty++;
          g.shippedItems.push(item);
        } else if (item.status === 'received') {
          g.receivedQty++;
          g.receivedItems.push(item);
        } else if (item.status === 'completed') {
          g.completedQty++;
          g.completedItems.push(item);
        } else {
          g.inBackpackQty++;
          g.inBackpackItems.push(item);
        }
      });

      // 提取唯一的快递信息（同商品多次购买用同一个快递，聚合展示）
      Object.values(groups).forEach(function(g) {
        if (g.shippedItems.length > 0) {
          // 按 carrier+trackingNo 去重并计数，一同兑换的多个商品只展示一条快递信息
          var trackMap = {};
          g.shippedItems.forEach(function(s) {
            var key = (s.carrier || '') + '|' + (s.trackingNo || '');
            if (!trackMap[key]) { trackMap[key] = { carrier: s.carrier, trackingNo: s.trackingNo, count: 0 }; }
            trackMap[key].count++;
          });
          g.uniqueTrackings = Object.values(trackMap);
        } else {
          g.uniqueTrackings = [];
        }
      });

      var items = Object.values(groups).filter(function(g) { return g.totalQty > 0; });

      // 应用筛选
      var filtered = items;
      if (this.data.filterTab === 'physical') filtered = items.filter(function(g) { return g.itemType === 'physical'; });
      else if (this.data.filterTab === 'virtual') filtered = items.filter(function(g) { return g.itemType === 'virtual'; });

      var emptyText = '还没有兑换商品';
      if (this.data.filterTab === 'physical') emptyText = '还没有实物商品';
      else if (this.data.filterTab === 'virtual') emptyText = '还没有虚拟商品';

      this.setData({
        items: items,
        filteredItems: filtered,
        addresses: addresses || [],
        emptyText: emptyText,
        loading: false
      });
    } catch (e) {
      console.error('[inventory] loadAll fail:', e);
      this.setData({ loading: false, loadError: true });
    }
  },

  retryLoad() { this.loadAll(); },

  // ── 筛选 Tab ──
  switchTab(e) {
    var tab = e.currentTarget.dataset.tab;
    var items = this.data.items;
    var filtered = items;
    if (tab === 'physical') filtered = items.filter(function(g) { return g.itemType === 'physical'; });
    else if (tab === 'virtual') filtered = items.filter(function(g) { return g.itemType === 'virtual'; });
    var emptyText = '还没有兑换商品';
    if (tab === 'physical') emptyText = '还没有实物商品';
    else if (tab === 'virtual') emptyText = '还没有虚拟商品';
    this.setData({ filterTab: tab, filteredItems: filtered, emptyText: emptyText });
  },

  // ── 确认兑换弹窗 ──
  openConfirmModal(e) {
    var item = e.currentTarget.dataset.item;
    if (!item || item.inBackpackQty < 1) return;
    var defaultAddr = (this.data.addresses || []).find(function(a) { return a.isDefault; });
    this.setData({
      showConfirm: true,
      confirmTarget: item,
      confirmMax: item.inBackpackQty,
      confirmQty: item.inBackpackQty,
      selectedAddressId: defaultAddr ? defaultAddr._id : '',
      saving: false
    });
  },

  closeConfirmModal() {
    this.setData({ showConfirm: false, confirmTarget: null, confirmQty: 1, saving: false });
  },

  // 数量调节
  qtyMinus() {
    if (this.data.confirmQty > 1) this.setData({ confirmQty: this.data.confirmQty - 1 });
  },
  qtyPlus() {
    if (this.data.confirmQty < this.data.confirmMax) this.setData({ confirmQty: this.data.confirmQty + 1 });
  },
  selectAddress(e) {
    this.setData({ selectedAddressId: e.currentTarget.dataset.id });
  },

  // 执行确认兑换 — 生成发货单
  async doConfirm() {
    var self = this;
    var confirmTarget = this.data.confirmTarget;
    var confirmQty = this.data.confirmQty;
    var selectedAddressId = this.data.selectedAddressId;
    var addresses = this.data.addresses;
    if (this.data.saving) return;

    var addr = null;
    if (confirmTarget.itemType === 'physical') {
      if (!selectedAddressId) { wx.showToast({ title: '请选择收货地址', icon: 'none' }); return; }
      addr = addresses.find(function(a) { return a._id === selectedAddressId; });
      if (!addr) { wx.showToast({ title: '地址无效', icon: 'none' }); return; }
    }

    this.setData({ saving: true });
    try {
      // 拿前 confirmQty 件 in_backpack 的原始条目
      var available = confirmTarget.rawItems.filter(function(i) { return i.status === 'in_backpack'; });
      var toConfirm = available.slice(0, confirmQty);
      var currentUser = null;
      try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}
      await clouddb.confirmInventoryAtomic({
        userId: currentUser && currentUser._id,
        inventoryIds: toConfirm.map(function(item) { return item._id; }),
        addressId: selectedAddressId
      });

      wx.showToast({ title: '已确认 ' + confirmQty + ' 件，等待管理员发货', icon: 'success' });
      this.setData({ showConfirm: false, confirmTarget: null });
      await this.loadAll();
    } catch (e) {
      console.error('[inventory] confirm fail:', e);
      wx.showToast({ title: e.message || '操作失败，请重试', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  // ── 取消全部待确认 ──
  async cancelAll(e) {
    var item = e.currentTarget.dataset.item;
    if (!item || item.inBackpackQty < 1) return;

    var toCancel = item.rawItems.filter(function(i) { return i.status === 'in_backpack'; });
    var redeemItems = await clouddb.getRedeemItems();
    var targetItem = (redeemItems || []).find(function(product) { return product._id === item.itemId; });
    var estimatedPoints = toCancel.reduce(function(sum, raw) {
      var points = Math.max(0, parseInt(raw.pointsSpent, 10) || 0);
      if (raw.source === 'lottery') {
        points = Math.max(0, parseInt(raw.compensationPoints, 10) || 0);
        if (!points) points = Math.max(0, parseInt(targetItem && targetItem.points, 10) || 0);
      }
      return sum + points;
    }, 0);

    var confirmed = await this._confirmDeleteTwice({
      title: '取消并兑换积分',
      content: '将取消「' + item.name + '」共 ' + toCancel.length + ' 件，预计获得 ' + estimatedPoints + ' 积分。',
      confirmText: '继续',
      secondTitle: '再次确认取消',
      secondContent: '确认后商品会从背包移除，已预留库存将释放，并获得 ' + estimatedPoints + ' 积分。此操作不可恢复。',
      secondConfirmText: '确认取消'
    });
    if (!confirmed) return;

    this.setData({ loading: true });
    try {
      var currentUser = null;
      try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (err) {}
      var result = await clouddb.cancelInventoryAtomic({
        userId: currentUser && currentUser._id,
        inventoryIds: toCancel.map(function(raw) { return raw._id; })
      });
      if (currentUser) {
        currentUser.totalPoints = result.points;
        try { wx.setStorageSync('currentUser', currentUser); } catch (err) {}
      }

      wx.showToast({ title: '已取消，获得 ' + result.compensationPoints + ' 积分', icon: 'success' });
      await this.loadAll();
    } catch (e) {
      console.error('[inventory] cancel fail:', e);
      this.setData({ loading: false });
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
  },

  async deleteInventoryGroup(e) {
    var item = e.currentTarget.dataset.item;
    if (!item || !item.rawItems || item.rawItems.length === 0) return;
    if (item.virtualType === 'theme') {
      wx.showToast({ title: '已解锁主题不能删除', icon: 'none' });
      return;
    }

    var first = await this._confirmDeleteTwice({
      title: '删除背包商品',
      content: '将从背包删除「' + item.name + '」共 ' + item.rawItems.length + ' 件。此操作只移除背包展示，不会返还积分。',
      confirmText: '继续',
      secondTitle: '再次确认删除',
      secondContent: '删除后不可恢复，也不会返还任何积分。若希望把抽奖实物兑换成积分，请返回并使用“取消”。',
      secondConfirmText: '确认删除'
    });
    if (!first) return;

    this.setData({ loading: true });
    try {
      var currentUser = null;
      try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (err) {}
      await clouddb.deleteInventoryAtomic({
        userId: currentUser && currentUser._id,
        inventoryIds: item.rawItems.map(function(raw) { return raw._id; })
      });
      wx.showToast({ title: '已删除', icon: 'success' });
      await this.loadAll();
    } catch (err) {
      console.error('[inventory] deleteInventoryGroup fail:', err);
      this.setData({ loading: false });
      wx.showToast({ title: '删除失败，请重试', icon: 'none' });
    }
  },

  async _confirmDeleteTwice(options) {
    var first = await new Promise(function(r) {
      wx.showModal({
        title: options.title || '确认删除',
        content: options.content || '删除后不可恢复',
        confirmText: options.confirmText || '继续',
        confirmColor: '#F36B6B',
        success: r
      });
    });
    if (!first.confirm) return false;

    var second = await new Promise(function(r) {
      wx.showModal({
        title: options.secondTitle || '再次确认',
        content: options.secondContent || '请再次确认是否删除',
        confirmText: options.secondConfirmText || '删除',
        confirmColor: '#F36B6B',
        success: r
      });
    });
    return !!second.confirm;
  },

  setQty(e) {
    var qty = parseInt(e.currentTarget.dataset.qty) || 1;
    if (qty < 1) qty = 1;
    if (qty > this.data.confirmMax) qty = this.data.confirmMax;
    this.setData({ confirmQty: qty });
  },

    copyTracking(e) {
    var carrier = e.currentTarget.dataset.carrier || '';
    var no = e.currentTarget.dataset.tracking || '';
    if (!no) return;
    wx.setClipboardData({ data: no });
    wx.showToast({ title: (carrier ? carrier + ' ' : '') + '单号已复制', icon: 'none' });
  },

  openTracking(e) {
    var no = e.currentTarget.dataset.tracking || '';
    if (!no) return;
    // 跳转到快递100查询
    wx.navigateTo({ url: '/packages/webview/webview?url=' + encodeURIComponent('https://m.kuaidi100.com/query?nu=' + encodeURIComponent(no)) });
  },

  async queryTracking(e) {
    const carrier = e.currentTarget.dataset.carrier || '';
    const no = e.currentTarget.dataset.tracking || '';
    if (!no) return;

    this.setData({
      showTracking: true, trackingLoading: true, trackingResult: null,
      currentTrackingCarrier: carrier, currentTrackingNo: no
    });

    try {
      const res = await wx.cloud.callFunction({
        name: 'queryExpress',
        data: { carrier, trackingNo: no }
      });
      const r = res.result || {};
      if (r.success) {
        this.setData({ trackingResult: r.data, trackingLoading: false });
      } else {
        wx.showToast({ title: r.error || '查询失败', icon: 'none' });
        this.setData({ showTracking: false, trackingLoading: false });
      }
    } catch (e) {
      console.error('[queryTracking]', e);
      wx.showToast({ title: '查询失败，请重试', icon: 'none' });
      this.setData({ showTracking: false, trackingLoading: false });
    }
  },

  closeTracking() { this.setData({ showTracking: false }); },

  goMall() { wx.navigateTo({ url: '/packages/points-mall/points-mall' }); },

  stopBubble() {},
  goShippingAddress() { wx.navigateTo({ url: '/packages/shipping-address/shipping-address' }); },

  async onPullDownRefresh() {
    try { await this.loadAll(); } finally { wx.stopPullDownRefresh(); }
  },

  onShareAppMessage() {
    return { imageUrl: '/assets/logo.jpg', title: '宠物小管家Plus - 我的背包', path: '/packages/inventory/inventory' };
  },
});
