// pages/reminders/reminders.js
// 提醒列表页：逾期/即将/未来分组 + 状态筛选
const clouddb = require('../../utils/clouddb.js');
const { reportError } = require('../../utils/error-log.js');
const { parseDate } = require('../../utils/util.js');
const { getInitialThemeData } = require('../../utils/themes.js');
const {
  SUBSCRIBE_TMPL_ID,
  getSubscribeState,
  getLatestNotifyResult,
  getAuthorizationCopy
} = require('../../utils/reminder-notifications.js');
const { confirmDangerousAction } = require('../../utils/util.js');
const { markPageLoaded, shouldRefreshPage } = require('../../utils/data-cache.js');
const initialTheme = getInitialThemeData();
const REMINDER_CACHE_TTL = 45 * 1000;

const REMINDER_TYPE_META = {
  bath: { label: '洗澡', iconPath: '/assets/icons/ui/bath.png' },
  deworm: { label: '驱虫', iconPath: '/assets/icons/ui/deworm.png' },
  vaccine: { label: '免疫', iconPath: '/assets/icons/ui/vaccine.png' },
  checkup: { label: '体检', iconPath: '/assets/icons/ui/checkup.png' },
  claw: { label: '修剪指甲', iconPath: '/assets/icons/ui/claw.png' },
  other: { label: '其他', iconPath: '/assets/icons/ui/other.png' }
};

function decorateReminder(reminder) {
  const meta = REMINDER_TYPE_META[reminder.type] || REMINDER_TYPE_META.other;
  return Object.assign({}, reminder, {
    _typeLabel: meta.label,
    _typeIconPath: meta.iconPath
  });
}

function calcNextDate(lastDate, intervalDays) {
  if (!lastDate || !intervalDays) return null;
  const d = parseDate(lastDate);
  d.setDate(d.getDate() + intervalDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((parseDate(dateStr) - new Date()) / 86400000);
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
  ].map(decorateReminder);

  return {
    allReminders: raw
  };
}

