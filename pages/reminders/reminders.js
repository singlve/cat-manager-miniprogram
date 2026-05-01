// pages/reminders/reminders.js
// 提醒列表页：逾期/即将/未来分组
const clouddb = require('../../utils/clouddb.js');

function calcNextDate(lastDate, intervalDays) {
  if (!lastDate || !intervalDays) return null;
  const d = new Date(lastDate);
  d.setDate(d.getDate() + intervalDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / (86400000));
}

function getTypeIcon(type) {
  const icons = { bath: '🛁', deworm: '💊', vaccine: '💉', checkup: '🩺' };
  return icons[type] || '📌';
}

function getTypeLabel(type) {
  const labels = { bath: '洗澡', deworm: '驱虫', vaccine: '免疫', checkup: '体检' };
  return labels[type] || '其他';
}

// ─── Demo 数据（未登录时展示） ───
function getDemoReminders() {
  const today = new Date();
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // 逾期 5 天
  const overdueLast = new Date(today);
  overdueLast.setDate(overdueLast.getDate() - 35);
  const overdueNext = calcNextDate(fmt(overdueLast), 30);

  // 即将到期 3 天
  const upcomingLast = new Date(today);
  upcomingLast.setDate(upcomingLast.getDate() - 27);
  const upcomingNext = calcNextDate(fmt(upcomingLast), 30);

  // 未来 20 天
  const futureLast = new Date(today);
  futureLast.setDate(futureLast.getDate() - 10);
  const futureNext = calcNextDate(fmt(futureLast), 30);

  const raw = [
    { _id: 'demo_1', catId: 'demo_1', catName: '橘座', type: 'deworm', lastDate: fmt(overdueLast), intervalDays: 30, nextDate: overdueNext, daysUntil: getDaysUntil(overdueNext), isOverdue: true, isUrgent: false, note: '使用体内驱虫药' },
    { _id: 'demo_2', catId: 'demo_2', catName: '雪球', type: 'vaccine', lastDate: fmt(upcomingLast), intervalDays: 30, nextDate: upcomingNext, daysUntil: getDaysUntil(upcomingNext), isOverdue: false, isUrgent: true, note: '猫三联疫苗' },
    { _id: 'demo_3', catId: 'demo_1', catName: '橘座', type: 'bath', lastDate: fmt(futureLast), intervalDays: 30, nextDate: futureNext, daysUntil: getDaysUntil(futureNext), isOverdue: false, isUrgent: false, note: '' }
  ];

  return {
    overdueList: raw.filter(r => r.isOverdue),
    upcomingList: raw.filter(r => r.isUrgent && !r.isOverdue),
    futureList: raw.filter(r => !r.isOverdue && !r.isUrgent),
    allReminders: raw
  };
}

Page({
  data: {
    overdueList: [],
    upcomingList: [],
    futureList: [],
    overdueCount: 0,
    loading: false,
    isLoggedIn: false,
    catTabs: [],        // 猫咪筛选标签 [{ _id, name }]
    catFilter: 'all',   // 当前筛选：'all' | catId
    allReminders: []    // 未筛选的全部提醒（用于切换标签时快速过滤）
  },

  onShow() {
    const app = getApp();
    this.setData({ isLoggedIn: app.isLoggedIn() });
    if (app.isLoggedIn()) {
      this.loadData();
    } else {
      // 未登录时展示 demo 数据
      const demo = getDemoReminders();
      this.setData({
        overdueList: demo.overdueList,
        upcomingList: demo.upcomingList,
        futureList: demo.futureList,
        overdueCount: demo.overdueList.length,
        allReminders: demo.allReminders,
        catTabs: [{ _id: 'demo_1', name: '橘座' }, { _id: 'demo_2', name: '雪球' }],
        catFilter: 'all',
        loading: false
      });
    }
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [cats, reminders] = await Promise.all([
        clouddb.getCats(),
        clouddb.getReminders()
      ]);

      // 构建猫咪筛选标签（仅身边的猫）
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

      // 过滤掉已去喵星猫咪的提醒
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
            isUrgent: days !== null && days >= 0 && days <= 7
          };
        });

      // 排序
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
      this._applyCatFilter();
    } catch (e) {
      console.error('[reminders] loadData error:', e);
      this.setData({ loading: false });
    }
  },

  // ─── 按猫咪筛选 + 分组 ───
  _applyCatFilter() {
    const { allReminders, catFilter } = this.data;
    const filtered = catFilter === 'all'
      ? allReminders
      : allReminders.filter(r => r.catId === catFilter);

    this.setData({
      overdueList: filtered.filter(r => r.isOverdue),
      upcomingList: filtered.filter(r => r.isUrgent && !r.isOverdue),
      futureList: filtered.filter(r => !r.isOverdue && !r.isUrgent),
      overdueCount: filtered.filter(r => r.isOverdue).length
    });
  },

  // ─── 切换猫咪筛选 ───
  onCatFilterChange(e) {
    const catId = e.currentTarget.dataset.catid;
    if (catId === this.data.catFilter) return;
    this.setData({ catFilter: catId }, () => {
      if (this.data.isLoggedIn) {
        this._applyCatFilter();
      } else {
        // demo 模式：直接从 allReminders 筛选
        const { allReminders, catFilter: cf } = this.data;
        const filtered = cf === 'all'
          ? allReminders
          : allReminders.filter(r => r.catId === cf);
        this.setData({
          overdueList: filtered.filter(r => r.isOverdue),
          upcomingList: filtered.filter(r => r.isUrgent && !r.isOverdue),
          futureList: filtered.filter(r => !r.isOverdue && !r.isUrgent),
          overdueCount: filtered.filter(r => r.isOverdue).length
        });
      }
    });
  },

  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); },

  async addReminder() {
    const app = getApp();
    if (!app.isLoggedIn()) { this.goLogin(); return; }
    // 检查是否有身边猫咪可添加提醒
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
