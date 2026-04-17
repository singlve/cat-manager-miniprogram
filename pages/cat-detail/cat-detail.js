// pages/cat-detail/cat-detail.js
// 猫咪详情页：快速记录 + 健康时间轴
const clouddb = require('../../utils/clouddb.js');

function calcAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((new Date() - new Date(dateStr)) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 30) return `${diff}天前`;
  if (diff < 365) return `${Math.floor(diff / 30)}个月前`;
  return `${Math.floor(diff / 365)}年前`;
}

Page({
  data: {
    catId: '',
    cat: {},
    records: [],
    nowDate: ''
  },

  onLoad(options) {
    if (!options.id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1000);
      return;
    }
    this.setData({ catId: options.id, nowDate: new Date().toISOString().split('T')[0] });
    this.loadCat();
    this.loadRecords();
  },

  onShow() {
    if (this.data.catId) { this.loadCat(); this.loadRecords(); }
  },

  async loadCat() {
    const cat = await clouddb.getCatById(this.data.catId);
    if (cat) {
      // 云头像需转临时链接
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

  // 快速记录：点按钮 → 原生 picker 弹出 → 选日期确认后直接添加
  async onQuickRecord(e) {
    const type = e.currentTarget.dataset.type;
    const date = e.detail.value;
    if (!type || !date) return;

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

  goHealthRecords() { wx.navigateTo({ url: '/pages/health-records/health-records?catId=' + this.data.catId }); },
  goReminders()     { wx.navigateTo({ url: '/pages/reminder-add/reminder-add' }); },
  goEdit()          { wx.navigateTo({ url: '/pages/cat-edit/cat-edit?id=' + this.data.catId }); },

  deleteCat() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这只猫咪吗？相关记录也会一并删除',
      success: async res => {
        if (!res.confirm) return;
        await clouddb.deleteCat(this.data.catId);
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1000);
      }
    });
  }
});
