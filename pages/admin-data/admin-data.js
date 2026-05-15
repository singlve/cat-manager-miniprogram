// pages/admin-data/admin-data.js
// 管理员：搜索和编辑用户数据
const clouddb = require('../../utils/clouddb.js');
const { isAdmin } = require('../../utils/util.js');

const SEARCH_TYPES = ['nickname', 'phone'];
const SEARCH_LABELS = ['昵称', '手机号'];

// 可编辑字段配置
const EDIT_FIELDS = [
  { key: 'nickname',        label: '昵称',         type: 'text' },
  { key: 'lastCheckInDate', label: '上次签到日期',    type: 'text' },
  { key: 'checkInStreak',   label: '连续签到天数',    type: 'number' },
  { key: 'totalCheckIns',   label: '累积签到天数',    type: 'number' },
  { key: 'totalPoints',     label: '积分',           type: 'number' },
  { key: 'makeUpCards',     label: '补签卡数量',      type: 'number' },
  { key: 'lotteryUsed',     label: '抽奖已用次数',    type: 'number' },
  { key: 'makeUpDates',     label: '补签日期(逗号分隔)', type: 'text' },
  { key: 'drawnMilestones', label: '已抽里程碑(逗号分隔)', type: 'text' },
];

Page({
  data: {
    isAdmin: false,
    searchType: 0,
    searchTypes: SEARCH_TYPES,
    searchLabels: SEARCH_LABELS,
    keyword: '',
    users: [],
    loading: false,
    searched: false,
    errorMsg: '',

    showEditor: false,
    editingUser: null,
    editValues: {},
    saving: false,

    EDIT_FIELDS,
    // 快速操作
    showQuickActions: false,
  },

  async onLoad() {
    const admin = isAdmin();
    this.setData({ isAdmin: admin });
    if (!admin) {
      wx.showToast({ title: '无权访问', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  onSearchTypeChange(e) {
    this.setData({ searchType: parseInt(e.detail.value) });
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  async doSearch() {
    const { searchType, keyword } = this.data;
    if (!keyword.trim()) {
      wx.showToast({ title: '请输入搜索关键词', icon: 'none' });
      return;
    }

    this.setData({ loading: true, searched: false, errorMsg: '', users: [] });

    try {
      const type = SEARCH_TYPES[searchType];
      const users = await clouddb.searchUsers(type, keyword.trim());
      this.setData({ users, searched: true, loading: false });
      if (users.length === 0) {
        this.setData({ errorMsg: '未找到匹配用户' });
      }
    } catch (e) {
      console.error('[admin-data] search error:', e);
      this.setData({ loading: false, searched: true, errorMsg: e.message || '搜索失败' });
    }
  },

  // ─── 编辑 ───
  openEditor(e) {
    const user = e.currentTarget.dataset.user;
    const editValues = {};
    EDIT_FIELDS.forEach(f => {
      let val = user[f.key];
      if (Array.isArray(val)) val = val.join(',');
      else if (val === undefined || val === null) val = '';
      else val = String(val);
      editValues[f.key] = val;
    });
    this.setData({ showEditor: true, editingUser: user, editValues });
  },

  closeEditor() {
    this.setData({ showEditor: false, editingUser: null });
  },

  onFieldInput(e) {
    const key = e.currentTarget.dataset.key;
    const val = e.detail.value;
    this.setData({ ['editValues.' + key]: val });
  },

  async saveEdit() {
    if (this.data.saving) return;

    const { editingUser, editValues } = this.data;
    const updates = {};

    EDIT_FIELDS.forEach(f => {
      const raw = (editValues[f.key] || '').trim();
      if (f.type === 'number') {
        const n = parseInt(raw, 10);
        if (!isNaN(n)) updates[f.key] = n;
      } else if (f.key === 'makeUpDates' || f.key === 'drawnMilestones') {
        updates[f.key] = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
      } else {
        updates[f.key] = raw;
      }
    });

    if (Object.keys(updates).length === 0) {
      wx.showToast({ title: '没有修改', icon: 'none' });
      return;
    }

    this.setData({ saving: true });

    try {
      await clouddb.adminUpdateUser(editingUser._id, updates);
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.closeEditor();
      // 刷新列表
      this.doSearch();
    } catch (e) {
      console.error('[admin-data] saveEdit error:', e);
      wx.showToast({ title: '保存失败: ' + (e.message || '未知错误'), icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  stopBubble() {},
});
