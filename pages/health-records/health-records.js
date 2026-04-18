// pages/health-records/health-records.js
// 健康记录列表页：查看所有猫咪的记录，支持按猫咪和类型筛选
const clouddb = require('../../utils/clouddb.js');

Page({
  data: {
    catId: '',           // 从猫咪详情页进入时传入，用于默认筛选
    cats: [],            // 所有猫咪列表
    catOptions: [],      // 筛选标签：[{key, label}]
    currentCat: 'all',   // 当前筛选的猫咪 key
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

  async onLoad(options) {
    this.setData({ catId: options.catId || '' });
    await this.loadCats();
    // 从猫咪详情页进入时，默认筛选该猫咪
    if (options.catId) {
      this.setData({ currentCat: options.catId });
    }
    this.loadRecords();
  },

  onShow() { this.loadRecords(); },

  // 加载所有猫咪，构建筛选标签
  async loadCats() {
    const cats = await clouddb.getAllCats();
    const catOptions = [{ key: 'all', label: '全部猫咪' }];
    cats.forEach(c => {
      catOptions.push({ key: c._id, label: c.name });
    });
    this.setData({ cats, catOptions });
  },

  async loadRecords() {
    // 加载所有健康记录
    const records = await clouddb.getRecords({});
    records.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 为每条记录关联猫咪信息
    const catsMap = {};
    this.data.cats.forEach(c => { catsMap[c._id] = c; });
    const withCat = records.map(r => ({
      ...r,
      _catName: catsMap[r.catId] ? catsMap[r.catId].name : '未知猫咪',
      _catAvatar: catsMap[r.catId] ? (catsMap[r.catId]._displayAvatar || catsMap[r.catId].avatar || '') : ''
    }));

    this.setData({ records: withCat });
    this.applyFilter();
  },

  // 切换猫咪筛选
  setCatFilter(e) {
    this.setData({ currentCat: e.currentTarget.dataset.cat });
    this.applyFilter();
  },

  // 切换类型筛选
  setFilter(e) {
    this.setData({ currentFilter: e.currentTarget.dataset.filter });
    this.applyFilter();
  },

  applyFilter() {
    const { records, currentCat, currentFilter } = this.data;
    let filtered = records;
    if (currentCat !== 'all') {
      filtered = filtered.filter(r => r.catId === currentCat);
    }
    if (currentFilter !== 'all') {
      filtered = filtered.filter(r => r.type === currentFilter);
    }
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

    // 校验：日期不能早于宠物生日
    const record = this.data.records.find(r => r._id === editId);
    if (record && record.catId) {
      const cat = await clouddb.getCatById(record.catId);
      if (cat && cat.birthday && editDate < cat.birthday) {
        wx.showToast({ title: '记录日期不能早于宠物生日', icon: 'none' });
        return;
      }
    }

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
