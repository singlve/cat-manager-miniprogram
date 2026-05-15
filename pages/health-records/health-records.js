// pages/health-records/health-records.js
// 健康记录列表页：查看所有宠物的记录，支持按宠物和类型筛选
const clouddb = require('../../utils/clouddb.js');

Page({
  data: {
    isOnline: true,
    catId: '',           // 从宠物详情页进入时传入，用于默认筛选
    cats: [],            // 所有宠物列表
    catOptions: [],      // 筛选标签：[{key, label}]
    currentCat: 'all',   // 当前筛选的宠物 key
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
    // 分页
    recordsPage: 1,
    recordsPageSize: 20,
    hasMoreRecords: false,
    recordsLoading: false,
    showEditModal: false,
    editId: '',
    editType: '',
    editDate: '',
    editNote: ''
  },

  async onLoad(options) {
    this.setData({ catId: options.catId || '' });
    await this.loadCats();
    // 从宠物详情页进入时，默认筛选该宠物
    if (options.catId) {
      this.setData({ currentCat: options.catId });
    }
    this.loadRecords();
  },

  onShow() {
    this.setData({ isOnline: getApp().globalData.isOnline });
    this.loadRecords();
  },

  // 加载所有宠物，构建筛选标签
  async loadCats() {
    const cats = await clouddb.getAllCats();
    const catOptions = [{ key: 'all', label: '全部宠物' }];
    cats.forEach(c => {
      catOptions.push({ key: c._id, label: c.name });
    });
    this.setData({ cats, catOptions });
  },

  // 加载健康记录（resetPage=true 从头加载，false 加载更多）
  async loadRecords(resetPage) {
    if (resetPage !== false) {
      this.setData({ recordsPage: 1, hasMoreRecords: true, records: [], filteredRecords: [] });
    }
    if (this.data.recordsLoading) return;
    this.setData({ recordsLoading: true });

    try {
      const page = this.data.recordsPage;
      const pageSize = this.data.recordsPageSize;
      const skip = (page - 1) * pageSize;

      const newRecords = await clouddb.getRecords({}, { limit: pageSize, skip: skip });
      newRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

      // 为每条记录关联宠物信息
      const catsMap = {};
      this.data.cats.forEach(c => { catsMap[c._id] = c; });
      const withCat = newRecords.map(function(r) { return Object.assign({}, r, {
        _catName: catsMap[r.catId] ? catsMap[r.catId].name : '未知宠物',
        _catAvatar: catsMap[r.catId] ? (catsMap[r.catId]._displayAvatar || catsMap[r.catId].avatar || '') : ''
      }); });

      const allRecords = page === 1 ? withCat : [].concat(this.data.records, withCat);
      const hasMore = newRecords.length >= pageSize;

      this.setData({
        records: allRecords,
        recordsPage: page + 1,
        hasMoreRecords: hasMore,
        recordsLoading: false,
      }, () => { this.applyFilter(); });
    } catch (e) {
      console.error('[health-records] loadRecords error:', e);
      this.setData({ recordsLoading: false });
    }
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.hasMoreRecords && !this.data.recordsLoading) {
      this.loadRecords(false);
    }
  },

  // 切换宠物筛选
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
  },

  async onPullDownRefresh() {
    try { await this.loadRecords(true); } finally { wx.stopPullDownRefresh(); }
  },

  onShareAppMessage() {
    const name = this.data.catName || '宝贝';
    return { title: name + ' - 猫咪健康管家 🐱', path: '/pages/health-records/health-records?catId=' + (this.data.catId || '') };
  },
});