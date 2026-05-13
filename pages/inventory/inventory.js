// pages/inventory/inventory.js
// 我的背包 — 合并展示 + 数量选择 + 筛选
const clouddb = require('../../utils/clouddb.js');

Page({
  data: {
    filterTab: 'all',       // 'all' | 'physical' | 'virtual'
    items: [],              // all consolidated items
    filteredItems: [],      // filtered view
    addresses: [],
    loading: true,
    emptyText: '还没有兑换商品',
    // 确认兑换弹窗
    showConfirm: false,
    confirmTarget: null,
    confirmQty: 1,
    confirmMax: 1,
    selectedAddressId: '',
    saving: false
  },

  onShow() { this.loadAll(); },

  async loadAll() {
    this.setData({ loading: true });
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
            points: item.pointsSpent || item.points || 0,
            totalQty: 0,
            inBackpackQty: 0,
            pendingQty: 0,
            shippedQty: 0,
            receivedQty: 0,
            rawItems: [],
            // 各状态下明细
            inBackpackItems: [],
            pendingItems: [],
            shippedItems: [],
            receivedItems: []
          };
        }
        var g = groups[key];
        g.totalQty++;
        g.rawItems.push(item);
        if (item.status === 'pending') {
          g.pendingQty++;
          g.pendingItems.push(item);
        } else if (item.status === 'shipped') {
          g.shippedQty++;
          g.shippedItems.push(item);
        } else if (item.status === 'received') {
          g.receivedQty++;
          g.receivedItems.push(item);
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
      this.setData({ loading: false });
    }
  },

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

      var shippingAddr = addr ? {
        name: addr.name, phone: addr.phone,
        province: addr.province, city: addr.city,
        district: addr.district, detail: addr.detail
      } : null;

      var currentUser = null;
      try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}

      // 收集 inventoryIds 和 redeemRecordIds
      var inventoryIds = [];
      var redeemRecordIds = [];

      // 逐件更新状态
      for (var idx = 0; idx < toConfirm.length; idx++) {
        var item = toConfirm[idx];
        inventoryIds.push(item._id);
        if (item.redeemRecordId) redeemRecordIds.push(item.redeemRecordId);

        // 更新兑换记录状态
        if (confirmTarget.itemType === 'physical' && item.redeemRecordId) {
          await clouddb.updateRedeemRecord(item.redeemRecordId, {
            status: 'pending',
            shippingAddress: shippingAddr,
            shippingAddressId: selectedAddressId || ''
          });
        }
        // 更新背包 item 状态
        await clouddb.updateInventoryItem(item._id, {
          status: 'pending',
          shippingAddress: shippingAddr,
          shippingAddressId: selectedAddressId || ''
        });
      }

      // 生成发货单（合并 N 件为一条）
      if (confirmTarget.itemType === 'physical' && toConfirm.length > 0) {
        await clouddb.addShipment({
          itemId: confirmTarget.itemId,
          itemName: confirmTarget.name,
          qty: toConfirm.length,
          userNickname: (currentUser && currentUser.nickname) || '',
          openid: (currentUser && currentUser._openid) || '',
          shippingAddress: shippingAddr,
          shippingAddressId: selectedAddressId || '',
          status: 'pending',
          inventoryIds: inventoryIds,
          redeemRecordIds: redeemRecordIds
        });
      }

      wx.showToast({ title: '已确认 ' + confirmQty + ' 件，等待管理员发货', icon: 'success' });
      this.setData({ showConfirm: false, confirmTarget: null });
      await this.loadAll();
    } catch (e) {
      console.error('[inventory] confirm fail:', e);
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  // ── 取消全部待确认 ──
  async cancelAll(e) {
    var self = this;
    var item = e.currentTarget.dataset.item;
    if (!item || item.inBackpackQty < 1) return;

    var res = await new Promise(function(r) {
      wx.showModal({
        title: '取消兑换',
        content: '取消 "' + item.name + '" 全部 ' + item.inBackpackQty + ' 件？\n积分将返还，库存恢复。',
        confirmColor: '#e74c3c',
        success: r
      });
    });
    if (!res.confirm) return;

    this.setData({ loading: true });
    try {
      var toCancel = item.rawItems.filter(function(i) { return i.status === 'in_backpack'; });
      var totalPoints = toCancel.length * item.points;

      // 返还积分
      if (totalPoints > 0) {
        var currentUser = null;
        try { currentUser = wx.getStorageSync('currentUser') || {}; } catch (e) {}
        if (currentUser && currentUser._id) {
          await clouddb.updateUser(currentUser._id, {
            totalPoints: (currentUser.totalPoints || 0) + totalPoints
          });
          currentUser.totalPoints = (currentUser.totalPoints || 0) + totalPoints;
          try { wx.setStorageSync('currentUser', currentUser); } catch (e) {}
        }
      }

      // 恢复库存
      if (item.itemId) {
        var redeemItems = await clouddb.getRedeemItems();
        var targetItem = (redeemItems || []).find(function(ri) { return ri._id === item.itemId; });
        if (targetItem) {
          await clouddb.updateRedeemItem(item.itemId, {
            stock: (targetItem.stock || 0) + toCancel.length
          });
        }
      }

      // 删除对应兑换记录 + 删除背包条目
      for (var j = 0; j < toCancel.length; j++) {
        if (toCancel[j].redeemRecordId) {
          await clouddb.deleteRedeemRecord(toCancel[j].redeemRecordId).catch(function() {});
        }
        await clouddb.deleteInventoryItem(toCancel[j]._id);
      }

      wx.showToast({ title: '已取消 ' + toCancel.length + ' 件，积分已返还', icon: 'success' });
      await this.loadAll();
    } catch (e) {
      console.error('[inventory] cancel fail:', e);
      this.setData({ loading: false });
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
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
    wx.navigateTo({ url: '/pages/webview/webview?url=' + encodeURIComponent('https://m.kuaidi100.com/query?nu=' + encodeURIComponent(no)) });
  },

  goMall() { wx.navigateTo({ url: '/pages/points-mall/points-mall' }); },

  stopBubble() {},
  goShippingAddress() { wx.navigateTo({ url: '/pages/shipping-address/shipping-address' }); }
});