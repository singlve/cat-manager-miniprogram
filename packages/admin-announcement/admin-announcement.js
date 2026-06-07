const clouddb = require('../../utils/clouddb.js');
const { isAdmin } = require('../../utils/util.js');

const { syncPageTheme } = require('../../utils/themes.js');

Page({
  onShow() { syncPageTheme(this); },

  data: { isAdmin: false, list: [], content: '', posting: false, loading: true, loadError: false },

  onLoad() {
    if (!isAdmin()) { wx.showToast({ title: '无权访问', icon: 'none' }); setTimeout(() => wx.navigateBack(), 1500); return; }
    this.setData({ isAdmin: true });
    this.loadList();
  },

  async loadList() {
    this.setData({ loading: true, loadError: false });
    try {
      var res = await clouddb.callAnnouncementAdmin('list');
      if (res.code !== 0) throw new Error(res.msg || '公告加载失败');
      this.setData({ list: res.data || [], loading: false, loadError: false });
    } catch (e) {
      console.error('[admin-announcement] load fail:', e);
      this.setData({ list: [], loading: false, loadError: true });
    }
  },

  retryLoad() { this.loadList(); },

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
    var first = await new Promise(r => wx.showModal({
      title: '删除公告',
      content: '删除后公告将无法恢复。',
      confirmText: '继续',
      confirmColor: '#F36B6B',
      success: s => r(s.confirm)
    }));
    if (!first) return;
    var second = await new Promise(r => wx.showModal({
      title: '再次确认删除',
      content: '请确认不再需要这条公告。删除后首页也不会再展示它。',
      confirmText: '确认删除',
      confirmColor: '#F36B6B',
      success: s => r(s.confirm)
    }));
    if (!second) return;
    var res = await clouddb.callAnnouncementAdmin('delete', { id: id });
    if (res.code === 0) { wx.showToast({ title: '已删除', icon: 'success' }); this.loadList(); }
  },

  stopBubble() {}
});