Page({
  data: {
    isOnline: true,
    themeClass: initialTheme.themeClass,
    themeKey: initialTheme.themeKey,
    themePrimary: initialTheme.themePrimary,
    themeSecondary: initialTheme.themeSecondary,
    overdueList: [],
    upcomingList: [],
    futureList: [],
    hasData: false,       // 当前是否有数据展示
    overdueCount: 0,
    loading: false,
    loadError: false,
    isLoggedIn: false,
    catTabs: [],
    catFilter: 'all',
    statusFilter: 'active', // 'active'|'overdue'|'completed'|'all'
    allReminders: [],
    batchMode: false,
    selectedReminderIds: [],
    batchOperating: false,
    deletingReminderId: '',
    notifyAuth: getAuthorizationCopy('unknown'),
    latestNotify: getLatestNotifyResult([]),
    checkingNotify: false,
    addFabX: 0,
    addFabY: 0,
    addFabMovingX: 0,
    addFabMovingY: 0
  },

  onShow() {
    const app = getApp();
    const activeTheme = app.applyTheme();
    this.setData({
      isOnline: app.globalData.isOnline,
      themeClass: activeTheme.className,
      themeKey: activeTheme.key,
      themePrimary: activeTheme.primary,
      themeSecondary: activeTheme.secondary
    });
    this._initAddFabPosition();
    const generatedFlag = wx.getStorageSync('reminderPlanGenerated');
    if (generatedFlag) {
      wx.removeStorageSync('reminderPlanGenerated');
    }
    this.setData({
      isLoggedIn: app.isLoggedIn(),
      statusFilter: generatedFlag ? 'active' : this.data.statusFilter,
      catFilter: generatedFlag ? 'all' : this.data.catFilter
    });
    if (app.isLoggedIn()) {
      if (generatedFlag || shouldRefreshPage('tab.reminders', ['cats', 'reminders'], REMINDER_CACHE_TTL)) {
        this.loadData();
      } else {
        this.refreshNotifyAuthorization();
      }
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

  _initAddFabPosition() {
    if (this._addFabInited) return;
    try {
      const info = wx.getSystemInfoSync();
      this._windowWidth = info.windowWidth || 375;
      this._windowHeight = info.windowHeight || 667;
      this.setData({
        addFabX: Math.max(this._windowWidth - 74, 0),
        addFabY: Math.max(this._windowHeight - 210, 120),
        addFabMovingX: Math.max(this._windowWidth - 74, 0),
        addFabMovingY: Math.max(this._windowHeight - 210, 120)
      });
      this._addFabInited = true;
    } catch (e) {}
  },

  onAddFabMove(e) {
    if (!e.detail || e.detail.source !== 'touch') return;
    this._addFabMovingX = e.detail.x;
    this._addFabMovingY = e.detail.y;
  },

  onAddFabRelease() {
    const windowWidth = this._windowWidth || 375;
    const x = this._addFabMovingX || this.data.addFabX || 0;
    const y = this._addFabMovingY || this.data.addFabY || 0;
    const snappedX = x > windowWidth / 2 ? Math.max(windowWidth - 74, 0) : 16;
    this.setData({ addFabX: snappedX, addFabY: y });
  },

  async loadData() {
    this.setData({ loading: true, loadError: false });
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
          return decorateReminder({
            ...r,
            catName: catNameMap[r.catId] || r.catName || '',
            nextDate: next || '未设置',
            daysUntil: days,
            isOverdue: days !== null && days < 0,
            isUrgent: days !== null && days >= 0 && days <= 7,
            completedAt: r.completedAt || null
          });
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
        loading: false,
        latestNotify: getLatestNotifyResult(all)
      });
      this._applyFilters();
      markPageLoaded('tab.reminders', ['cats', 'reminders']);
      this.refreshNotifyAuthorization();
    } catch (e) {
      reportError('reminders.loadData', e);
      this.setData({ loading: false, loadError: true });
    }
  },

  retryLoad() { this.loadData(); },

  refreshNotifyAuthorization() {
    if (!wx.getSetting) return;
    this.setData({ checkingNotify: true });
    wx.getSetting({
      withSubscriptions: true,
      success: res => {
        this.setData({
          notifyAuth: getAuthorizationCopy(getSubscribeState(res)),
          checkingNotify: false
        });
      },
      fail: () => this.setData({ checkingNotify: false })
    });
  },

  requestNotifyAuthorization() {
    if (!SUBSCRIBE_TMPL_ID || !wx.requestSubscribeMessage) return;
    wx.requestSubscribeMessage({
      tmplIds: [SUBSCRIBE_TMPL_ID],
      complete: () => this.refreshNotifyAuthorization()
    });
  },

  openNotifySettings() {
    if (!wx.openSetting) return;
    wx.openSetting({ withSubscriptions: true, complete: () => this.refreshNotifyAuthorization() });
  },

  onNotifyAction() {
    if (this.data.notifyAuth.status === 'success' || this.data.notifyAuth.status === 'disabled') {
      this.openNotifySettings();
      return;
    }
    this.requestNotifyAuthorization();
  },

  // ── 按宠物 + 状态筛选 ──
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
    const selectedIds = this.data.selectedReminderIds || [];
    const markSelected = list => list.map(item => Object.assign({}, item, {
      _selected: selectedIds.indexOf(item._id) !== -1
    }));

    this.setData({
      overdueList: markSelected(showOverdue),
      upcomingList: markSelected(showUpcoming),
      futureList: markSelected(showFuture),
      completedList: markSelected(showCompleted),
      overdueCount: showOverdue.length,
      hasData
    });
  },

  // ── 切换状态筛选 ──
  onStatusFilterChange(e) {
    const status = e.currentTarget.dataset.status;
    if (status === this.data.statusFilter) return;
    this.setData({ statusFilter: status, batchMode: false, selectedReminderIds: [] });
    this._applyFilters();
  },

  // ── 切换宠物筛选 ──
  onCatFilterChange(e) {
    const catId = e.currentTarget.dataset.catid;
    if (catId === this.data.catFilter) return;
    this.setData({ catFilter: catId, batchMode: false, selectedReminderIds: [] }, () => {
      this._applyFilters();
    });
  },

  toggleBatchMode() {
    this.setData({
      batchMode: !this.data.batchMode,
      selectedReminderIds: []
    }, () => this._applyFilters());
  },

  toggleReminderSelection(e) {
    if (!this.data.batchMode || this.data.batchOperating) return;
    const id = e.currentTarget.dataset.id;
    const selected = (this.data.selectedReminderIds || []).slice();
    const index = selected.indexOf(id);
    if (index === -1) selected.push(id);
    else selected.splice(index, 1);
    this.setData({ selectedReminderIds: selected }, () => this._applyFilters());
  },

  selectAllVisible() {
    const visible = []
      .concat(this.data.overdueList || [])
      .concat(this.data.upcomingList || [])
      .concat(this.data.futureList || [])
      .concat(this.data.completedList || []);
    const ids = visible.map(item => item._id);
    const allSelected = ids.length > 0 && ids.every(id => this.data.selectedReminderIds.indexOf(id) !== -1);
    this.setData({ selectedReminderIds: allSelected ? [] : ids }, () => this._applyFilters());
  },

  async batchDeleteReminders() {
    const ids = this.data.selectedReminderIds || [];
    if (!ids.length || this.data.batchOperating) return;
    const confirmed = await confirmDangerousAction({
      title: '批量删除提醒',
      content: `确定删除选中的 ${ids.length} 条提醒吗？删除后无法恢复。`,
      secondContent: `将永久删除这 ${ids.length} 条提醒，请再次确认。`
    });
    if (!confirmed) return;
    this.setData({ batchOperating: true });
    try {
      await Promise.all(ids.filter(id => !id.startsWith('demo_')).map(id => clouddb.deleteReminder(id)));
      this.setData({ batchMode: false, selectedReminderIds: [] });
      await this.loadData();
      wx.showToast({ title: '已批量删除', icon: 'success' });
    } catch (e) {
      console.error('[reminders] batch delete error:', e);
      wx.showToast({ title: '批量删除失败', icon: 'none' });
    } finally {
      this.setData({ batchOperating: false });
    }
  },

  async batchCompleteReminders() {
    const ids = this.data.selectedReminderIds || [];
    if (!ids.length || this.data.batchOperating || this.data.statusFilter === 'completed') return;
    const confirmed = await new Promise(resolve => wx.showModal({
      title: '批量完成提醒',
      content: `确认已完成选中的 ${ids.length} 项照护吗？`,
      confirmText: '确认完成',
      success: result => resolve(result.confirm)
    }));
    if (!confirmed) return;
    const shouldCreateNext = await new Promise(resolve => wx.showModal({
      title: '生成下次提醒',
      content: '是否按各自的当前间隔生成下一周期提醒？',
      confirmText: '全部生成',
      cancelText: '不生成',
      success: result => resolve(result.confirm)
    }));
    const execute = () => this._doBatchComplete(ids, shouldCreateNext);
    if (shouldCreateNext && SUBSCRIBE_TMPL_ID) {
      wx.requestSubscribeMessage({ tmplIds: [SUBSCRIBE_TMPL_ID], complete: execute });
    } else {
      execute();
    }
  },

  async _doBatchComplete(ids, shouldCreateNext) {
    this.setData({ batchOperating: true });
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    try {
      const selected = this.data.allReminders.filter(reminder => ids.indexOf(reminder._id) !== -1);
      for (let index = 0; index < selected.length; index++) {
        const reminder = selected[index];
        if (reminder._id.startsWith('demo_')) continue;
        await clouddb.updateReminder(reminder._id, { lastDate: todayStr, completedAt: todayStr });
        if (shouldCreateNext) {
          await clouddb.addReminder({
            _id: `rem_${Date.now()}_${index}`,
            catId: reminder.catId,
            catName: reminder.catName,
            type: reminder.type,
            lastDate: todayStr,
            intervalDays: reminder.intervalDays,
            note: reminder.note || '',
            previousReminderId: reminder._id
          });
        }
      }
      this.setData({ batchMode: false, selectedReminderIds: [] });
      await this.loadData();
      wx.showToast({ title: shouldCreateNext ? '已完成并生成下次' : '已批量完成', icon: 'success' });
    } catch (e) {
      console.error('[reminders] batch complete error:', e);
      wx.showToast({ title: '批量操作失败', icon: 'none' });
    } finally {
      this.setData({ batchOperating: false });
    }
  },

  // ── 标记完成 ──
  async markComplete(e) {
    const id = e.currentTarget.dataset.id;
    const confirmed = await new Promise(r =>
      wx.showModal({ title: '标记完成', content: '确认已完成本次提醒？', success: res => r(res.confirm) })
    );
    if (!confirmed) return;

    const shouldCreateNext = await new Promise(r =>
      wx.showModal({
        title: '生成下次提醒',
        content: '是否按当前间隔生成下一次提醒？',
        confirmText: '生成',
        cancelText: '不生成',
        success: res => r(res.confirm)
      })
    );

    // 只有生成下一次提醒时才请求订阅授权；授权与否不影响完成本次提醒。
    const doMark = () => { this._doMarkComplete(id, shouldCreateNext); };
    if (shouldCreateNext && SUBSCRIBE_TMPL_ID) {
      wx.requestSubscribeMessage({
        tmplIds: [SUBSCRIBE_TMPL_ID],
        complete: doMark
      });
    } else {
      doMark();
    }
  },

  async _doMarkComplete(id, shouldCreateNext) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    try {
      const currentReminder = this.data.allReminders.find(r => r._id === id);
      if (!currentReminder) return;
      const nextReminderId = 'rem_' + Date.now();

      if (this.data.isLoggedIn && id && !id.startsWith('demo_')) {
        await clouddb.updateReminder(id, {
          lastDate: todayStr,
          completedAt: todayStr
        });
        if (shouldCreateNext) {
          await clouddb.addReminder({
            _id: nextReminderId,
            catId: currentReminder.catId,
            catName: currentReminder.catName,
            type: currentReminder.type,
            lastDate: todayStr,
            intervalDays: currentReminder.intervalDays,
            note: currentReminder.note || '',
            previousReminderId: id
          });
        }
      }
      const completedAll = this.data.allReminders.map(r => {
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
      const next = calcNextDate(todayStr, currentReminder.intervalDays);
      const daysUntil = getDaysUntil(next);
      const nextReminder = {
        ...currentReminder,
        _id: nextReminderId,
        lastDate: todayStr,
        nextDate: next,
        daysUntil,
        isOverdue: false,
        isUrgent: daysUntil !== null && daysUntil <= 7,
        completedAt: null,
        previousReminderId: id
      };
      const all = shouldCreateNext && !id.startsWith('demo_') ? [nextReminder, ...completedAll] : completedAll;
      this.setData({ allReminders: all });
      this._applyFilters();
      wx.showToast({ title: shouldCreateNext ? '已生成下次提醒' : '已标记完成', icon: 'success' });
    } catch (e) {
      console.error('[reminders] markComplete error:', e);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); },

  goReminderPlan() {
    const app = getApp();
    if (!app.isLoggedIn()) { this.goLogin(); return; }
    const catId = this.data.catFilter && this.data.catFilter !== 'all' ? this.data.catFilter : '';
    wx.navigateTo({ url: catId ? `/pages/reminder-plan/reminder-plan?catId=${catId}` : '/pages/reminder-plan/reminder-plan' });
  },

  async addReminder() {
    const app = getApp();
    if (!app.isLoggedIn()) { this.goLogin(); return; }
    const cats = await clouddb.getCats();
    const alive = cats.filter(c => c.status !== 'passed_away');
    if (alive.length === 0) {
      wx.showToast({ title: '所有宠物都已经离世了', icon: 'none' });
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
    const id = e.currentTarget.dataset.id;
    if (!id || this.data.deletingReminderId) return;
    const confirmed = await confirmDangerousAction({
      title: '删除提醒',
      content: '确定要删除这条提醒吗？',
      secondContent: '删除后不会再发送这条提醒，且无法恢复。'
    });
    if (!confirmed) return;
    this.setData({ deletingReminderId: id });
    try {
      await clouddb.deleteReminder(id);
      await this.loadData();
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (error) {
      reportError('reminders.delete', error, { reminderId: id });
      wx.showToast({ title: '删除失败，请重试', icon: 'none' });
    } finally {
      this.setData({ deletingReminderId: '' });
    }
  },

  async onPullDownRefresh() {
    try { await this.loadData(); } finally { wx.stopPullDownRefresh(); }
  },

  onShareAppMessage() {
    const current = this.data.catTabs.find(cat => cat._id === this.data.catFilter);
    const title = current ? `一起管理${current.name}的照护提醒` : '把宠物的重要照护安排得更清楚';
    return { imageUrl: '/assets/logo.png', title, path: '/pages/reminders/reminders' };
  },
});
