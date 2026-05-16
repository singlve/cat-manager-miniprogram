const clouddb = require('../../utils/clouddb.js');
const { isAdmin } = require('../../utils/util.js');

Page({
  data: { isAdmin: false, list: [], content: '', posting: false, loading: true },

  onLoad() {
    if (!isAdmin()) { wx.showToast({ title: '无权访问', icon: 'none' }); setTimeout(() => wx.navigateBack(), 1500); return; }
    this.setData({ isAdmin: true });
    this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    var res = await clouddb.callAnnouncementAdmin('list');
    if (res.code === 0) this.setData({ list: res.data || [], loading: false });
    else this.setData({ loading: false });
  },

  onContentInput(e) { this.setData({ content: e.detail.value }); },

  async doPost() {
    var c = (this.data.content || '').trim();
    if (!c) { wx.showToast({ title: '请输入公告内容', icon: 'none' }); return; }
    this.setData({ posting: true });
    var res = await clouddb.callAnnouncementAdmin('add', { content: c });
    if (res.code === 0) {
      wx.showToast({ title: '发布成功', icon: 'success' });
      this.setData({ content: '' });
      this.loadList();
    } else {
      wx.showToast({ title: res.msg || '失败', icon: 'none' });
    }
    this.setData({ posting: false });
  },

  async toggle(e) {
    var id = e.currentTarget.dataset.id;
    var res = await clouddb.callAnnouncementAdmin('toggle', { id: id });
    if (res.code === 0) {
      wx.showToast({ title: res.isActive ? '已启用' : '已停用', icon: 'success' });
      this.loadList();
    }
  },

  async doDelete(e) {
    var id = e.currentTarget.dataset.id;
    var ok = await new Promise(r => wx.showModal({ title: '确认删除', content: '删除后无法恢复', success: s => r(s.confirm) }));
    if (!ok) return;
    var res = await clouddb.callAnnouncementAdmin('delete', { id: id });
    if (res.code === 0) { wx.showToast({ title: '已删除', icon: 'success' }); this.loadList(); }
  },

  stopBubble() {}
});
