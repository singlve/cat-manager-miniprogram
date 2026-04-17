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

Page({
  data: {
    overdueList: [],
    upcomingList: [],
    futureList: [],
    overdueCount: 0,
    loading: false
  },

  onShow() { this.loadData(); },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [cats, reminders] = await Promise.all([
        clouddb.getCats(),
        clouddb.getReminders()
      ]);

      const catNameMap = {};
      cats.forEach(c => { catNameMap[c._id] = c.name; });

      const all = reminders.map(r => {
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
        overdueList: all.filter(r => r.isOverdue),
        upcomingList: all.filter(r => r.isUrgent && !r.isOverdue),
        futureList: all.filter(r => !r.isOverdue && !r.isUrgent),
        overdueCount: all.filter(r => r.isOverdue).length,
        loading: false
      });
    } catch (e) {
      console.error('[reminders] loadData error:', e);
      this.setData({ loading: false });
    }
  },

  addReminder() { wx.navigateTo({ url: '/pages/reminder-add/reminder-add' }); },

  editReminder(e) {
    wx.navigateTo({ url: `/pages/reminder-add/reminder-add?id=${e.currentTarget.dataset.id}` });
  },

  async deleteReminder(e) {
    const confirmed = await new Promise(r =>
      wx.showModal({ title: '确认删除', content: '确定要删除这条提醒吗？', success: res => r(res.confirm) })
    );
    if (!confirmed) return;
    await clouddb.deleteReminder(e.currentTarget.dataset.id);
    this.loadData();
    wx.showToast({ title: '已删除', icon: 'success' });
  }
});
