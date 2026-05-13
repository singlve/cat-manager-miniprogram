// pages/reminders/reminders.js
// 提醒列表页：逾期/即将/未来分组 + 状态筛选
const clouddb = require('../../utils/clouddb.js');

function calcNextDate(lastDate, intervalDays) {
  if (!lastDate || !intervalDays) return null;
  const d = new Date(lastDate);
  d.setDate(d.getDate() + intervalDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

// ── Demo 数据（未登录时展示） ──
function getDemoReminders() {
  const today = new Date();
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const overdueLast = new Date(today);
  overdueLast.setDate(overdueLast.getDate() - 35);
  const overdueNext = calcNextDate(fmt(overdueLast), 30);

  const upcomingLast = new Date(today);
  upcomingLast.setDate(upcomingLast.getDate() - 27);
  const upcomingNext = calcNextDate(fmt(upcomingLast), 30);

  const futureLast = new Date(today);
  futureLast.setDate(futureLast.getDate() - 10);
  const futureNext = calcNextDate(fmt(futureLast), 30);

  const raw = [
    { _id: 'demo_1', catId: 'demo_1', catName: '橘座', type: 'deworm', lastDate: fmt(overdueLast), intervalDays: 30, nextDate: overdueNext, daysUntil: getDaysUntil(overdueNext), isOverdue: true, isUrgent: false, note: '使用体内驱虫药', completedAt: null },
    { _id: 'demo_2', catId: 'demo_2', catName: '雪球', type: 'vaccine', lastDate: fmt(upcomingLast), intervalDays: 30, nextDate: upcomingNext, daysUntil: getDaysUntil(upcomingNext), isOverdue: false, isUrgent: true, note: '猫三联疫苗', completedAt: null },
    { _id: 'demo_3', catId: 'demo_1', catName: '橘座', type: 'bath', lastDate: fmt(futureLast), intervalDays: 30, nextDate: futureNext, daysUntil: getDaysUntil(futureNext), isOverdue: false, isUrgent: false, note: '', completedAt: null }
  ];

  return {
    allReminders: raw
  };
}

Page({
  data: {
    overdueList: [],
    upcomingList: [],
    futureList: [],
    hasData: false,       // 当前是否有数据展示
    overdueCount: 0,
    loading: false,
    isLoggedIn: false,
    catTabs: [],
    catFilter: 'all',
    statusFilter: 'active', // 'active'|'overdue'|'completed'|'all'
    allReminders: []
  },

  onShow() {
    const app = getApp();
    this.setData({ isLoggedIn: app.isLoggedIn() });
    if (app.isLoggedIn()) {
      this.loadData();
    } else {
      const demo = getDemoReminders();
      this.setData({
        allReminders: demo.allReminders,
        catTabs: [{ _id: 'demo_1', name: '橘座' }, { _id: 'demo_2', name: '雪球' }],
        catFilter: 'all',
        loading: false
      });
      this._applyFilters();
    }
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [cats, reminders] = await Promise.all([
        clouddb.getCats(),
        clouddb.getReminders()
      ]);

      const catNameMap = {};
      const catTabs = [];
      const aliveCatIds = new Set();
      cats.forEach(c => {
        catNameMap[c._id] = c.name;
        if (c.status !== 'passed_away') {
          catTabs.push({ _id: c._id, name: c.name });
          aliveCatIds.add(c._id);
        }
      });

      const all = reminders
        .filter(r => aliveCatIds.has(r.catId))
        .map(r => {
          const next = calcNextDate(r.lastDate, r.intervalDays);
          const days = getDaysUntil(next);
          return {
            ...r,
            catName: catNameMap[r.catId] || r.catName || '',
            nextDate: next || '未设置',
            daysUntil: days,
            isOverdue: days !== null && days < 0,
            isUrgent: days !== null && days >= 0 && days <= 7,
            completedAt: r.completedAt || null
          };
        });

      all.sort((a, b) => {
        if (a.isOverdue && b.isOverdue) return a.daysUntil - b.daysUntil;
        if (a.isOverdue) return -1;
        if (b.isOverdue) return 1;
        if (a.isUrgent && !b.isUrgent) return -1;
        if (!a.isUrgent && b.isUrgent) return 1;
        return (a.daysUntil || 0) - (b.daysUntil || 0);
      });

      this.setData({
        allReminders: all,
        catTabs,
        loading: false
      });
      this._applyFilters();
    } catch (e) {
      console.error('[reminders] loadData error:', e);
      this.setData({ loading: false });
    }
  },

  // ── 按猫咪 + 状态筛选 ──
  _applyFilters() {
    const { allReminders, catFilter, statusFilter } = this.data;
    let filtered = catFilter === 'all'
      ? allReminders
      : allReminders.filter(r => r.catId === catFilter);

    // 进行中 = 未标记完成；已完成 = 已标记完成
    if (statusFilter === 'completed') {
      filtered = filtered.filter(r => r.completedAt);
    } else {
      filtered = filtered.filter(r => !r.completedAt);
    }

    const hasData = filtered.length > 0;
    // 已完成模式只显示已完成区块；进行中模式才分组展示
    var isCompletedMode = statusFilter === 'completed';
    const showOverdue = isCompletedMode ? [] : filtered.filter(r => r.isOverdue);
    const showUpcoming = isCompletedMode ? [] : filtered.filter(r => r.isUrgent && !r.isOverdue);
    const showFuture = isCompletedMode ? [] : filtered.filter(r => !r.isOverdue && !r.isUrgent);
    const showCompleted = isCompletedMode ? filtered : [];

    this.setData({
      overdueList: showOverdue,
      upcomingList: showUpcoming,
      futureList: showFuture,
      completedList: showCompleted,
      overdueCount: showOverdue.length,
      hasData
    });
  },

  // ── 切换状态筛选 ──
  onStatusFilterChange(e) {
    const status = e.currentTarget.dataset.status;
    if (status === this.data.statusFilter) return;
    this.setData({ statusFilter: status });
    this._applyFilters();
  },

  // ── 切换猫咪筛选 ──
  onCatFilterChange(e) {
    const catId = e.currentTarget.dataset.catid;
    if (catId === this.data.catFilter) return;
    this.setData({ catFilter: catId }, () => {
      this._applyFilters();
    });
  },

  // ── 标记完成 ──
  async markComplete(e) {
    const id = e.currentTarget.dataset.id;
    const confirmed = await new Promise(r =>
      wx.showModal({ title: '标记完成', content: '确认已完成本次提醒？', success: res => r(res.confirm) })
    );
    if (!confirmed) return;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    try {
      if (this.data.isLoggedIn && id && !id.startsWith('demo_')) {
        await clouddb.updateReminder(id, {
          lastDate: todayStr,
          completedAt: todayStr
        });
      }
      // 更新本地数据
      const all = this.data.allReminders.map(r => {
        if (r._id !== id) return r;
        const next = calcNextDate(todayStr, r.intervalDays);
        return {
          ...r,
          lastDate: todayStr,
          nextDate: next,
          daysUntil: getDaysUntil(next),
          isOverdue: false,
          isUrgent: true,
          completedAt: todayStr
        };
      });
      this.setData({ allReminders: all });
      this._applyFilters();
      wx.showToast({ title: '已标记完成', icon: 'success' });
    } catch (e) {
      console.error('[reminders] markComplete error:', e);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); },

  async addReminder() {
    const app = getApp();
    if (!app.isLoggedIn()) { this.goLogin(); return; }
    const cats = await clouddb.getCats();
    const alive = cats.filter(c => c.status !== 'passed_away');
    if (alive.length === 0) {
      wx.showToast({ title: '所有猫咪都已去喵星了', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/reminder-add/reminder-add' });
  },

  editReminder(e) {
    const app = getApp();
    if (!app.isLoggedIn()) { this.goLogin(); return; }
    wx.navigateTo({ url: `/pages/reminder-add/reminder-add?id=${e.currentTarget.dataset.id}` });
  },

  async deleteReminder(e) {
    const app = getApp();
    if (!app.isLoggedIn()) { this.goLogin(); return; }
    const confirmed = await new Promise(r =>
      wx.showModal({ title: '确认删除', content: '确定要删除这条提醒吗？', success: res => r(res.confirm) })
    );
    if (!confirmed) return;
    await clouddb.deleteReminder(e.currentTarget.dataset.id);
    this.loadData();
    wx.showToast({ title: '已删除', icon: 'success' });
  }
});
