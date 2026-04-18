// pages/reminder-add/reminder-add.js
// 添加/编辑提醒页
const clouddb = require('../../utils/clouddb.js');

const TYPE_OPTIONS = [
  { key: 'bath',    label: '洗澡',     icon: '🛁' },
  { key: 'deworm',  label: '驱虫',     icon: '💊' },
  { key: 'vaccine', label: '免疫',     icon: '💉' },
  { key: 'checkup', label: '体检',     icon: '🩺' },
  { key: 'claw',    label: '修剪指甲', icon: '✂️' },
  { key: 'other',   label: '其他',     icon: '📌' }
];

const PRESET_INTERVALS = [7, 14, 30, 60, 90, 180];

Page({
  data: {
    isEdit: false,
    reminderId: '',
    cats: [],
    selectedCatId: '',
    selectedCatName: '',
    type: 'bath',
    typeLabel: '洗澡',
    typeOptions: TYPE_OPTIONS,
    lastDate: '',
    intervalDays: 30,
    intervalDaysRaw: '30',
    presetIntervals: PRESET_INTERVALS,
    note: '',
    nextPreviewDate: ''
  },

  async onLoad(options) {
    await this.loadCats();
    if (options.id) {
      this.setData({ isEdit: true, reminderId: options.id });
      await this.loadReminder(options.id);
    } else {
      const cats = this.data.cats;
      if (cats.length > 0) {
        this.setData({ selectedCatId: cats[0]._id, selectedCatName: cats[0].name });
        await this.loadLastDate(cats[0]._id, 'bath');
      }
    }
    this.updateNextPreview();
  },

  async loadCats() {
    const cats = await clouddb.getCats();
    this.setData({ cats });
  },

  async loadReminder(id) {
    const reminders = await clouddb.getReminders();
    const reminder = reminders.find(r => r._id === id);
    if (!reminder) return;
    const cat = this.data.cats.find(c => c._id === reminder.catId);
    const typeOption = TYPE_OPTIONS.find(t => t.key === reminder.type);
    this.setData({
      selectedCatId: reminder.catId,
      selectedCatName: cat ? cat.name : (reminder.catName || ''),
      type: reminder.type,
      typeLabel: typeOption ? typeOption.label : '洗澡',
      lastDate: reminder.lastDate,
      intervalDays: reminder.intervalDays,
      intervalDaysRaw: String(reminder.intervalDays),
      note: reminder.note || ''
    });
  },

  // ─── 切换猫咪时：自动查找该猫咪最近一次「当前类型」的健康记录时间 ───
  async catChange(e) {
    const cat = this.data.cats[parseInt(e.detail.value)];
    if (!cat) return;
    this.setData({ selectedCatId: cat._id, selectedCatName: cat.name });
    await this.loadLastDate(cat._id, this.data.type);
    this.updateNextPreview();
  },

  // ─── 切换提醒类型时：自动查找该猫咪最近一次「新类型」的健康记录时间 ───
  typeChangeTap(e) {
    const type = e.currentTarget.dataset.type;
    const option = TYPE_OPTIONS.find(t => t.key === type);
    this.setData({ type, typeLabel: option ? option.label : '其他' });
    this.loadLastDate(this.data.selectedCatId, type);
    this.updateNextPreview();
  },

  // ─── 从健康记录中查找最近一次该类型的时间 ───
  async loadLastDate(catId, type) {
    if (!catId) return;
    const records = await clouddb.getRecords({ catId });
    // 找同类型的最近一条记录（按时间倒序取第一条）
    const matched = records
      .filter(r => r.type === type)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (matched.length > 0) {
      this.setData({ lastDate: matched[0].date });
    } else {
      this.setData({ lastDate: '' });
    }
  },

  lastDateChange(e) { this.setData({ lastDate: e.detail.value }); this.updateNextPreview(); },

  intervalInput(e) {
    const val = e.detail.value;
    // 允许临时清空（显示 placeholder），保存/预览时才做边界校验
    this.setData({ intervalDaysRaw: val });
    this.updateNextPreview();
  },

  setInterval(e) {
    const days = parseInt(e.currentTarget.dataset.days);
    this.setData({ intervalDays: days, intervalDaysRaw: String(days) });
    this.updateNextPreview();
  },

  _getIntervalDays() {
    const raw = this.data.intervalDaysRaw;
    if (raw === '' || raw === undefined) return 30;
    return Math.min(365, Math.max(1, parseInt(raw) || 30));
  },

  noteInput(e) { this.setData({ note: e.detail.value }); },

  updateNextPreview() {
    const { lastDate, intervalDays } = this.data;
    if (!lastDate || !intervalDays) { this.setData({ nextPreviewDate: '' }); return; }
    const d = new Date(lastDate);
    d.setDate(d.getDate() + intervalDays);
    this.setData({ nextPreviewDate: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` });
  },

  async save() {
    const { isEdit, reminderId, selectedCatId, selectedCatName, type, lastDate, note } = this.data;
    const intervalDays = this._getIntervalDays();
    if (!selectedCatId) { wx.showToast({ title: '请先添加猫咪', icon: 'none' }); return; }
    if (!lastDate) { wx.showToast({ title: '请选择上次时间', icon: 'none' }); return; }

    wx.showLoading({ title: '保存中...' });
    const data = { catId: selectedCatId, catName: selectedCatName, type, lastDate, intervalDays, note };

    if (isEdit) {
      await clouddb.updateReminder(reminderId, data);
    } else {
      data._id = 'rem_' + Date.now();
      await clouddb.addReminder(data);
    }

    wx.hideLoading();
    wx.showToast({ title: '保存成功', icon: 'success' });
    setTimeout(() => wx.navigateBack(), 1000);
  }
});
