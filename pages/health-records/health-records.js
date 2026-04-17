// pages/health-records/health-records.js
// 健康记录列表页：查看/筛选/编辑/删除
const clouddb = require('../../utils/clouddb.js');

Page({
  data: {
    catId: '',
    catName: '',
    records: [],
    filteredRecords: [],
    currentFilter: 'all',
    filterOptions: [
      { key: 'all',     label: '全部' },
      { key: 'bath',    label: '🛁 洗澡' },
      { key: 'deworm',  label: '💊 驱虫' },
      { key: 'vaccine', label: '💉 免疫' },
      { key: 'checkup', label: '🩺 体检' }
    ],
    showEditModal: false,
    editId: '',
    editType: '',
    editDate: '',
    editNote: ''
  },

  onLoad(options) {
    this.setData({ catId: options.catId });
    this.loadCatName();
    this.loadRecords();
  },

  onShow() { this.loadRecords(); },

  async loadCatName() {
    const cat = await clouddb.getCatById(this.data.catId);
    if (cat) this.setData({ catName: cat.name });
  },

  async loadRecords() {
    const records = await clouddb.getRecords({ catId: this.data.catId });
    records.sort((a, b) => new Date(b.date) - new Date(a.date));
    this.setData({ records });
    this.applyFilter();
  },

  setFilter(e) {
    this.setData({ currentFilter: e.currentTarget.dataset.filter });
    this.applyFilter();
  },

  applyFilter() {
    const { records, currentFilter } = this.data;
    const filtered = currentFilter === 'all' ? records : records.filter(r => r.type === currentFilter);
    this.setData({ filteredRecords: filtered });
  },

  goBack() { wx.navigateBack(); },

  // ─── 编辑 ───
  openEdit(e) {
    const record = this.data.records.find(r => r._id === e.currentTarget.dataset.id);
    if (!record) return;
    this.setData({
      showEditModal: true,
      editId: record._id,
      editType: record.type,
      editDate: record.date,
      editNote: record.note || ''
    });
  },

  onEditDateChange(e) { this.setData({ editDate: e.detail.value }); },
  onEditNoteInput(e)  { this.setData({ editNote: e.detail.value }); },
  onEditTypeChange(e) {
    this.setData({ editType: ['bath', 'deworm', 'vaccine', 'checkup'][e.detail.value] });
  },

  async saveEdit() {
    const { editId, editDate, editNote, editType } = this.data;
    if (!editDate) { wx.showToast({ title: '请选择日期', icon: 'none' }); return; }
    await clouddb.updateRecord(editId, { date: editDate, note: editNote, type: editType });
    this.setData({ showEditModal: false });
    this.loadRecords();
    wx.showToast({ title: '修改成功', icon: 'success' });
  },

  cancelEdit() { this.setData({ showEditModal: false }); },

  async deleteRecord(e) {
    const confirmed = await new Promise(r =>
      wx.showModal({ title: '确认删除', content: '确定要删除这条记录吗？', success: res => r(res.confirm) })
    );
    if (!confirmed) return;
    await clouddb.deleteRecord(e.currentTarget.dataset.id);
    this.loadRecords();
    wx.showToast({ title: '已删除', icon: 'success' });
  }
});
