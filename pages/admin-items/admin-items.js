// pages/admin-items/admin-items.js
const clouddb = require('../../utils/clouddb.js');
const util = require('../../utils/util.js');

Page({
  data: {
    activeTab: 'items',
    isAdmin: false,
    loading: true,
    items: [],
    records: [],
    rawRecords: [],       // 未过滤的原始兑换记录
    shipments: [],          // 发货单列表
    // 商品编辑弹窗
    showEditor: false,
    editingId: null,
    form: { name: '', type: 'virtual', virtualType: 'card', virtualValue: 1, points: 0, stock: 9999, desc: '', image: '', enabled: true },
    saving: false,
    // 发货弹窗
    showShipEditor: false,
    shipRecord: {},
    shipCarrier: '',
    shipCarrierIdx: 0,
    shipTrackingNo: '',
    carrierList: ['顺丰速运', '中通快递', '圆通速递', '韵达快递', '申通快递', '极兔速递', '京东物流', 'EMS', '其他'],
    shipping: false,
    // 兑换记录搜索
    searchTypeIdx: 0,
    searchTypes: ['用户昵称', '手机号', '商品名称'],
    searchKeyword: '',
    phoneMap: {}           // openid → phone（云端查询用户表构建）
  },

  formatTime(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    var pad = function(n) { return n < 10 ? '0' + n : n; };
    return (d.getMonth()+1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  },

  async onLoad() { await this.checkAdmin(); },

  async onShow() {
    if (this.data.isAdmin) await this.loadAll();
  },

  async checkAdmin() {
    var isAdmin = util.isAdmin();
    this.setData({ isAdmin: isAdmin });
    if (!isAdmin) {
      wx.showToast({ title: '无权访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  async loadAll() {
    this.setData({ loading: true });
    var self = this;
    var items = [], records = [], shipments = [], phoneMap = {};

    // 独立加载每个数据源，一个失败不影响其他
    try { items = await clouddb.getRedeemItems() || []; } catch (e) { console.error('[admin] load items fail:', e); }
    try { records = await clouddb.getRedeemRecordsAdmin() || []; } catch (e) { console.error('[admin] load records fail:', e); }
    try { shipments = await clouddb.getShipmentsAdmin() || []; } catch (e) { console.error('[admin] load shipments fail:', e); }

    // 构建手机号映射（云端查询用户表）
    if (clouddb.isCloudReady()) {
      try {
        var db = wx.cloud.database();
        var { data: users } = await db.collection('users').limit(200).get();
        (users || []).forEach(function(u) {
          if (u._openid && u.phone) phoneMap[u._openid] = u.phone;
        });
      } catch (e) { console.warn('[admin] load users fail:', e); }
    }

    // 兑换记录：按 itemId 分组合并显示
    var mergedRecords = self._mergeRecords(records);
    mergedRecords.forEach(function(g) { g.firstAtFormatted = self.formatTime(g.firstAt); });

    // 发货单：格式化时间
    shipments = shipments.map(function(s) {
      s.createdAtFormatted = self.formatTime(s.createdAt);
      s.shippedAtFormatted = s.shippedAt ? self.formatTime(s.shippedAt) : '';
      return s;
    });

    var hasPending = false, hasShipped = false;
    shipments.forEach(function(s) {
      if (s.status === 'pending') hasPending = true;
      if (s.status === 'shipped') hasShipped = true;
    });

    this.setData({
      items: items,
      records: mergedRecords,
      rawRecords: records,
      shipments: shipments,
      phoneMap: phoneMap,
      hasPending: hasPending,
      hasShipped: hasShipped,
      loading: false
    });
  },

  // 合并兑换记录（按 itemId 分组）
  _mergeRecords(records) {
    var self = this;
    var groups = {};
    (records || []).forEach(function(r) {
      var key = r.itemId || r._id;
      if (!groups[key]) {
        groups[key] = { key: key, itemId: key, itemName: r.itemName || '商品', itemType: r.itemType || 'physical', count: 0, totalPoints: 0, userNickname: r.userNickname || '', openid: r.openid || '', firstAt: r.redeemedAt || '' };
      }
      groups[key].count++;
      groups[key].totalPoints += (r.pointsSpent || 0);
    });
    return Object.values(groups);
  },

  switchTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab }); },

  // ════════════════════════════════════════
  // 兑换记录搜索
  // ════════════════════════════════════════

  onSearchTypeChange(e) {
    var idx = parseInt(e.detail.value);
    this.setData({ searchTypeIdx: idx });
    this._applySearch();
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value });
    this._applySearch();
  },

  onSearchClear() {
    var self = this;
    this.setData({ searchKeyword: '' });
    // 恢复原始合并记录
    var merged = self._mergeRecords(self.data.rawRecords);
    merged.forEach(function(g) { g.firstAtFormatted = self.formatTime(g.firstAt); });
    this.setData({ records: merged });
  },

  _applySearch() {
    var self = this;
    var rawRecords = this.data.rawRecords;
    var searchTypeIdx = this.data.searchTypeIdx;
    var searchKeyword = this.data.searchKeyword;
    var phoneMap = this.data.phoneMap;
    var keyword = (searchKeyword || '').trim();

    if (!keyword) {
      self.onSearchClear();
      return;
    }

    var kw = keyword.toLowerCase();
    var filtered = rawRecords.filter(function(r) {
      if (searchTypeIdx === 0) {
        // 用户昵称
        return (r.userNickname || '').toLowerCase().indexOf(kw) !== -1;
      } else if (searchTypeIdx === 1) {
        // 手机号
        var phone = phoneMap[r.openid] || r.phone || '';
        return phone.indexOf(kw) !== -1;
      } else {
        // 商品名称
        return (r.itemName || '').toLowerCase().indexOf(kw) !== -1;
      }
    });

    var merged = self._mergeRecords(filtered);
    merged.forEach(function(g) { g.firstAtFormatted = self.formatTime(g.firstAt); });
    this.setData({ records: merged });
  },

  // ════════════════════════════════════════
  // 商品 CRUD（不变）
  // ════════════════════════════════════════

  openAddItem() {
    this.setData({
      showEditor: true, editingId: null,
      form: { name: '', type: 'virtual', virtualType: 'card', virtualValue: 1, points: 0, stock: 9999, desc: '', image: '', enabled: true }
    });
  },

  openEditItem(e) {
    var item = e.currentTarget.dataset.item;
    this.setData({
      showEditor: true, editingId: item._id,
      form: {
        name: item.name || '', type: item.type || 'virtual',
        virtualType: item.virtualType || 'card', virtualValue: item.virtualValue || 1,
        points: item.points || 0, stock: item.stock || 9999,
        desc: item.desc || '', image: item.image || '', enabled: item.enabled !== false
      }
    });
  },

  async toggleItemEnabled(e) {
    var item = e.currentTarget.dataset.item;
    try {
      await clouddb.updateRedeemItem(item._id, { enabled: !item.enabled });
      wx.showToast({ title: !item.enabled ? '已上架' : '已下架', icon: 'success' });
      await this.loadAll();
    } catch (ex) { wx.showToast({ title: '操作失败', icon: 'none' }); }
  },

  async deleteItem(e) {
    var id = e.currentTarget.dataset.id;
    var res = await new Promise(r => wx.showModal({ title: '确认删除', content: '删除后不可恢复', confirmColor: '#e74c3c', success: r }));
    if (!res.confirm) return;
    try {
      await clouddb.deleteRedeemItem(id);
      wx.showToast({ title: '已删除', icon: 'success' });
      await this.loadAll();
    } catch (ex) { wx.showToast({ title: '删除失败', icon: 'none' }); }
  },

  // ════════════════════════════════════════
  // 发货管理
  // ════════════════════════════════════════

  openShipModal(e) {
    var shipment = e.currentTarget.dataset.shipment;
    var carrierIdx = 0;
    var shipCarrier = '';
    var shipTrackingNo = shipment.trackingNo || '';
    if (shipment.carrier) {
      shipCarrier = shipment.carrier;
      carrierIdx = this.data.carrierList.indexOf(shipment.carrier);
      if (carrierIdx < 0) carrierIdx = this.data.carrierList.length - 1;
    }
    this.setData({
      showShipEditor: true,
      shipRecord: shipment,
      shipCarrier: shipCarrier,
      shipCarrierIdx: carrierIdx,
      shipTrackingNo: shipTrackingNo
    });
  },

  closeShipEditor() { this.setData({ showShipEditor: false }); },

  onShipCarrierChange(e) {
    var idx = parseInt(e.detail.value);
    this.setData({ shipCarrierIdx: idx, shipCarrier: this.data.carrierList[idx] });
  },

  onShipTrackingInput(e) { this.setData({ shipTrackingNo: e.detail.value }); },

  async confirmShip() {
    var self = this;
    var { shipRecord, shipCarrier, shipTrackingNo, shipping } = this.data;
    if (shipping) return;
    if (!shipCarrier) { wx.showToast({ title: '请选择快递公司', icon: 'none' }); return; }
    if (!shipTrackingNo.trim()) { wx.showToast({ title: '请输入快递单号', icon: 'none' }); return; }

    this.setData({ shipping: true });
    try {
      // 更新发货单状态
      await clouddb.updateShipment(shipRecord._id, {
        status: 'shipped',
        carrier: shipCarrier,
        trackingNo: shipTrackingNo.trim(),
        shippedAt: new Date().toISOString()
      });

      // 同步更新背包中对应的 inventoryItems 状态
      var inventoryIds = shipRecord.inventoryIds || [];
      for (var i = 0; i < inventoryIds.length; i++) {
        await clouddb.updateInventoryItem(inventoryIds[i], {
          status: 'shipped',
          carrier: shipCarrier,
          trackingNo: shipTrackingNo.trim()
        }).catch(function() {});
      }

      // 同时更新对应的 redeemRecords 状态
      var redeemRecordIds = shipRecord.redeemRecordIds || [];
      for (var j = 0; j < redeemRecordIds.length; j++) {
        await clouddb.updateRedeemRecord(redeemRecordIds[j], {
          status: 'shipped',
          carrier: shipCarrier,
          trackingNo: shipTrackingNo.trim(),
          shippedAt: new Date().toISOString()
        }).catch(function() {});
      }

      wx.showToast({ title: '已发货', icon: 'success' });
      this.setData({ showShipEditor: false });
      await this.loadAll();
    } catch (e) {
      console.error('[admin] confirmShip fail:', e);
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ shipping: false });
    }
  },

  copyTracking(e) {
    var trackingNo = e.currentTarget.dataset.tracking;
    if (trackingNo) {
      wx.setClipboardData({ data: trackingNo });
      wx.showToast({ title: '单号已复制', icon: 'none' });
    }
  },

  // ════════════════════════════════════════
  // 表单输入 & 保存（不变）
  // ════════════════════════════════════════

  onFormInput(e) {
    var obj = {}; obj['form.' + e.currentTarget.dataset.key] = e.detail.value; this.setData(obj);
  },

  onPickerChange(e) {
    var key = e.currentTarget.dataset.key;
    var idx = parseInt(e.detail.value);
    var obj = {};
    if (key === 'type') { obj['form.type'] = idx === 0 ? 'virtual' : 'physical'; }
    else if (key === 'virtualType') { obj['form.virtualType'] = idx === 0 ? 'card' : 'points'; }
    else { obj['form.' + key] = e.detail.value; }
    this.setData(obj);
  },

  onFormSwitch(e) { this.setData({ 'form.enabled': e.detail.value }); },

  async chooseImage() {
    var res = await new Promise(r => wx.chooseMedia({ count: 1, mediaType: ['image'], success: r, fail: () => r(null) }));
    if (!res) return;
    var tempFile = res.tempFiles[0].tempFilePath;
    try {
      var cloudPath = 'item-images/' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) + '.jpg';
      var uploadRes = await wx.cloud.uploadFile({ cloudPath: cloudPath, filePath: tempFile });
      this.setData({ 'form.image': uploadRes.fileID });
      wx.showToast({ title: '图片已上传', icon: 'success' });
    } catch (e) { wx.showToast({ title: '上传失败', icon: 'none' }); }
  },

  closeEditor() { this.setData({ showEditor: false }); },

  async saveForm() {
    var { form, editingId, saving } = this.data;
    if (saving) return;
    if (!form.name.trim()) { wx.showToast({ title: '请输入名称', icon: 'none' }); return; }

    this.setData({ saving: true });
    try {
      var itemData = {
        name: form.name.trim(), type: form.type,
        points: parseInt(form.points) || 0, stock: parseInt(form.stock) || 0,
        enabled: form.enabled, desc: form.desc.trim(), image: form.image.trim()
      };
      if (form.type === 'virtual') {
        itemData.virtualType = form.virtualType;
        itemData.virtualValue = parseInt(form.virtualValue) || 1;
      }
      if (editingId) {
        await clouddb.updateRedeemItem(editingId, itemData);
        wx.showToast({ title: '商品已更新', icon: 'success' });
      } else {
        await clouddb.addRedeemItem(itemData);
        wx.showToast({ title: '商品已添加', icon: 'success' });
      }
      this.setData({ showEditor: false });
      await this.loadAll();
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  stopBubble() {},

  async onPullDownRefresh() {
    try { await this.loadAll(); } finally { wx.stopPullDownRefresh(); }
  },

  onShareAppMessage() {
    return { title: '猫咪健康管家 - 记录宝贝的健康日常 🐱', path: '/pages/index/index' };
  },
});