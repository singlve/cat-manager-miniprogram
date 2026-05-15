// pages/shipping-address/shipping-address.js
const app = getApp();
const clouddb = require('../../utils/clouddb.js');

Page({
  data: {
    addresses: [],
    loading: true,

    // 编辑弹窗
    showEditor: false,
    editingId: null,
    formName: '',
    formPhone: '',
    formProvince: '',
    formCity: '',
    formDistrict: '',
    formRegion: [],
    formDetail: '',
    saving: false
  },

  async onShow() {
    await this.loadAddresses();
  },

  async loadAddresses() {
    this.setData({ loading: true });
    try {
      const addresses = await clouddb.getShippingAddresses();
      this.setData({ addresses: addresses || [], loading: false });
    } catch (e) {
      console.error('[shipping-address] load fail:', e);
      this.setData({ addresses: [], loading: false });
    }
  },

  // ── 打开添加弹窗 ──
  addAddress() {
    this.setData({
      showEditor: true,
      editingId: null,
      formName: '',
      formPhone: '',
      formProvince: '',
      formCity: '',
      formDistrict: '',
      formRegion: [],
      formDetail: '',
      saving: false
    });
  },

  // ── 打开编辑弹窗 ──
  editAddress(e) {
    const addr = e.currentTarget.dataset.address;
    this.setData({
      showEditor: true,
      editingId: addr._id,
      formName: addr.name || '',
      formPhone: addr.phone || '',
      formProvince: addr.province || '',
      formCity: addr.city || '',
      formDistrict: addr.district || '',
      formRegion: addr.province ? [addr.province, addr.city, addr.district] : [],
      formDetail: addr.detail || '',
      saving: false
    });
  },

  // ── 关闭弹窗 ──
  closeEditor() {
    this.setData({ showEditor: false });
  },

  // ── 表单输入绑定 ──
  onNameInput(e) { this.setData({ formName: e.detail.value }); },
  onPhoneInput(e) { this.setData({ formPhone: e.detail.value }); },
  onRegionChange(e) {
    const val = e.detail.value;
    const codes = e.detail.code;
    this.setData({
      formRegion: val,
      formRegionCode: codes,
      formProvince: val[0] || '',
      formCity: val[1] || '',
      formDistrict: val[2] || ''
    });
  },
  onDetailInput(e) { this.setData({ formDetail: e.detail.value }); },

  // ── 保存地址 ──
  async saveAddress() {
    const { formName, formPhone, formProvince, formCity, formDistrict, formDetail, editingId, saving } = this.data;

    if (saving) return;
    if (!formName.trim()) { wx.showToast({ title: '请输入收货人姓名', icon: 'none' }); return; }
    if (!/^1[3-9]\d{9}$/.test(formPhone.trim())) { wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return; }
    if (!formProvince.trim() || !formCity.trim() || !formDistrict.trim()) { wx.showToast({ title: '请完整填写省市区', icon: 'none' }); return; }
    if (!formDetail.trim()) { wx.showToast({ title: '请输入详细地址', icon: 'none' }); return; }

    this.setData({ saving: true });

    const addrData = {
      name: formName.trim(),
      phone: formPhone.trim(),
      province: formProvince.trim(),
      city: formCity.trim(),
      district: formDistrict.trim(),
      detail: formDetail.trim()
    };

    try {
      if (editingId) {
        await clouddb.updateShippingAddress(editingId, addrData);
        wx.showToast({ title: '地址已更新', icon: 'success' });
      } else {
        // 第一个地址自动设为默认
        const existing = this.data.addresses;
        if (!existing || existing.length === 0) {
          addrData.isDefault = true;
        }
        await clouddb.addShippingAddress(addrData);
        wx.showToast({ title: '地址已添加', icon: 'success' });
      }
      this.setData({ showEditor: false });
      await this.loadAddresses();
    } catch (e) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  // ── 删除地址 ──
  async deleteAddress(e) {
    const id = e.currentTarget.dataset.id;
    const res = await new Promise(r => wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复',
      confirmColor: '#e74c3c',
      success: r
    }));
    if (!res.confirm) return;

    try {
      await clouddb.deleteShippingAddress(id);
      wx.showToast({ title: '已删除', icon: 'success' });
      await this.loadAddresses();
    } catch (e) {
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  // ── 设为默认 ──
  async setDefault(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await clouddb.setDefaultAddress(id);
      wx.showToast({ title: '已设为默认地址', icon: 'success' });
      await this.loadAddresses();
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  stopBubble() {},

  onShareAppMessage() {
    return { title: '猫咪健康管家 - 记录宝贝的健康日常 🐱', path: '/pages/index/index' };
  },
});