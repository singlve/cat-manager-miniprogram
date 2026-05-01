// pages/cat-detail/cat-detail.js
// 猫咪详情页：快速记录 + 健康时间轴
const clouddb = require('../../utils/clouddb.js');
const { calcAgo } = require('../../utils/util.js');

// ─── Demo 数据 ───
const DEMO_CATS = {
  'demo_1': { _id: 'demo_1', name: '橘座', breed: '中华田园猫', gender: 'male', birthday: '2023-03-15', adoptedDate: '2023-03-15', note: '能吃能睡，体重管理中', avatar: '', _displayAvatar: '', status: 'with_me' },
  'demo_2': { _id: 'demo_2', name: '雪球', breed: '布偶猫', gender: 'female', birthday: '2024-01-20', adoptedDate: '2024-01-20', note: '', avatar: '', _displayAvatar: '', status: 'with_me' }
};

const DEMO_RECORDS = {
  'demo_1': [
    { _id: 'demo_r1', catId: 'demo_1', type: 'deworm',   date: '2026-04-10', note: '体内驱虫',        _ago: '13天前' },
    { _id: 'demo_r2', catId: 'demo_1', type: 'checkup',  date: '2026-03-20', note: '年度体检正常',    _ago: '34天前' },
    { _id: 'demo_r3', catId: 'demo_1', type: 'bath',     date: '2026-03-01', note: '',                _ago: '53天前' }
  ],
  'demo_2': [
    { _id: 'demo_r4', catId: 'demo_2', type: 'vaccine',  date: '2026-04-15', note: '猫三联第三针',    _ago: '8天前' },
    { _id: 'demo_r5', catId: 'demo_2', type: 'bath',     date: '2026-03-28', note: '',                _ago: '26天前' }
  ]
};

Page({
  data: {
    catId: '', cat: {}, records: [], nowDate: '', isDemo: false,
    weightRecords: [], latestWeight: null,
    showWeightModal: false, deleting: false,
    weightDate: new Date().toISOString().split('T')[0],
    weightTime: '',
    weightValue: '', weightNote: ''
  },

  onLoad(options) {
    if (!options.id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 1000);
      return;
    }
    const isDemo = options.id && options.id.startsWith('demo_');
    this.setData({ catId: options.id, nowDate: new Date().toISOString().split('T')[0], isDemo });
    if (isDemo) {
      this.setData({ cat: DEMO_CATS[options.id] || {}, records: DEMO_RECORDS[options.id] || [], weightRecords: [], latestWeight: null });
    } else {
      this.loadCat();
      this.loadRecords();
      this.loadWeightRecords();
    }
  },

  onShow() {
    if (this.data.catId && !this.data.isDemo) { this.loadCat(); this.loadRecords(); this.loadWeightRecords(); }
  },

  async loadCat() {
    const cat = await clouddb.getCatById(this.data.catId);
    if (cat) {
      if (cat.avatar && cat.avatar.startsWith('cloud://')) {
        cat._displayAvatar = await clouddb.getAvatarUrl(cat.avatar);
      } else {
        cat._displayAvatar = cat.avatar;
      }
      this.setData({ cat });
    }
  },

  async loadRecords() {
    const records = await clouddb.getRecords({ catId: this.data.catId });
    records.sort((a, b) => new Date(b.date) - new Date(a.date));
    const withAgo = records.map(r => ({ ...r, _ago: calcAgo(r.date) }));
    this.setData({ records: withAgo });
  },

  // ─── 体重记录 ───
  async loadWeightRecords() {
    const records = await clouddb.getWeightRecords({ catId: this.data.catId });
    records.sort((a, b) => new Date(b.date) - new Date(a.date));
    const latestWeight = records.length > 0 ? records[0].weight : null;
    this.setData({ weightRecords: records, latestWeight });
  },

  openWeightModal() {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    if (this.data.cat.status === 'passed_away') {
      wx.showToast({ title: '去喵星的猫咪不支持记录', icon: 'none' }); return;
    }
    const now = new Date();
    this.setData({
      showWeightModal: true,
      weightDate: now.toISOString().split('T')[0],
      weightTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      weightValue: '',
      weightNote: ''
    });
  },

  closeWeightModal() {
    this.setData({ showWeightModal: false });
  },

  onWeightDateChange(e)  { this.setData({ weightDate: e.detail.value }); },
  onWeightTimeChange(e)  { this.setData({ weightTime: e.detail.value }); },
  onWeightInput(e)       { this.setData({ weightValue: e.detail.value }); },
  onWeightNoteInput(e)   { this.setData({ weightNote: e.detail.value }); },

  async saveWeightRecord() {
    const { weightDate, weightTime, weightValue, weightNote } = this.data;
    const w = parseFloat(weightValue);
    if (!weightDate) { wx.showToast({ title: '请选择日期', icon: 'none' }); return; }
    if (isNaN(w) || w <= 0) { wx.showToast({ title: '请输入有效体重(kg)', icon: 'none' }); return; }
    if (w > 30) { wx.showToast({ title: '体重数值过大，请检查', icon: 'none' }); return; }

    // 日期不能早于猫咪生日（按日期部分比较即可）
    if (this.data.cat.birthday && weightDate < this.data.cat.birthday) {
      wx.showToast({ title: '记录日期不能早于猫咪生日', icon: 'none' }); return;
    }

    const fullDate = `${weightDate} ${weightTime || '00:00'}:00`;

    wx.showLoading({ title: '保存中...' });
    await clouddb.addWeightRecord({
      catId: this.data.catId,
      date: fullDate,
      weight: w,
      note: weightNote || ''
    });
    wx.hideLoading();
    this.setData({ showWeightModal: false });
    this.loadWeightRecords();
    wx.showToast({ title: '体重已记录', icon: 'success' });
  },

  goWeightRecords() {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    wx.navigateTo({ url: '/pages/weight-records/weight-records?catId=' + this.data.catId });
  },

  // 统一登录提示
  _promptLogin() {
    wx.showModal({
      title: '需要登录',
      content: '该操作需要登录后才能完成，是否现在登录？',
      confirmText: '去登录',
      cancelText: '稍后再说',
      success: res => { if (res.confirm) wx.navigateTo({ url: '/pages/login/login' }); }
    });
  },

  // 快速记录：demo 猫或未登录时提示登录
  async onQuickRecord(e) {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    if (this.data.cat.status === 'passed_away') {
      wx.showToast({ title: '去喵星的猫咪不支持记录', icon: 'none' }); return;
    }

    const type = e.currentTarget.dataset.type;
    const date = e.detail.value;
    if (!type || !date) return;

    if (this.data.cat.birthday && date < this.data.cat.birthday) {
      wx.showToast({ title: '记录日期不能早于宠物生日', icon: 'none' });
      return;
    }

    const newRecord = {
      _id: 'rec_' + Date.now(),
      catId: this.data.catId,
      type: type,
      date: date,
      note: ''
    };

    await clouddb.addRecord(newRecord);
    this.loadRecords();

    const typeLabel = { bath: '洗澡', deworm: '驱虫', vaccine: '免疫', checkup: '体检' }[type];
    wx.showToast({ title: typeLabel + '已记录', icon: 'success' });
  },

  goHealthRecords() {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    wx.navigateTo({ url: '/pages/health-records/health-records?catId=' + this.data.catId });
  },

  goReminders() {
    if (this.data.cat && this.data.cat.status === 'passed_away') {
      wx.showToast({ title: '去喵星的猫咪不需要提醒了', icon: 'none' }); return;
    }
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    wx.navigateTo({ url: '/pages/reminder-add/reminder-add' });
  },

  goEdit() {
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    wx.navigateTo({ url: '/pages/cat-edit/cat-edit?id=' + this.data.catId });
  },

  deleteCat() {
    if (this.data.deleting) return;
    const app = getApp();
    if (!app.isLoggedIn()) { this._promptLogin(); return; }
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这只猫咪吗？相关记录也会一并删除',
      success: async res => {
        if (!res.confirm) return;
        this.setData({ deleting: true });
        wx.showLoading({ title: '删除中...' });
        await clouddb.deleteCat(this.data.catId);
        wx.hideLoading();
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => wx.switchTab({ url: '/pages/cat-list/cat-list' }), 1000);
      }
    });
  }
});
